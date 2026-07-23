#!/bin/bash
# Native dev runner (no Docker). Brings up MySQL (unless DATABASE_URL points at
# a hosted DB), the Flask data-api, and the Next.js frontend.
#
# Ports are env-overridable:
#   DATA_API_PORT (default 5050) — Flask data-api
#   WEB_PORT      (default 3000) — Next.js dev server
#
# Point the whole stack at a hosted MySQL (TiDB Serverless, Aiven, ...) by
# setting DATABASE_URL in .env — the local MySQL service is then skipped.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
MYSQL_BIN="/opt/homebrew/opt/mysql@8.4/bin"
DATA_API_PORT="${DATA_API_PORT:-5050}"
WEB_PORT="${WEB_PORT:-3000}"

# Respect a DATABASE_URL from .env as well as from the shell environment.
DB_URL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' "$ROOT/.env" 2>/dev/null | cut -d= -f2-)}"

if [ -n "$DB_URL" ]; then
  echo "==> DATABASE_URL is set — using hosted DB, skipping local MySQL."
else
  echo "==> Starting MySQL 8.4..."
  brew services start mysql@8.4 >/dev/null
  echo -n "    waiting for MySQL"
  for i in $(seq 1 30); do
    if "$MYSQL_BIN/mysqladmin" ping -uincighder -ppassword -h127.0.0.1 2>/dev/null | grep -q "is alive"; then
      echo " ready."; break
    fi
    echo -n "."; sleep 1
  done
fi

echo "==> Setting up data-api (Python venv)..."
cd "$ROOT/data-api"
if [ ! -d .venv ]; then
  python3.12 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
fi

# Safe on every start: apply_schema.py only creates missing tables.
# Destructive resets require an explicit `python apply_schema.py --reset`.
echo "==> Ensuring database schema..."
./.venv/bin/python apply_schema.py

echo "==> Refreshing artist JSON snapshot (fallback for serverless deploys)..."
cd "$ROOT"
node scripts/export-artists.mjs || true
cd "$ROOT/data-api"

echo "==> Starting data-api on :$DATA_API_PORT..."
# macOS fork-safety: threaded workers make network calls that touch the system
# proxy resolver (CoreFoundation/ObjC), which otherwise crashes the worker after
# fork ("may have been in progress in another thread when fork() was called").
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
export NO_PROXY="*"
./.venv/bin/gunicorn --workers 1 --threads 8 --worker-class gthread \
  --timeout 180 --reload --bind "0.0.0.0:$DATA_API_PORT" app:app &
API_PID=$!
trap 'echo "Stopping data-api..."; kill $API_PID 2>/dev/null' EXIT INT TERM

echo "==> Starting frontend on :$WEB_PORT..."
cd "$ROOT"
[ -d node_modules ] || npm install
DATA_API_PORT="$DATA_API_PORT" PORT="$WEB_PORT" npm run dev -- --port "$WEB_PORT"
