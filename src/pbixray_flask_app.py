#!/usr/bin/env python3
import asyncio
import ast
import json
import logging
import os
import re
import socket
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.request
import uuid
from typing import Any, Iterator

logger = logging.getLogger(__name__)
if not logger.handlers and not logging.root.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
_dax_log = os.environ.get("DAX_LOG_LEVEL", "INFO").upper()
logger.setLevel(getattr(logging, _dax_log, logging.INFO))
_ollama_singleflight_lock = threading.Semaphore(1)


def _log_flush(msg: str, *args: object) -> None:
    """Flush streams so logs appear while another thread is blocked on Ollama."""
    logger.info(msg, *args)
    for stream in (sys.stderr, sys.stdout):
        try:
            stream.flush()
        except Exception:
            pass


def _truncate_dax_text(text: str, max_len: int, label: str, req_id: str) -> str:
    """max_len <= 0 means no limit."""
    if max_len <= 0 or len(text) <= max_len:
        return text
    logger.warning(
        "[dax] req_id=%s truncating %s %d -> %d chars (0 = unlimited for that field)",
        req_id,
        label,
        len(text),
        max_len,
    )
    return text[:max_len] + "\n\n[... truncated by server; set DAX_MAX_* env to 0 or raise limit ...]"


def _friendly_ollama_error(exc: Exception, base_url: str, model: str | None = None) -> str:
    """Return a short, actionable message for common Ollama connection failures."""
    original = str(exc)
    lowered = original.lower()
    model_hint = f" and pull model `{model}`" if model else ""

    if isinstance(exc, urllib.error.URLError):
        reason = exc.reason
        if isinstance(reason, ConnectionRefusedError):
            return f"Cannot reach Ollama at {base_url}. Start Ollama with `ollama serve`" f"{model_hint}, then retry."
        if isinstance(reason, socket.timeout):
            return f"Ollama request timed out at {base_url}. Try again or use a smaller model."

    if "connection refused" in lowered or "winerror 10061" in lowered:
        return f"Cannot reach Ollama at {base_url}. Start Ollama with `ollama serve`" f"{model_hint}, then retry."
    if "timed out" in lowered:
        return f"Ollama request timed out at {base_url}. Try again or use a smaller model."

    return f"Ollama request failed at {base_url}: {original}"


from flask import Flask, Response, jsonify, redirect, render_template, request, stream_with_context
from flask_cors import CORS
from mcp import StdioServerParameters
from mcp.client.session import ClientSession
from mcp.client.stdio import stdio_client
from storytelling.ollama_story import build_story_context

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://127.0.0.1:3000",
                "http://localhost:3000",
                "http://127.0.0.1:3001",
                "http://localhost:3001",
                "http://127.0.0.1:3002",
                "http://localhost:3002",
            ]
        }
    },
)


# ---------------------------------------------------------------------------
# Enum maps: PBIXRay returns integers for Cardinality / CrossFilteringBehavior.
# We map them to readable labels for the Documentation panel.
# ---------------------------------------------------------------------------
CARDINALITY_MAP = {0: "None", 1: "One", 2: "Many"}
DIRECTION_MAP = {1: "Single", 2: "Both", 3: "Automatic"}


def _readable_enum(value: Any, mapping: dict[int, str], default: str = "Not available") -> str:
    """Convert an int / str / None into a human label using mapping."""
    if value is None or value == "":
        return default
    try:
        return mapping.get(int(value), str(value))
    except (ValueError, TypeError):
        return str(value)


def normalize_tables(tables_obj: Any) -> list[str]:
    if tables_obj is None:
        return []
    if hasattr(tables_obj, "tolist"):
        values = tables_obj.tolist()
        return [str(v) for v in values]
    return [str(v) for v in tables_obj]


def normalize_statistics(stats_obj: Any) -> list[dict[str, Any]]:
    if stats_obj is None:
        return []
    if hasattr(stats_obj, "to_dict"):
        return stats_obj.to_dict(orient="records")
    if isinstance(stats_obj, list):
        return stats_obj
    return []


