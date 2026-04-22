#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -x "venv/bin/python" ]]; then
  echo "Missing venv. Run:"
  echo "  python3 -m venv venv && venv/bin/pip install -r requirements.txt"
  exit 1
fi

pick_port() {
  local p="$1"
  while [[ "$p" -le 5099 ]]; do
    if ! ss -ltn "( sport = :$p )" | awk 'NR>1 {found=1} END {exit found?0:1}'; then
      echo "$p"
      return 0
    fi
    p=$((p + 1))
  done
  return 1
}

PORT="${PBIX_DASHBOARD_PORT:-$(pick_port 5052)}"
if [[ -z "${PORT}" ]]; then
  echo "No free port found in range 5052-5099"
  exit 1
fi

echo "Starting dashboard on http://127.0.0.1:${PORT}"
PBIX_DASHBOARD_PORT="${PORT}" venv/bin/python src/pbixray_flask_app.py
