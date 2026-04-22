# Testing Guide (Current)

This guide matches the current architecture:

- Flask API orchestrates runtime flows.
- MCP server is the semantic gateway for context extraction.
- Next.js web app handles Story and DAX generation routes.
- Ollama runs locally.

---

## 1) Quick End-to-End Smoke Test

1. Start Flask backend.
2. Start Next.js UI.
3. Open `http://127.0.0.1:3000`.
4. Upload a PBIX file.
5. Validate:
   - Story generation returns sectioned output.
   - DAX generation returns measure/explanation/suggestions.
   - Documentation page renders tables/measures/relationships.

Recommended API check:

- `GET /api/pbix/context?pbix_path=...` should include `contextSource: "mcp"`.

---

## 2) Environment Setup for Tests

From repo root:

### Windows (PowerShell)

```powershell
python -m venv venv
.\venv\Scripts\python -m pip install -r requirements.txt
.\venv\Scripts\python -m pytest
```

### macOS/Linux

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pytest
```

---

## 3) MCP Server Testing (Inspector)

Use MCP Inspector to test semantic tools directly:

```bash
npx -y @modelcontextprotocol/inspector python src/pbixray_server.py
```

Suggested tool sequence:

1. `load_pbix_file`
2. `get_model_summary`
3. `get_tables`
4. `get_statistics`
5. `get_schema`
6. `get_relationships`
7. `get_dax_measures`
8. `get_dax_columns`

---

## 4) Flask API Testing

Key endpoints:

- `GET /api/pbix/context?pbix_path=...`
- `POST /api/pbix/upload`
- `GET /api/ollama/models`
- `POST /api/dax/generate` (available backend SSE route)

Minimum assertions:

- context endpoint returns `ok: true`.
- payload contains `tables`, `context`, `rawContext`, `documentation`.
- `contextSource` equals `"mcp"`.

---

## 5) Next.js Route Testing

`web/app/api/chat/route.ts` supports:

- Story mode (default): context-grounded narrative generation.
- DAX mode (`mode: "dax"`): DAX response generation from prompt + context.

Minimum assertions:

- HTTP status `200`.
- Stream/text returned (non-empty).
- Section parsing works in UI hooks.

---

## 6) Automated Test Scope

The `tests/` suite should cover:

- MCP tool behaviors and error handling.
- PBIX load + semantic retrieval correctness.
- Large-file handling and timeout behavior.
- Serialization robustness.

Recommended additions:

- MCP payload shape regression tests for Flask context output.
- Documentation payload contract tests for UI expectations.
- Story/DAX API smoke tests in CI.

---

## 7) Common Failures and Fixes

## 7.1 Ollama unreachable

- Verify Ollama service is running.
- Check `OLLAMA_BASE_URL` and model name.
- Warm model once (`ollama run <model>`).

## 7.2 PBIX file path issues

- Use absolute path where possible.
- Confirm file exists and is readable.
- For WSL/client mismatches, convert paths appropriately.

## 7.3 MCP timeout/startup issues

- Ensure Python environment has `mcp` and `pbixray`.
- Run `python src/pbixray_server.py` directly to validate.
- Check for syntax/runtime errors before Inspector usage.

## 7.4 Incomplete context payload

- Check Flask logs for MCP tool errors.
- Verify tool outputs parse correctly.
- Confirm `contextSource: "mcp"` and required keys are present.

---

## 8) Optional Manual API Probe

Example manual probe (adapt path):

```python
import json, urllib.parse, urllib.request
p = r"C:\path\to\model.pbix"
u = "http://127.0.0.1:5052/api/pbix/context?pbix_path=" + urllib.parse.quote(p, safe="")
data = json.load(urllib.request.urlopen(u, timeout=120))
print(data.get("ok"), data.get("contextSource"), len(data.get("tables", [])))
```

Expected: `True mcp <non-zero table count>`