def _columns_by_table(stats_rows: list[dict[str, Any]]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for row in stats_rows:
        t = str(row.get("TableName") or "").strip()
        c = str(row.get("ColumnName") or "").strip()
        if not t or not c:
            continue
        out.setdefault(t, []).append(c)
    for t in out:
        out[t] = sorted(set(out[t]))
    return out


def _table_roles(
    tables: list[str],
    relationships: list[str],
    relationships_rows: Any = None,
) -> list[dict[str, str]]:
    """
    Determine whether each table is a dimension or fact.

    Strategy (in priority order):
    1. Naming convention: dim*, d_* = dimension; fact*, f_* = fact; *date*, *calendar* = dimension
    2. Relationship direction: a table that only appears on the "To" side (the "one" side /
       lookup side) of relationships is a dimension; tables on the "From" side (many side)
       are facts. This fixes the bug where Gender, AgeGroup, Ethnicity etc. were labeled
       "fact" because the old heuristic only checked the "from" side.
    3. Fallback: if no relationships mention the table, default to "dimension".
    """
    # Build sets of tables that appear on each side of relationships.
    from_tables: set[str] = set()
    to_tables: set[str] = set()

    if isinstance(relationships_rows, list):
        for row in relationships_rows:
            if not isinstance(row, dict):
                continue
            ft = str(row.get("FromTableName") or "").strip()
            tt = str(row.get("ToTableName") or "").strip()
            if ft:
                from_tables.add(ft)
            if tt:
                to_tables.add(tt)
    else:
        # Fallback: parse the text-based relationship lines "Table[col] → Table[col]"
        for line in relationships:
            parts = line.split("→")
            if len(parts) == 2:
                left = parts[0].strip().split("[")[0].strip()
                right = parts[1].strip().split("[")[0].strip()
                if left:
                    from_tables.add(left)
                if right:
                    to_tables.add(right)

    roles: list[dict[str, str]] = []
    for table in tables:
        lower = table.lower()
        # 1. Naming convention (highest priority)
        if lower.startswith(("dim", "d_")):
            role = "dimension"
        elif lower.startswith(("fact", "f_")):
            role = "fact"
        elif "date" in lower or "calendar" in lower:
            role = "dimension"
        else:
            # 2. Relationship-based heuristic
            is_from = table in from_tables  # appears as the "many" / FK side
            is_to = table in to_tables  # appears as the "one" / lookup side

            if is_to and not is_from:
                # Only on the lookup side → dimension (e.g. Gender, AgeGroup, Ethnicity)
                role = "dimension"
            elif is_from and not is_to:
                # Only on the FK side → fact
                role = "fact"
            elif is_from and is_to:
                # Appears on both sides → likely a bridge or snowflake dim; lean fact
                role = "fact"
            else:
                # No relationships mention this table → default dimension
                role = "dimension"

        roles.append({"table": table, "role": role})
    return roles


def _key_columns(schema_rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    key_like: list[dict[str, str]] = []
    for row in schema_rows:
        table = str(row.get("TableName") or "").strip()
        column = str(row.get("ColumnName") or "").strip()
        dtype = str(row.get("PandasDataType") or row.get("DataType") or "").strip()
        lower = column.lower()
        if not (table and column):
            continue
        if lower.endswith("id") or "key" in lower or "date" in lower or lower in {"id", "pk", "fk"}:
            key_like.append({"table": table, "column": column, "data_type": dtype})
    return key_like


def _build_raw_context(
    file_name: str,
    tables: list[str],
    columns: dict[str, list[str]],
    measures: list[str],
    relationships: list[str],
    story_context: dict[str, Any],
) -> str:
    lines: list[str] = []
    lines.append(f"File: {file_name}")
    lines.append(f"Tables: {', '.join(tables)}")
    if columns:
        lines.append("Columns by table:")
        for t in sorted(columns.keys()):
            cols = columns[t]
            parts = [f"{t}[{c}]" for c in cols[:80]]
            extra = ""
            if len(cols) > 80:
                extra = f" ... (+{len(cols) - 80} more columns)"
            lines.append(f"  {t}: {', '.join(parts)}{extra}")
    if measures:
        lines.append("Measures: " + ", ".join(measures[:200]))
        if len(measures) > 200:
            lines.append(f"  ... (+{len(measures) - 200} more measures)")
    if relationships:
        lines.append("Relationships:")
        for rel in relationships[:100]:
            lines.append(f"  {rel}")
    lines.append("")
    lines.append("Story / stats summary (JSON):")
    lines.append(json.dumps(story_context, ensure_ascii=True))
    return "\n".join(lines)


def summarize(stats_rows: list[dict[str, Any]]) -> dict[str, Any]:
    total_size = 0
    total_dictionary = 0
    total_hash_index = 0

    for row in stats_rows:
        total_size += int(row.get("DataSize", 0) or 0)
        total_dictionary += int(row.get("Dictionary", 0) or 0)
        total_hash_index += int(row.get("HashIndex", 0) or 0)

    top_size = sorted(stats_rows, key=lambda r: int(r.get("DataSize", 0) or 0), reverse=True)[:15]
    top_cardinality = sorted(stats_rows, key=lambda r: int(r.get("Cardinality", 0) or 0), reverse=True)[:15]

    return {
        "total_columns": len(stats_rows),
        "total_data_size": total_size,
        "total_dictionary": total_dictionary,
        "total_hash_index": total_hash_index,
        "top_size": top_size,
        "top_cardinality": top_cardinality,
    }


def _mcp_text(result: Any) -> str:
    if result is None:
        return ""
    content = getattr(result, "content", None) or []
    texts: list[str] = []
    for item in content:
        text = getattr(item, "text", None)
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
    return "\n".join(texts).strip()


def _mcp_parse_json(text: str, fallback: Any) -> Any:
    if not text:
        return fallback
    stripped = text.strip()
    if stripped.lower().startswith("error:"):
        raise RuntimeError(stripped)
    try:
        return json.loads(stripped)
    except Exception:
        return fallback


def _coerce_tables(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, tuple):
        return [str(v) for v in value]
    if isinstance(value, str):
        s = value.strip()
        if s.startswith("Index(") and "[" in s and "]" in s:
            inner = s[s.find("[") : s.rfind("]") + 1]
            try:
                parsed = ast.literal_eval(inner)
                if isinstance(parsed, list):
                    return [str(v) for v in parsed]
            except Exception:
                pass
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = ast.literal_eval(s)
                if isinstance(parsed, list):
                    return [str(v) for v in parsed]
            except Exception:
                pass
    return []


def _mcp_measure_names(measures_rows: Any) -> list[str]:
    if not isinstance(measures_rows, list):
        return []
    out: list[str] = []
    for row in measures_rows:
        if not isinstance(row, dict):
            continue
        table_name = str(row.get("TableName") or "").strip()
        measure_name = str(row.get("Name") or "").strip()
        if table_name and measure_name:
            out.append(f"{table_name}[{measure_name}]")
        elif measure_name:
            out.append(measure_name)
    return sorted(set(out))


def _mcp_relationship_lines(relationships_rows: Any) -> list[str]:
    """Build short readable text lines for the raw context (used by Ollama prompts)."""
    if not isinstance(relationships_rows, list):
        return []
    lines: list[str] = []
    for row in relationships_rows:
        if not isinstance(row, dict):
            continue
        from_table = str(row.get("FromTableName") or "").strip()
        from_column = str(row.get("FromColumnName") or "").strip()
        to_table = str(row.get("ToTableName") or "").strip()
        to_column = str(row.get("ToColumnName") or "").strip()
        if not (from_table and from_column and to_table and to_column):
            continue
        is_active = bool(row.get("IsActive", True))
        suffix = "" if is_active else " (inactive)"
        lines.append(f"{from_table}[{from_column}] → {to_table}[{to_column}]{suffix}")
    return lines


def _extract_sources_from_rows(power_query_rows: Any, metadata_rows: Any) -> list[str]:
    sources: set[str] = set()
    if isinstance(power_query_rows, list):
        for row in power_query_rows:
            if not isinstance(row, dict):
                continue
            expr = str(row.get("Expression") or "")
            if not expr:
                continue
            patterns = [
                r'Sql\.Database\(\s*"([^"]+)"\s*,\s*"([^"]+)"',
                r'Oracle\.Database\(\s*"([^"]+)"',
                r'Snowflake\.Databases\(\s*"([^"]+)"',
                r'PostgreSQL\.Database\(\s*"([^"]+)"\s*,\s*"([^"]+)"',
                r'MySQL\.Database\(\s*"([^"]+)"\s*,\s*"([^"]+)"',
                r'Excel\.Workbook\(\s*File\.Contents\(\s*"([^"]+)"',
                r'Csv\.Document\(\s*File\.Contents\(\s*"([^"]+)"',
                r'Web\.Contents\(\s*"([^"]+)"',
                r'SharePoint\.Files\(\s*"([^"]+)"',
                r'SharePoint\.Contents\(\s*"([^"]+)"',
                r'OData\.Feed\(\s*"([^"]+)"',
            ]
            for pattern in patterns:
                for match in re.findall(pattern, expr, flags=re.IGNORECASE):
                    if isinstance(match, tuple):
                        value = " / ".join(str(v).strip() for v in match if str(v).strip())
                    else:
                        value = str(match).strip()
                    if value:
                        sources.add(value)
    if isinstance(metadata_rows, list):
        for row in metadata_rows:
            if not isinstance(row, dict):
                continue
            name = str(row.get("Name") or "").lower()
            value = str(row.get("Value") or "").strip()
            if value and any(k in name for k in ("source", "server", "database", "provider", "connection")):
                sources.add(value)
    # Post-process: make raw connection strings more readable
    cleaned: set[str] = set()
    for s in sources:
        # "." is SQL Server shorthand for localhost
        s = re.sub(r"^\.\s*/\s*", "localhost / ", s)
        # "(local)" is another SQL Server localhost alias
        s = re.sub(r"^\(local\)\s*/\s*", "localhost / ", s, flags=re.IGNORECASE)
        # Format "server / database" into a cleaner label
        parts = [p.strip() for p in s.split(" / ")]
        if len(parts) == 2:
            server, database = parts
            s = f"{server} (database: {database})"
        cleaned.add(s)
    return sorted(cleaned)


def _dax_measure_docs_from_rows(measures_rows: Any) -> list[dict[str, Any]]:
    if not isinstance(measures_rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in measures_rows:
        if not isinstance(row, dict):
            continue
        table = str(row.get("TableName") or "").strip()
        name = str(row.get("Name") or "").strip()
        formula = str(row.get("Expression") or "").strip()
        if not name:
            continue
        measure_ref = f"{table}[{name}]" if table else name
        dependencies: list[str] = []
        for dep in re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\[([^\]]+)\]", formula):
            dependencies.append(f"{dep[0]}[{dep[1]}]")
        out.append(
            {
                "name": name,
                "table": table,
                "reference": measure_ref,
                "formula": formula,
                "business_meaning": "Business meaning is not explicitly stored in PBIX metadata.",
                "dependencies": sorted(set(dependencies)),
            }
        )
    return out


def _dax_column_docs_from_rows(dax_columns_rows: Any) -> list[dict[str, Any]]:
    if not isinstance(dax_columns_rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in dax_columns_rows:
        if not isinstance(row, dict):
            continue
        table = str(row.get("TableName") or "").strip()
        name = str(row.get("ColumnName") or row.get("Name") or "").strip()
        formula = str(row.get("Expression") or "").strip()
        if not (table and name):
            continue
        out.append({"table": table, "name": name, "reference": f"{table}[{name}]", "formula": formula})
    return out


def _m_parameters_docs_from_rows(m_parameters_rows: Any) -> list[dict[str, Any]]:
    if not isinstance(m_parameters_rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in m_parameters_rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("Name") or "").strip()
        if not name:
            continue
        current = row.get("CurrentValue")
        required = row.get("IsRequired")
        typ = row.get("Type")
        desc = row.get("Description")
        out.append(
            {
                "name": name,
                "current_value": "" if current is None else str(current),
                "type": "" if typ is None else str(typ),
                "is_required": bool(required) if required is not None else False,
                "description": "" if desc is None else str(desc),
            }
        )
    return out


def _relationship_details_from_rows(relationships_rows: Any) -> list[dict[str, Any]]:
    """
    Build human-readable relationship records for the Documentation UI.

    PBIXRay returns Cardinality / CrossFilteringBehavior as integer codes,
    so we map them to labels. We handle both the newer FromCardinality /
    ToCardinality split and the legacy single Cardinality column.
    """
    if not isinstance(relationships_rows, list):
        return []

    details: list[dict[str, Any]] = []
    for row in relationships_rows:
        if not isinstance(row, dict):
            continue

        from_card = row.get("FromCardinality")
        to_card = row.get("ToCardinality")
        legacy_card = row.get("Cardinality")

        if from_card is not None or to_card is not None:
            cardinality = (
                f"{_readable_enum(from_card, CARDINALITY_MAP, '?')}" f":{_readable_enum(to_card, CARDINALITY_MAP, '?')}"
            )
        elif legacy_card is not None:
            cardinality = _readable_enum(legacy_card, CARDINALITY_MAP)
        else:
            cardinality = "Not available"

        direction = _readable_enum(row.get("CrossFilteringBehavior"), DIRECTION_MAP)

        details.append(
            {
                "from": f"{row.get('FromTableName')}[{row.get('FromColumnName')}]",
                "to": f"{row.get('ToTableName')}[{row.get('ToColumnName')}]",
                "cardinality": cardinality,
                "direction": direction,
                "active": bool(row.get("IsActive", True)),
            }
        )
    return details


def _normalize_rls_from_mcp(rls_data: Any) -> dict[str, Any]:
    """
    Convert the MCP get_rls_roles response into a UI-friendly shape.
    Input:  { "has_rls": bool, "details": [ {source, count, entries}, ... ] }
    Output: { "has_rls": bool, "details": ["source: N entries", ...] }
    """
    if not isinstance(rls_data, dict):
        return {"has_rls": False, "details": []}

    raw_details = rls_data.get("details", []) or []
    detail_strings: list[str] = []
    for d in raw_details:
        if isinstance(d, dict):
            src = d.get("source", "unknown")
            count = d.get("count", 0)
            detail_strings.append(f"{src}: {count} entries")
        else:
            detail_strings.append(str(d))

    return {
        "has_rls": bool(rls_data.get("has_rls", False)),
        "details": detail_strings,
    }


def _documentation_payload_from_mcp(
    *,
    tables: list[str],
    relationships: list[str],
    schema_rows: list[dict[str, Any]],
    metadata_rows: Any,
    power_query_rows: Any,
    measures_rows: Any,
    dax_columns_rows: Any,
    m_parameters_rows: Any,
    relationships_rows: Any,
    rls_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sources = _extract_sources_from_rows(power_query_rows, metadata_rows)
    measures = _dax_measure_docs_from_rows(measures_rows)
    dax_columns = _dax_column_docs_from_rows(dax_columns_rows)
    m_parameters = _m_parameters_docs_from_rows(m_parameters_rows)
    relationship_details = _relationship_details_from_rows(relationships_rows)
    table_roles = _table_roles(tables, relationships, relationships_rows)
    key_columns = _key_columns(schema_rows)

    # RLS sourced from dedicated MCP tool (no longer hardcoded).
    rls = _normalize_rls_from_mcp(rls_data or {})

    return {
        "report_sources": {"sources": sources},
        "report_model": {"tables": tables, "relationships": relationship_details},
        "dax_calculations": {"calculated_columns": dax_columns, "measures": measures},
        "security_and_parameters": {"rls": rls, "parameters": m_parameters},
        "data_sources": {
            "source_systems": sources,
            "tables_used": tables,
            "refresh_frequency": "Not available in extracted PBIX metadata.",
        },
        "data_model": {
            "table_roles": table_roles,
            "relationships": relationship_details,
            "key_columns": key_columns,
        },
        "measures": measures,
        "kpis_metrics_definitions": [],
        "report_pages_visuals": [],
        "filters_slicers": {
            "global_filters": [],
            "page_level_filters": [],
            "default_states": "Not available in extracted PBIX metadata.",
        },
        "refresh_performance": {
            "refresh_schedule": "Not available in extracted PBIX metadata.",
            "data_volume": {"table_count": len(tables), "relationship_count": len(relationships)},
            "known_performance_issues": [],
            "optimization_notes": [],
        },
        "governance_compliance": {
            "dataset_certification_status": "Not available in extracted PBIX metadata.",
            "sensitivity_label": "Not available in extracted PBIX metadata.",
            "data_ownership": "Not available in extracted PBIX metadata.",
            "access_rules": "Not available in extracted PBIX metadata.",
        },
    }


async def _extract_context_via_mcp(resolved: str) -> dict[str, Any]:
    server_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pbixray_server.py")
    params = StdioServerParameters(command=sys.executable, args=[server_path], env=None)
    async with stdio_client(params) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            load_result = await session.call_tool("load_pbix_file", {"file_path": resolved})
            load_text = _mcp_text(load_result)
            if load_text.lower().startswith("error:"):
                raise RuntimeError(load_text)

            # All model introspection goes through MCP tools.
            tables_text = _mcp_text(await session.call_tool("get_tables", {}))
            stats_text = _mcp_text(await session.call_tool("get_statistics", {}))
            measures_text = _mcp_text(await session.call_tool("get_dax_measures", {}))
            dax_columns_text = _mcp_text(await session.call_tool("get_dax_columns", {}))
            schema_text = _mcp_text(await session.call_tool("get_schema", {}))
            relationships_text = _mcp_text(await session.call_tool("get_relationships", {}))
            metadata_text = _mcp_text(await session.call_tool("get_metadata", {}))
            power_query_text = _mcp_text(await session.call_tool("get_power_query", {}))
            m_parameters_text = _mcp_text(await session.call_tool("get_m_parameters", {}))
            model_summary_text = _mcp_text(await session.call_tool("get_model_summary", {}))
            # Dedicated MCP tool for Row-Level Security roles.
            rls_text = _mcp_text(await session.call_tool("get_rls_roles", {}))

            tables_data = _mcp_parse_json(tables_text, [])
            stats_rows = _mcp_parse_json(stats_text, [])
            measures_rows = _mcp_parse_json(measures_text, [])
            dax_columns_rows = _mcp_parse_json(dax_columns_text, [])
            schema_rows = _mcp_parse_json(schema_text, [])
            relationships_rows = _mcp_parse_json(relationships_text, [])
            metadata_data = _mcp_parse_json(metadata_text, {})
            power_query_rows = _mcp_parse_json(power_query_text, [])
            m_parameters_rows = _mcp_parse_json(m_parameters_text, [])
            model_summary = _mcp_parse_json(model_summary_text, {})
            rls_data = _mcp_parse_json(rls_text, {"has_rls": False, "details": []})

            tables = _coerce_tables(tables_data)
            if not tables and isinstance(model_summary, dict):
                tables = _coerce_tables(model_summary.get("tables", []))
            if not isinstance(stats_rows, list):
                stats_rows = []
            if not isinstance(schema_rows, list):
                schema_rows = []
            if not tables and stats_rows:
                tables = sorted(
                    {
                        str(row.get("TableName")).strip()
                        for row in stats_rows
                        if isinstance(row, dict) and str(row.get("TableName") or "").strip()
                    }
                )

            measures = _mcp_measure_names(measures_rows)
            relationships = _mcp_relationship_lines(relationships_rows)
            story_context = build_story_context(resolved, tables, stats_rows)

            metadata_rows: list[dict[str, Any]] = []
            if isinstance(metadata_data, dict):
                metadata_rows = [{"Name": k, "Value": v} for k, v in metadata_data.items()]

            sources = _extract_sources_from_rows(power_query_rows, metadata_rows)

            # ---- Debug logs ----
            try:
                logger.info(
                    "[mcp] tables=%d stats=%d measures=%d dax_cols=%d rels=%d "
                    "meta_keys=%d pq=%d m_params=%d rls_has=%s rls_details=%d",
                    len(tables),
                    len(stats_rows) if isinstance(stats_rows, list) else -1,
                    len(measures_rows) if isinstance(measures_rows, list) else -1,
                    len(dax_columns_rows) if isinstance(dax_columns_rows, list) else -1,
                    len(relationships_rows) if isinstance(relationships_rows, list) else -1,
                    len(metadata_data) if isinstance(metadata_data, dict) else -1,
                    len(power_query_rows) if isinstance(power_query_rows, list) else -1,
                    len(m_parameters_rows) if isinstance(m_parameters_rows, list) else -1,
                    rls_data.get("has_rls") if isinstance(rls_data, dict) else "?",
                    len(rls_data.get("details", [])) if isinstance(rls_data, dict) else -1,
                )
                if isinstance(relationships_rows, list) and relationships_rows:
                    logger.info(
                        "[mcp] relationship sample keys=%s",
                        list(relationships_rows[0].keys()) if isinstance(relationships_rows[0], dict) else "n/a",
                    )
            except Exception:
                pass
            # --------------------

            documentation = _documentation_payload_from_mcp(
                tables=tables,
                relationships=relationships,
                schema_rows=schema_rows,
                metadata_rows=metadata_rows,
                power_query_rows=power_query_rows,
                measures_rows=measures_rows,
                dax_columns_rows=dax_columns_rows,
                m_parameters_rows=m_parameters_rows,
                relationships_rows=relationships_rows,
                rls_data=rls_data,
            )

            return {
                "tables": tables,
                "stats_rows": stats_rows,
                "story_context": story_context,
                "measures": measures,
                "relationships": relationships,
                "sources": sources,
                "documentation": documentation,
            }


def _extract_context_via_mcp_sync(resolved: str) -> dict[str, Any]:
    return asyncio.run(_extract_context_via_mcp(resolved))


def extract_pbix_payload(resolved: str) -> dict[str, Any]:
    mcp_payload = _extract_context_via_mcp_sync(resolved)
    tables = mcp_payload["tables"]
    stats_rows = mcp_payload["stats_rows"]
    story_context = mcp_payload["story_context"]
    columns = _columns_by_table(stats_rows)
    measures = mcp_payload["measures"]
    relationships = mcp_payload["relationships"]
    sources = mcp_payload.get("sources", [])
    documentation = mcp_payload.get("documentation", {})
    summary = summarize(stats_rows)

    raw_context = _build_raw_context(
        os.path.basename(resolved),
        tables,
        columns,
        measures,
        relationships,
        story_context,
    )
    return {
        "ok": True,
        "pbix_path": resolved,
        "file_name": os.path.basename(resolved),
        "tables": tables,
        "summary": summary,
        "stats_preview": stats_rows[:100],
        "context": story_context,
        "columns": columns,
        "measures": measures,
        "relationships": relationships,
        "sources": sources,
        "documentation": documentation,
        "rawContext": raw_context,
        "contextSource": "mcp",
        "contextError": "",
    }


@app.get("/")
def index():
    default_path = os.path.abspath("Employee Hiring and History.pbix")
    return render_template("dashboard.html", default_path=default_path)


@app.get("/storytelling")
def storytelling_get():
    ui = os.environ.get("STORY_UI_URL", "http://127.0.0.1:3000").strip()
    if ui:
        return redirect(ui, code=302)
    return redirect("/", code=302)


@app.get("/api/pbix/context")
def api_pbix_context():
    pbix_path = (request.args.get("pbix_path") or "").strip()
    if not pbix_path:
        return jsonify({"ok": False, "error": "pbix_path is required"}), 400

    resolved = os.path.expanduser(pbix_path)
    if not os.path.exists(resolved):
        return jsonify({"ok": False, "error": f"PBIX file not found: {resolved}"}), 404

    try:
        return jsonify(extract_pbix_payload(resolved))
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.post("/api/pbix/upload")
def api_pbix_upload():
    upload = request.files.get("file")
    if upload is None:
        return jsonify({"ok": False, "error": "Missing file field."}), 400

    filename = upload.filename or ""
    if not filename.lower().endswith(".pbix"):
        return jsonify({"ok": False, "error": "Only .pbix files are accepted."}), 400

    fd, tmp_path = tempfile.mkstemp(prefix="pbix_story_", suffix=".pbix")
    os.close(fd)
    try:
        upload.save(tmp_path)
        payload = extract_pbix_payload(tmp_path)
        payload["uploaded_name"] = filename
        return jsonify(payload)
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


DAX_SYSTEM_PROMPT = """You are an expert Power BI DAX developer.
Given a natural language request, respond with exactly 3 sections:

## DAX Measure
Write a complete, production-ready DAX measure.
Use proper formatting with line breaks and indentation.
Include a meaningful measure name.

## Logic Explanation
Explain clearly how the DAX works:
- What each function does
- How filter context is handled
- Why you chose this approach

## Suggested Improvements
Provide 3-5 concrete suggestions:
- Performance optimizations
- Edge case handling
- Alternative approaches
- Related measures they might need

Be concise but thorough. Format code blocks with backticks.
"""


def iter_ollama_chat_stream(
    model: str,
    system: str,
    user: str,
    *,
    request_id: str = "",
    temperature: float | None = None,
) -> Iterator[str]:
    rid = f" req_id={request_id}" if request_id else ""
    lock_timeout_sec = float(os.environ.get("OLLAMA_SINGLEFLIGHT_WAIT_SEC", "1.0"))
    got_lock = _ollama_singleflight_lock.acquire(timeout=lock_timeout_sec)
    if not got_lock:
        raise RuntimeError(
            "Ollama is busy with another generation request. "
            "Wait for the current run to finish or click Stop, then try again."
        )

    base = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    url = f"{base}/api/chat"
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": True,
    }
    if temperature is not None:
        payload["options"] = {"temperature": float(temperature)}
    num_ctx_raw = os.environ.get("DAX_OLLAMA_NUM_CTX", "").strip()
    if num_ctx_raw:
        try:
            payload.setdefault("options", {})
            payload["options"]["num_ctx"] = int(num_ctx_raw)
            _log_flush("[dax]%s ollama options num_ctx=%s", rid, num_ctx_raw)
        except ValueError:
            logger.warning("[dax]%s invalid DAX_OLLAMA_NUM_CTX=%r ignored", rid, num_ctx_raw)
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    _log_flush(
        "[dax]%s ollama POST %s model=%s payload_bytes=%d system_chars=%d user_chars=%d",
        rid,
        url,
        model,
        len(data),
        len(system),
        len(user),
    )
    _log_flush(
        "[dax]%s blocking on urllib.urlopen() — try: `ollama ps`, `ollama run %s` to warm.",
        rid,
        model,
    )
    t_connect_start = time.perf_counter()
    hb_sec = float(os.environ.get("DAX_URLOPEN_HEARTBEAT_SEC", "3"))
    timeout_sec = float(os.environ.get("DAX_OLLAMA_READ_TIMEOUT_SEC", os.environ.get("DAX_OLLAMA_TIMEOUT_SEC", "600")))
    stop_hb = threading.Event()

    def _urlopen_heartbeat() -> None:
        while not stop_hb.wait(hb_sec):
            elapsed = time.perf_counter() - t_connect_start
            _log_flush(
                "[dax]%s still inside urlopen after %.1fs — check `ollama ps` / GPU.",
                rid,
                elapsed,
            )

    try:
        hb_thread = threading.Thread(target=_urlopen_heartbeat, name="dax-urlopen-hb", daemon=True)
        hb_thread.start()
        try:
            resp = urllib.request.urlopen(req, timeout=timeout_sec)
        except Exception as exc:
            logger.error("[dax]%s urlopen failed after %.1f ms: %s", rid, (time.perf_counter() - t_connect_start) * 1000, exc)
            raise RuntimeError(_friendly_ollama_error(exc, base, model=model)) from exc
        finally:
            stop_hb.set()
        connect_ms = (time.perf_counter() - t_connect_start) * 1000
        status = getattr(resp, "status", None)
        logger.info("[dax]%s ollama ready status=%s connect_ms=%.1f", rid, status, connect_ms)

        line_num = 0
        json_ok = 0
        json_bad = 0
        empty_lines = 0
        skipped_no_content = 0
        content_yields = 0
        total_chars = 0
        last_heartbeat = time.perf_counter()
        slow_readline_log_ms = float(os.environ.get("DAX_SLOW_READLINE_MS", "3000"))

        with resp:
            while True:
                t_block = time.perf_counter()
                raw = resp.readline()
                block_ms = (time.perf_counter() - t_block) * 1000
                line_num += 1

                if line_num == 1:
                    logger.info("[dax]%s first readline: blocked_ms=%.1f bytes=%d", rid, block_ms, len(raw))
                elif block_ms >= slow_readline_log_ms:
                    logger.warning("[dax]%s slow readline line=%d blocked_ms=%.1f", rid, line_num, block_ms)

                if not raw:
                    logger.info(
                        "[dax]%s readline eof after %d lines yields=%d chars=%d", rid, line_num, content_yields, total_chars
                    )
                    break

                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    empty_lines += 1
                    continue

                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    json_bad += 1
                    continue

                json_ok += 1

                if obj.get("done"):
                    logger.info(
                        "[dax]%s ollama done=true lines=%d yields=%d chars=%d", rid, line_num, content_yields, total_chars
                    )
                    break

                msg = obj.get("message") or {}
                piece = msg.get("content") or ""
                if not piece:
                    piece = obj.get("response") or ""
                if not piece:
                    skipped_no_content += 1
                    continue

                content_yields += 1
                total_chars += len(piece)
                if content_yields == 1:
                    logger.info("[dax]%s first token delta chars=%d", rid, len(piece))

                now = time.perf_counter()
                if now - last_heartbeat >= 5.0:
                    logger.info("[dax]%s heartbeat lines=%d yields=%d chars=%d", rid, line_num, content_yields, total_chars)
                    last_heartbeat = now

                yield piece

        logger.info("[dax]%s stream finished lines=%d yields=%d chars=%d", rid, line_num, content_yields, total_chars)
    finally:
        _ollama_singleflight_lock.release()


@app.post("/api/dax/generate")
def api_dax_generate():
    req_id = str(uuid.uuid4())[:8]
    t0 = time.perf_counter()
    body = request.get_json(silent=True) or {}
    query = (body.get("query") or "").strip()
    context = (body.get("context") or "").strip()
    pbix_context = (body.get("pbix_context") or "").strip()
    model = (body.get("model") or os.environ.get("OLLAMA_MODEL", "llama3.2:3b")).strip()
    logger.info(
        "[dax] req_id=%s begin query_len=%d context_len=%d pbix_context_len=%d model=%s",
        req_id,
        len(query),
        len(context),
        len(pbix_context),
        model,
    )
    if not query:
        return jsonify({"ok": False, "error": "query is required"}), 400

    max_user_ctx = int(os.environ.get("DAX_MAX_USER_CONTEXT_CHARS", "4000"))
    max_pbix_ctx = int(os.environ.get("DAX_MAX_PBIX_CONTEXT_CHARS", "8000"))
    if context:
        context = _truncate_dax_text(context, max_user_ctx, "user_context (textarea)", req_id)
    if pbix_context:
        pbix_context = _truncate_dax_text(pbix_context, max_pbix_ctx, "pbix_context", req_id)

    user_content = f"Natural language request:\n{query}\n"
    if context:
        user_content += f"\nOptional table/column context (user notes):\n{context}\n"

    system_prompt = DAX_SYSTEM_PROMPT
    if pbix_context:
        system_prompt += f"""

You have access to the user's actual Power BI data model:
{pbix_context}

Use the EXACT table names and column names from this model
in your generated DAX. Do not invent table or column names.
Reference real relationships when using RELATED or USERELATIONSHIP.
"""

    def generate() -> Iterator[str]:
        yield f"data: {json.dumps({'type': 'start', 'req_id': req_id})}\n\n"
        sse_chunks = 0
        try:
            for piece in iter_ollama_chat_stream(model, system_prompt, user_content, request_id=req_id):
                sse_chunks += 1
                yield f"data: {json.dumps({'type': 'chunk', 'text': piece})}\n\n"
        except Exception as exc:
            logger.error("[dax] req_id=%s stream error: %s\n%s", req_id, exc, traceback.format_exc())
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc), 'req_id': req_id})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'req_id': req_id})}\n\n"
        logger.info("[dax] req_id=%s sse complete elapsed_ms=%.1f", req_id, (time.perf_counter() - t0) * 1000)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


