# Installing the PBIXRay MCP Server

This document provides instructions for installing and configuring the PBIXRay MCP server with various MCP clients.

## Prerequisites

Before installing the PBIXRay MCP server, make sure you have the following prerequisites:

1. Python 3.8 or higher
2. pip (Python package installer)
3. Any MCP-compatible client

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/username/pbixray-mcp.git
cd pbixray-mcp
```

### 2. Create a Virtual Environment (Recommended)

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

Or install the core requirements manually:

```bash
pip install mcp pbixray numpy
```

## Configuring with MCP Clients

The PBIXRay MCP server can be used with any MCP-compatible client. Below are instructions for some common clients:

### Generic MCP Client Configuration

In most MCP clients, you'll need to specify the command to start the PBIXRay server. This is typically done in a configuration file with the absolute path to the server script:

```json
{
  "mcpServers": {
    "pbixray": {
      "command": "python",
      "args": ["/path/to/src/pbixray_server.py"]
    }
  }
}
```

Replace `/path/to/src/pbixray_server.py` with the absolute path to the `pbixray_server.py` file on your system.

### Claude Desktop

For Claude Desktop, create or edit the configuration file:

**macOS**:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows**:
```
%APPDATA%\Claude\claude_desktop_config.json
```

Add the following configuration:

```json
{
  "mcpServers": {
    "pbixray": {
      "command": "python",
      "args": ["/path/to/src/pbixray_server.py"]
    }
  }
}
```

### Other MCP-Compatible Clients

For other MCP-compatible clients, refer to their documentation for how to add custom MCP servers. In general, you'll need to provide:

1. A unique name for the server (e.g., "pbixray")
2. The command to run the server (typically "python")
3. Arguments to the command (the path to the server script)

## Running the Server Directly

If you prefer to run the server manually, you can execute it directly:

```bash
python src/pbixray_server.py
```

This will start the server using the stdio transport, which can be useful for testing or for integrating with clients that connect to running servers.

## Ollama Setup (Local LLM + MCP)

If you want local LLM + this MCP server in the same machine:

```bash
# 1) install ollama locally and pull a model
./scripts/setup_ollama.sh

# optional model:
# ./scripts/setup_ollama.sh llama3.1:8b

# 2) run MCP server with ollama available
./scripts/run_with_ollama.sh
```

Use `examples/config/ollama_mcp_client_config.json` as a starting point for your MCP client config.

## Flask Dashboard (Visualization UI)

Run a local web UI for PBIX stats visualization:

```bash
chmod +x ./scripts/run_flask_dashboard.sh
./scripts/run_flask_dashboard.sh
```

Then open:

```text
http://127.0.0.1:5050 (or printed port if 5050 is already in use)
```

## Storytelling With Ollama

The project now supports PBIX storytelling narratives through Ollama in both MCP and Flask UI.

Optional environment variables:

```bash
export OLLAMA_BASE_URL="http://127.0.0.1:11434"
export OLLAMA_MODEL="llama3.2:3b"
```

### MCP tool flow

```bash
# Start server
./scripts/run_with_ollama.sh

# Then call these tools from your MCP client:
# 1) load_pbix_file(file_path="...")
# 2) generate_storytelling_narrative(model_name="llama3.2:3b")
```

### Streaming Story UI (Vercel AI SDK)

Narrative is streamed in the browser (no HTML download). Flask exposes PBIX context at `GET /api/pbix/context`. The DAX Generator calls `POST /api/dax/generate` (SSE stream from Ollama).

**DAX slow / stuck:** After `ollama POST …` you see **`blocking on urllib.urlopen()`** — Ollama often returns HTTP only **after** the first token is ready, so **huge prompts** (many KB of `pbix_context` + textarea) can **block for minutes** on CPU. Defaults: **`DAX_MAX_PBIX_CONTEXT_CHARS=8000`**, **`DAX_MAX_USER_CONTEXT_CHARS=4000`** (set to **`0`** to disable truncation for that field). Optional: **`DAX_OLLAMA_NUM_CTX=8192`** to cap context window. Heartbeat: `DAX_URLOPEN_HEARTBEAT_SEC`. Socket timeout for the Ollama HTTP call: **`DAX_OLLAMA_READ_TIMEOUT_SEC`** (default **600**; alias **`DAX_OLLAMA_TIMEOUT_SEC`**). Python’s `urllib` here needs a **single** float (tuple connect/read breaks on 3.12). Warm model: `ollama run <model>`. Browser: `[dax:client]`; verbose: `NEXT_PUBLIC_DAX_DEBUG=1`, `DAX_LOG_LEVEL=DEBUG`.

Terminal 1:

```bash
./scripts/run_flask_dashboard.sh
```

Note the printed port (e.g. `5052`).

Terminal 2:

```bash
cd web
cp .env.example .env.local
# Set FLASK_URL to match Flask, e.g. http://127.0.0.1:5052
chmod +x ../scripts/run_story_ui.sh
../scripts/run_story_ui.sh
```

Open `http://127.0.0.1:3000`, paste the PBIX path, click **Generate story**.

**GET `/storytelling` on Flask** redirects to the Story UI (default `http://127.0.0.1:3000`). Override with `STORY_UI_URL` if needed.

### Flask-only charts

```bash
./scripts/run_flask_dashboard.sh
```

Use **Analyze** for tables + charts. Storytelling uses the Next app above.

## Troubleshooting

If you encounter issues with the PBIXRay MCP server, try the following steps:

1. **Check your Python version**: Make sure you're using Python 3.8 or higher with `python --version`.

2. **Verify dependencies**: Ensure all required packages are installed with `pip list | grep -E "mcp|pbixray|numpy"`.

3. **Check file paths**: Make sure all paths in your configuration are absolute and correct.

4. **Check file permissions**: Ensure the server script has execute permissions with `chmod +x /path/to/src/pbixray_server.py`.

5. **Test with the demo script**: Run the included demo script to verify the server works correctly:
   ```bash
   python examples/demo.py
   ```

6. **Check logs**: Look for error messages in the console or client logs.

## Using MCP Inspector

The MCP Inspector is a great tool for testing and debugging MCP servers. To use it with the PBIXRay server:

```bash
mcp dev src/pbixray_server.py
```

This will start an interactive session where you can call tools and test responses.

## Getting Help

If you continue to experience issues, check the following resources:

1. [Open an issue](https://github.com/username/pbixray-mcp/issues) on GitHub
2. Check the [Model Context Protocol documentation](https://modelcontextprotocol.io/)
3. Review the [PBIXRay documentation](https://github.com/Hugoberry/pbixray) for underlying functionality