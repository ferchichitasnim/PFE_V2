#!/usr/bin/env python3
import json
import logging
import os
import sys
import tempfile
import threading
import time
import traceback
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


from flask import Flask, Response, jsonify, redirect, render_template, request, stream_with_context
from flask_cors import CORS
from pbixray import PBIXRay
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
            ]
        }
    },
)


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


def _measures_list(model: Any) -> list[str]:
    try:
        df = getattr(model, "dax_measures", None)
        if df is None or not hasattr(df, "to_dict"):
            return []
        rows = df.to_dict(orient="records")
        names: list[str] = []
        for r in rows:
            tn = str(r.get("TableName") or "").strip()
            mn = str(r.get("Name") or "").strip()
            if tn and mn:
                names.append(f"{tn}[{mn}]")
            elif mn:
                names.append(mn)
        return sorted(set(names))
    except Exception:
        return []


def _relationship_strings(model: Any) -> list[str]:
    try:
        df = getattr(model, "relationships", None)
        if df is None or not hasattr(df, "to_dict"):
            return []
        rows = df.to_dict(orient="records")
        lines: list[str] = []
        for r in rows:
            ft = str(r.get("FromTableName") or "").strip()
            fc = str(r.get("FromColumnName") or "").strip()
            tt = str(r.get("ToTableName") or "").strip()
            tc = str(r.get("ToColumnName") or "").strip()
            if not (ft and fc and tt and tc):
                continue
            active = r.get("IsActive", True)
            suffix = "" if active else " (inactive)"
            lines.append(f"{ft}[{fc}] → {tt}[{tc}]{suffix}")
        return lines
    except Exception:
        return []


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


def extract_pbix_payload(resolved: str) -> dict[str, Any]:
    model = PBIXRay(resolved)
    tables = normalize_tables(model.tables)
    stats_rows = normalize_statistics(model.statistics)
    summary = summarize(stats_rows)
    story_context = build_story_context(resolved, model.tables, model.statistics)
    columns = _columns_by_table(stats_rows)
    measures = _measures_list(model)
    relationships = _relationship_strings(model)
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
        "rawContext": raw_context,
    }


@app.get("/")
def index():
    default_path = os.path.abspath("Employee Hiring and History.pbix")
    return render_template("dashboard.html", default_path=default_path)


@app.get("/storytelling")
def storytelling_get():
    """Avoid 405 when opening /storytelling in the browser; streaming UI lives on Next.js."""
    ui = os.environ.get("STORY_UI_URL", "http://127.0.0.1:3000").strip()
    if ui:
        return redirect(ui, code=302)
    return redirect("/", code=302)


@app.get("/api/pbix/context")
def api_pbix_context():
    """JSON context for storytelling (used by Next.js + Vercel AI SDK)."""
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
) -> Iterator[str]:
    """Yield text deltas from Ollama /api/chat streaming (NDJSON lines)."""
    rid = f" req_id={request_id}" if request_id else ""
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
    num_ctx_raw = os.environ.get("DAX_OLLAMA_NUM_CTX", "").strip()
    if num_ctx_raw:
        try:
            payload["options"] = {"num_ctx": int(num_ctx_raw)}
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
        "[dax]%s blocking on urllib.urlopen() until Ollama returns HTTP response — "
        "no log line after this until then: usually model load into RAM/VRAM or heavy prompt. "
        "Try: `ollama ps`, `ollama run %s` once to warm, or reduce pbix_context / user context size.",
        rid,
        model,
    )
    t_connect_start = time.perf_counter()
    hb_sec = float(os.environ.get("DAX_URLOPEN_HEARTBEAT_SEC", "3"))
    # urllib on Python 3.12 passes this into socket code that only accepts a float (tuple timeouts break).
    # This caps total wait for connect + server processing + first response bytes (large DAX prompts need minutes).
    timeout_sec = float(os.environ.get("DAX_OLLAMA_READ_TIMEOUT_SEC", os.environ.get("DAX_OLLAMA_TIMEOUT_SEC", "600")))
    stop_hb = threading.Event()

    def _urlopen_heartbeat() -> None:
        while not stop_hb.wait(hb_sec):
            elapsed = time.perf_counter() - t_connect_start
            _log_flush(
                "[dax]%s still inside urlopen after %.1fs — Ollama often returns HTTP only after first token is ready; "
                "huge prompts = long CPU/GPU work. Fix: lower DAX_MAX_PBIX_CONTEXT_CHARS / DAX_MAX_USER_CONTEXT_CHARS, "
                "warm model with `ollama run %s`, or set DAX_OLLAMA_NUM_CTX (e.g. 8192). Check `ollama ps` / GPU.",
                rid,
                elapsed,
                model,
            )

    hb_thread = threading.Thread(target=_urlopen_heartbeat, name="dax-urlopen-hb", daemon=True)
    hb_thread.start()
    try:
        resp = urllib.request.urlopen(req, timeout=timeout_sec)
    except Exception as exc:
        logger.error(
            "[dax]%s urlopen failed after %.1f ms (timeout=%.1fs, env DAX_OLLAMA_READ_TIMEOUT_SEC or DAX_OLLAMA_TIMEOUT_SEC): %s",
            rid,
            (time.perf_counter() - t_connect_start) * 1000,
            timeout_sec,
            exc,
        )
        raise
    finally:
        stop_hb.set()
    connect_ms = (time.perf_counter() - t_connect_start) * 1000
    status = getattr(resp, "status", None)
    logger.info(
        "[dax]%s ollama tcp/http ready status=%s connect_ms=%.1f (if high: Ollama slow to accept or model load)",
        rid,
        status,
        connect_ms,
    )

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
                logger.info(
                    "[dax]%s first readline: blocked_ms=%.1f bytes=%d (high blocked_ms before bytes: Ollama queuing / loading model)",
                    rid,
                    block_ms,
                    len(raw),
                )
            elif block_ms >= slow_readline_log_ms:
                logger.warning(
                    "[dax]%s slow readline line=%d blocked_ms=%.1f (stuck inside stream read)",
                    rid,
                    line_num,
                    block_ms,
                )

            if not raw:
                logger.info(
                    "[dax]%s readline eof after %d lines yields=%d chars=%d", rid, line_num, content_yields, total_chars
                )
                break

            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                empty_lines += 1
                logger.debug("[dax]%s empty line skip count=%d", rid, empty_lines)
                continue

            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                json_bad += 1
                logger.debug("[dax]%s json skip line=%d err=%s head=%s", rid, line_num, exc, line[:120])
                continue

            json_ok += 1
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug("[dax]%s line=%d keys=%s done=%s", rid, line_num, list(obj.keys())[:12], obj.get("done"))

            if obj.get("done"):
                logger.info(
                    "[dax]%s ollama done=true lines=%d json_ok=%d yields=%d chars=%d",
                    rid,
                    line_num,
                    json_ok,
                    content_yields,
                    total_chars,
                )
                break

            msg = obj.get("message") or {}
            piece = msg.get("content") or ""
            if not piece:
                piece = obj.get("response") or ""
            if not piece:
                skipped_no_content += 1
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug("[dax]%s no text delta line=%d skipped_total=%d", rid, line_num, skipped_no_content)
                continue

            content_yields += 1
            total_chars += len(piece)
            if content_yields == 1:
                logger.info("[dax]%s first token delta chars=%d (time-to-first-token ends here)", rid, len(piece))

            now = time.perf_counter()
            if now - last_heartbeat >= 5.0:
                logger.info(
                    "[dax]%s heartbeat lines=%d yields=%d chars=%d json_bad=%d empty_skips=%d",
                    rid,
                    line_num,
                    content_yields,
                    total_chars,
                    json_bad,
                    empty_lines,
                )
                last_heartbeat = now

            yield piece

    logger.info(
        "[dax]%s stream finished lines=%d yields=%d chars=%d json_ok=%d json_bad=%d empty_lines=%d no_content_skips=%d",
        rid,
        line_num,
        content_yields,
        total_chars,
        json_ok,
        json_bad,
        empty_lines,
        skipped_no_content,
    )


