#!/bin/bash
# Native dev runner (no Docker). Brings up MySQL, the Flask data-api, and the
# Next.js frontend — the de-dockerized replacement for `docker compose up`.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
MYSQL_BIN="/opt/homebrew/opt/mysql@8.4/bin"

echo "==> Starting MySQL 8.4..."
brew services start mysql@8.4 >/dev/null
echo -n "    waiting for MySQL"
for i in $(seq 1 30); do
  if "$MYSQL_BIN/mysqladmin" ping -uincighder -ppassword -h127.0.0.1 2>/dev/null | grep -q "is alive"; then
    echo " ready."; break
  fi
  echo -n "."; sleep 1
done

echo "==> Setting up data-api (Python venv)..."
cd "$ROOT/data-api"
if [ ! -d .venv ]; then
  python3.12 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
fi

echo "==> Applying database schema..."
./.venv/bin/python apply_schema.py

echo "==> Refreshing artist JSON snapshot (fallback for serverless deploys)..."
cd "$ROOT"
node scripts/export-artists.mjs || true
cd "$ROOT/data-api"

echo "==> Starting data-api on :5050..."
# macOS fork-safety: threaded workers make network calls that touch the system
# proxy resolver (CoreFoundation/ObjC), which otherwise crashes the worker after
# fork ("may have been in progress in another thread when fork() was called").
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
export NO_PROXY="*"
./.venv/bin/gunicorn --workers 1 --threads 8 --worker-class gthread \
  --timeout 180 --reload --bind 0.0.0.0:5050 app:app &
API_PID=$!
trap 'echo "Stopping data-api..."; kill $API_PID 2>/dev/null' EXIT INT TERM

echo "==> Starting frontend on :3000..."
cd "$ROOT"
[ -d node_modules ] || npm install
npm run dev
