#!/usr/bin/env bash
# Local development entrypoint: installs deps (if needed) and runs ORVIX
# with autoreload against a local SQLite database.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