@app.post("/api/dax/generate")
def api_dax_generate():
    """Stream DAX generation from Ollama as Server-Sent Events."""
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

    approx_tokens = (len(system_prompt) + len(user_content)) // 4
    logger.info(
        "[dax] req_id=%s prompts built total_system_chars=%d total_user_chars=%d ~tokens≈%d "
        "(Ollama may not return HTTP until first token; large prompts = long wait)",
        req_id,
        len(system_prompt),
        len(user_content),
        approx_tokens,
    )

    def generate() -> Iterator[str]:
        yield f"data: {json.dumps({'type': 'start', 'req_id': req_id})}\n\n"
        sse_chunks = 0
        try:
            logger.info("[dax] req_id=%s sse start -> calling Ollama stream", req_id)
            for piece in iter_ollama_chat_stream(
                model,
                system_prompt,
                user_content,
                request_id=req_id,
            ):
                sse_chunks += 1
                yield f"data: {json.dumps({'type': 'chunk', 'text': piece})}\n\n"
            logger.info(
                "[dax] req_id=%s ollama iterator done sse_chunks=%d elapsed_ms=%.1f",
                req_id,
                sse_chunks,
                (time.perf_counter() - t0) * 1000,
            )
        except Exception as exc:
            logger.error("[dax] req_id=%s stream error: %s\n%s", req_id, exc, traceback.format_exc())
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc), 'req_id': req_id})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'req_id': req_id})}\n\n"
        logger.info("[dax] req_id=%s sse complete total_elapsed_ms=%.1f", req_id, (time.perf_counter() - t0) * 1000)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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
        return jsonify({"ok": False, "error": f"Failed to fetch Ollama models: {exc}"}), 500


@app.post("/analyze")
def analyze():
    pbix_path = (request.form.get("pbix_path") or "").strip()
    if not pbix_path:
        return render_template("dashboard.html", error="PBIX path is required.", default_path="")

    resolved = os.path.expanduser(pbix_path)
    if not os.path.exists(resolved):
        return render_template(
            "dashboard.html",
            error=f"PBIX file not found: {resolved}",
            default_path=pbix_path,
        )

    try:
        model = PBIXRay(resolved)
        tables = normalize_tables(model.tables)
        stats_rows = normalize_statistics(model.statistics)
        summary = summarize(stats_rows)

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
        return render_template(
            "dashboard.html",
            error=f"Failed to analyze PBIX: {exc}",
            default_path=pbix_path,
        )


if __name__ == "__main__":
    port = int(os.environ.get("PBIX_DASHBOARD_PORT", "5050"))
    app.run(host="127.0.0.1", port=port, debug=True)
