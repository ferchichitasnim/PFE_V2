#!/usr/bin/env python3
import os
import tempfile
import urllib.request
from typing import Any

from flask import Flask, jsonify, redirect, render_template, request
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
    return {
        "ok": True,
        "pbix_path": resolved,
        "file_name": os.path.basename(resolved),
        "tables": tables,
        "summary": summary,
        "stats_preview": stats_rows[:100],
        "context": story_context,
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