STORY_RULES = """You are a senior Power BI analytics storyteller.
Create a concise narrative for a business stakeholder using ONLY the provided context.

Output format rules:
1) Use exactly these markdown headings: # Overview, # Key Insights, # Risks or Data Quality Concerns, # Recommended Actions
2) Under each heading use 3-6 bullet points
3) Be concrete with table/column names from the context
4) Do not invent metrics or percentages not implied by the context"""


@app.post("/api/story/generate")
def api_story_generate():
    req_id = str(uuid.uuid4())[:8]
    t0 = time.perf_counter()
    body = request.get_json(silent=True) or {}

    context = body.get("context")
    model = (body.get("model") or os.environ.get("OLLAMA_MODEL", "llama3.2:3b")).strip()
    focus = (body.get("focus") or "").strip()
    logger.info("[story] req_id=%s begin model=%s focus_len=%d", req_id, model, len(focus))

    if context is None:
        return jsonify({"ok": False, "error": "context is required"}), 400

    if isinstance(context, str):
        context_text = context.strip()
    else:
        try:
            context_text = json.dumps(context, ensure_ascii=True)
        except Exception:
            context_text = str(context)
        context_text = context_text.strip()

    if not context_text:
        return jsonify({"ok": False, "error": "context must not be empty"}), 400

    max_ctx_chars = int(os.environ.get("STORY_MAX_CONTEXT_CHARS", "12000"))
    if max_ctx_chars > 0 and len(context_text) > max_ctx_chars:
        logger.warning(
            "[story] req_id=%s truncating context %d -> %d chars",
            req_id,
            len(context_text),
            max_ctx_chars,
        )
        context_text = context_text[:max_ctx_chars] + "\n\n[... truncated by server ...]"

    story_temp = float(os.environ.get("STORY_OLLAMA_TEMPERATURE", "0.2"))
    system_prompt = f"{STORY_RULES}\n\nContext:\n{context_text}"
    user_content = "Generate a story about this Power BI report."
    if focus:
        user_content += f"\n\nFocus area: {focus}"

    def generate() -> Iterator[str]:
        yield f"data: {json.dumps({'type': 'start', 'req_id': req_id})}\n\n"
        try:
            for piece in iter_ollama_chat_stream(
                model,
                system_prompt,
                user_content,
                request_id=req_id,
                temperature=story_temp,
            ):
                yield f"data: {json.dumps({'type': 'chunk', 'text': piece})}\n\n"
        except Exception as exc:
            logger.error("[story] req_id=%s stream error: %s\n%s", req_id, exc, traceback.format_exc())
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc), 'req_id': req_id})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'req_id': req_id})}\n\n"
        logger.info("[story] req_id=%s sse complete elapsed_ms=%.1f", req_id, (time.perf_counter() - t0) * 1000)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/api/ollama/models")
