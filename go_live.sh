#!/bin/bash
# Make the DEPLOYED site's live features work: starts the local data-api and a
# cloudflared tunnel, then publishes the tunnel URL into the shared database
# (app_config.data_api_url) so the Vercel frontend finds it automatically —
# no Vercel redeploy needed, ever.
#
#   ./go_live.sh          # run; Ctrl-C stops everything cleanly
#
# Requires: DATABASE_URL in .env (hosted DB), cloudflared installed.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA_API_PORT="${DATA_API_PORT:-5050}"
PY="$ROOT/data-api/.venv/bin/python"
LOGDIR="$ROOT/.go_live"
mkdir -p "$LOGDIR"

publish_url() { # $1 = url ('' to clear)
  "$PY" - "$1" <<'EOF'
import sys
sys.path.insert(0, "data-api")
from scrapeArtistData import get_db_connection
url = sys.argv[1]
conn = get_db_connection()
with conn.cursor() as cur:
    cur.execute(
        "INSERT INTO app_config (k, v) VALUES ('data_api_url', %s) "
        "ON DUPLICATE KEY UPDATE v = VALUES(v)",
        (url,),
    )
conn.commit()
conn.close()
print(f"    published data_api_url = {url or '(cleared)'}")
EOF
}

cleanup() {
  echo ""
  echo "==> Shutting down..."
  publish_url "" || true
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  [ -n "$SCHED_PID" ] && kill "$SCHED_PID" 2>/dev/null
  echo "    done. (Deployed site will show the offline banner within a minute.)"
}
trap cleanup EXIT INT TERM

# 1. data-api (skip if something already listens on the port)
if curl -s -m 2 "http://127.0.0.1:$DATA_API_PORT/health" >/dev/null 2>&1; then
  echo "==> data-api already running on :$DATA_API_PORT"
else
  echo "==> Starting data-api on :$DATA_API_PORT..."
  cd "$ROOT/data-api"
  export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
  export NO_PROXY="*"
  # --reload matches start_dev.sh: this process serves the deployed site for
  # hours while code is still being edited, and a worker running yesterday's
  # code fails silently (new request fields are simply ignored). Reload it, or
  # `kill -HUP <master pid>` an already-running one.
  ./.venv/bin/gunicorn --workers 1 --threads 8 --worker-class gthread \
    --timeout 180 --reload --bind "0.0.0.0:$DATA_API_PORT" app:app \
    > "$LOGDIR/data-api.log" 2>&1 &
  API_PID=$!
  cd "$ROOT"
  for i in $(seq 1 20); do
    curl -s -m 2 "http://127.0.0.1:$DATA_API_PORT/health" >/dev/null 2>&1 && break
    sleep 1
  done
fi

# 1b. auto-scrape scheduler: daily TTL-respected sweep so growth snapshots
# (momentum, event impact) accrue without manual refreshes.
# Match on the script name only: macOS resolves the venv python to ".../MacOS/Python"
# (capital P), so a "python scheduler.py" pattern silently misses and a duplicate
# scheduler spawns — two daily sweeps then race-scrape every artist.
if pgrep -f "scheduler\.py" >/dev/null 2>&1; then
  echo "==> scheduler already running"
else
  # SCRAPE_SWEEP_WORKERS (default 4) sweeps that many artists in parallel; safe
  # because throttle() rate-limits per host, not per artist (see scrape_service).
  # Set it in .env or the shell to tune. NOTE: the scheduler does NOT hot-reload —
  # kill the running one before re-running this to pick up new scrape code.
  echo "==> Starting auto-scrape scheduler (every ${AUTO_SCRAPE_INTERVAL_HOURS:-24}h, ${SCRAPE_SWEEP_WORKERS:-4} artists in parallel)..."
  cd "$ROOT/data-api"
  ./.venv/bin/python scheduler.py > "$LOGDIR/scheduler.log" 2>&1 &
  SCHED_PID=$!
  cd "$ROOT"
fi

# 2. cloudflared quick tunnel
echo "==> Starting cloudflared tunnel..."
: > "$LOGDIR/tunnel.log"
cloudflared tunnel --url "http://localhost:$DATA_API_PORT" \
  > "$LOGDIR/tunnel.log" 2>&1 &
TUNNEL_PID=$!

TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -Eo "https://[a-z0-9-]+\.trycloudflare\.com" "$LOGDIR/tunnel.log" | head -1)
  [ -n "$TUNNEL_URL" ] && break
  sleep 1
done
if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: tunnel never came up — see $LOGDIR/tunnel.log"
  exit 1
fi
echo "    tunnel: $TUNNEL_URL"

# 3. publish to the shared DB so the deployed site picks it up (<=30s cache)
echo "==> Publishing tunnel URL to the database..."
cd "$ROOT" && publish_url "$TUNNEL_URL"

echo ""
echo "✅ LIVE — the deployed site can now scrape/refresh/discover."
echo "   Keep this terminal open; Ctrl-C to go offline cleanly."
echo ""
wait