def api_ollama_models():
    base = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    url = f"{base}/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            body = response.read().decode("utf-8")
        return app.response_class(body, status=200, mimetype="application/json")
    except Exception as exc:
        return jsonify({"ok": False, "error": _friendly_ollama_error(exc, base)}), 503


@app.post("/analyze")
def analyze():
    pbix_path = (request.form.get("pbix_path") or "").strip()
    if not pbix_path:
        return render_template("dashboard.html", error="PBIX path is required.", default_path="")

    resolved = os.path.expanduser(pbix_path)
    if not os.path.exists(resolved):
        return render_template("dashboard.html", error=f"PBIX file not found: {resolved}", default_path=pbix_path)

    try:
        payload = extract_pbix_payload(resolved)
        tables = payload.get("tables", [])
        stats_rows = payload.get("stats_preview", [])
        summary = payload.get("summary", {})
        return render_template(
            "dashboard.html",
            default_path=resolved,
            file_name=os.path.basename(resolved),
            tables=tables,
            stats_rows=stats_rows[:100],
            summary=summary,
            pbix_path=resolved,
        )
    except Exception as exc:
        return render_template("dashboard.html", error=f"Failed to analyze PBIX: {exc}", default_path=pbix_path)


if __name__ == "__main__":
    port = int(os.environ.get("PBIX_DASHBOARD_PORT", "5052"))
    app.run(host="127.0.0.1", port=port, debug=True)
