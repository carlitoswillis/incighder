#!/bin/bash
# Make the DEPLOYED site's live features work: starts the local data-api and a
# cloudflared tunnel, then publishes the tunnel URL into the shared database
# (app_config.data_api_url) so the Vercel frontend finds it automatically —
# no Vercel redeploy needed, ever.
#
# Self-healing: after setup this script stays in a watchdog loop that probes the
# tunnel END-TO-END (through the Cloudflare edge) every CHECK_INTERVAL seconds.
# Laptop sleep kills a quick tunnel permanently — after wake, cloudflared retries
# its dead edge registration forever without ever exiting, so a PID check alone
# sees nothing wrong. The watchdog catches the dead URL (and the wake itself,
# via a wall-clock jump), restarts cloudflared, and republishes the fresh URL.
# The data-api and scheduler get the same restart treatment, and the published
# DB row is re-read periodically to heal external overwrites.
#
#   ./go_live.sh          # run; Ctrl-C stops everything cleanly
#   (normally supervised by pm2 as "incighder-data-api" — pm2 restart/stop send
#   SIGINT/SIGTERM, which trigger the same clean shutdown path)
#
# Requires: DATABASE_URL in .env (hosted DB), cloudflared installed.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" # publish_url's python resolves data-api/ and .env relative to cwd
DATA_API_PORT="${DATA_API_PORT:-5050}"
PY="$ROOT/data-api/.venv/bin/python"
LOGDIR="$ROOT/.go_live"
PIDFILE="$LOGDIR/go_live.pid"
CHECK_INTERVAL="${GO_LIVE_CHECK_INTERVAL:-20}"  # seconds between health probes
MAX_FAILS=3           # consecutive bad probes before restart
DB_RECHECK_EVERY=15   # healthy iterations between DB read-backs (~5 min)
CF_PATTERN="cloudflared tunnel --url http://localhost:$DATA_API_PORT"
mkdir -p "$LOGDIR"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

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

published_db_url() { # prints the URL currently in app_config ('' if none)
  "$PY" - <<'EOF'
import sys
sys.path.insert(0, "data-api")
from scrapeArtistData import get_db_connection
conn = get_db_connection()
with conn.cursor() as cur:
    cur.execute("SELECT v FROM app_config WHERE k = 'data_api_url'")
    row = cur.fetchone()
conn.close()
if row:
    print((row["v"] if isinstance(row, dict) else row[0]) or "")
EOF
}

start_api() { # sets API_PID; returns 1 (logged) if /health never answers
  cd "$ROOT/data-api"
  export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
  export NO_PROXY="*"
  # --reload matches start_dev.sh: this process serves the deployed site for
  # hours while code is still being edited, and a worker running yesterday's
  # code fails silently (new request fields are simply ignored). Reload it, or
  # `kill -HUP <master pid>` an already-running one.
  ./.venv/bin/gunicorn --workers 1 --threads 8 --worker-class gthread \
    --timeout 180 --reload --bind "0.0.0.0:$DATA_API_PORT" app:app \
    >> "$LOGDIR/data-api.log" 2>&1 &
  API_PID=$!
  cd "$ROOT"
  for i in $(seq 1 20); do
    if ! kill -0 "$API_PID" 2>/dev/null; then
      log "ERROR: gunicorn exited during startup — see $LOGDIR/data-api.log"
      return 1
    fi
    if curl -s -m 2 "http://127.0.0.1:$DATA_API_PORT/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  log "ERROR: data-api never answered /health — see $LOGDIR/data-api.log"
  return 1
}

start_scheduler() { # sets SCHED_PID
  cd "$ROOT/data-api"
  ./.venv/bin/python scheduler.py >> "$LOGDIR/scheduler.log" 2>&1 &
  SCHED_PID=$!
  cd "$ROOT"
}

start_tunnel() { # sets TUNNEL_PID + TUNNEL_URL ('' if it never came up)
  # Truncate ONLY when no cloudflared can still write here (caller must have
  # killed AND reaped/waited-out the old one): a half-dead cloudflared flushing
  # shutdown lines at a stale fd offset punches NUL holes in the file, and BSD
  # grep then treats it as binary and never extracts a URL at all.
  : > "$LOGDIR/tunnel.log"
  cloudflared tunnel --url "http://localhost:$DATA_API_PORT" \
    > "$LOGDIR/tunnel.log" 2>&1 &
  TUNNEL_PID=$!
  TUNNEL_URL=""
  for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -Eo "https://[a-z0-9-]+\.trycloudflare\.com" "$LOGDIR/tunnel.log" | head -1)
    if [ -n "$TUNNEL_URL" ]; then
      break
    fi
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      break # cloudflared already died (no network?) — don't burn the full 30s
    fi
    sleep 1
  done
}

tunnel_healthy() { # end-to-end probe through the Cloudflare edge
  if [ -z "$TUNNEL_URL" ]; then
    return 1
  fi
  local code
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$TUNNEL_URL/health" 2>/dev/null) || return 1
  [ "$code" = "200" ]
}

restart_tunnel() {
  if [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true  # reap: no stray writes into the truncated log
  fi
  start_tunnel
  if [ -n "$TUNNEL_URL" ]; then
    log "tunnel back: $TUNNEL_URL"
    if publish_url "$TUNNEL_URL"; then
      PUBLISHED_URL="$TUNNEL_URL"
    else
      log "WARN: publish failed (DB unreachable?) — will retry next probe"
    fi
  else
    log "WARN: tunnel did not come up (network still down?) — retrying in ${CHECK_INTERVAL}s"
  fi
}

cleanup() {
  echo ""
  echo "==> Shutting down..."
  # kills first (instant), DB publish last: if a supervisor SIGKILLs us before
  # cleanup finishes, dead children matter more than a stale published URL
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  [ -n "$SCHED_PID" ] && kill "$SCHED_PID" 2>/dev/null
  publish_url "" || true
  rm -f "$PIDFILE"
  echo "    done. (Deployed site will show the offline banner within a minute.)"
}

# Single-instance guard — BEFORE the traps are registered: bailing out here must
# NOT run cleanup, because the other instance owns the published URL + children.
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && [ "$OLD_PID" != "$$" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "ERROR: another go_live.sh is already running (pid $OLD_PID)."
    echo "       Stop it first: pm2 stop incighder-data-api  (or kill $OLD_PID)"
    exit 1
  fi
fi
echo $$ > "$PIDFILE"

# On INT/TERM (Ctrl-C or pm2 restart/stop): clean up once and EXIT — without the
# explicit exit, bash would resume the watchdog loop and resurrect the tunnel it
# just killed; without dropping the EXIT trap, cleanup would fire twice.
trap 'trap - EXIT; cleanup; exit 0' INT TERM
trap cleanup EXIT

# 0. leftover quick tunnel from a previous (crashed) run: kill it AND wait it
# out — see the truncation contract in start_tunnel. pkill returns before the
# process dies, so poll until it's actually gone.
if pgrep -f "$CF_PATTERN" >/dev/null 2>&1; then
  echo "==> Stopping leftover cloudflared from a previous run..."
  pkill -f "$CF_PATTERN" 2>/dev/null || true
  for i in $(seq 1 10); do
    pgrep -f "$CF_PATTERN" >/dev/null 2>&1 || break
    sleep 1
  done
  pkill -9 -f "$CF_PATTERN" 2>/dev/null || true
fi

# 1. data-api (skip if something already listens on the port)
API_PID=""
if curl -s -m 2 "http://127.0.0.1:$DATA_API_PORT/health" >/dev/null 2>&1; then
  echo "==> data-api already running on :$DATA_API_PORT"
else
  echo "==> Starting data-api on :$DATA_API_PORT..."
  if ! start_api; then
    echo "ERROR: data-api never became healthy — aborting before publishing anything."
    exit 1
  fi
fi

# 1b. auto-scrape scheduler: daily TTL-respected sweep so growth snapshots
# (momentum, event impact) accrue without manual refreshes.
# Match on the script name only: macOS resolves the venv python to ".../MacOS/Python"
# (capital P), so a "python scheduler.py" pattern silently misses and a duplicate
# scheduler spawns — two daily sweeps then race-scrape every artist.
SCHED_PID=""
if pgrep -f "scheduler\.py" >/dev/null 2>&1; then
  echo "==> scheduler already running"
else
  # SCRAPE_SWEEP_WORKERS (default 4) sweeps that many artists in parallel; safe
  # because throttle() rate-limits per host, not per artist (see scrape_service).
  # Set it in .env or the shell to tune. NOTE: the scheduler does NOT hot-reload —
  # kill the running one before re-running this to pick up new scrape code.
  echo "==> Starting auto-scrape scheduler (every ${AUTO_SCRAPE_INTERVAL_HOURS:-24}h, ${SCRAPE_SWEEP_WORKERS:-4} artists in parallel)..."
  start_scheduler
fi

# 2. cloudflared quick tunnel
echo "==> Starting cloudflared tunnel..."
TUNNEL_PID=""
start_tunnel
if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: tunnel never came up — see $LOGDIR/tunnel.log"
  exit 1
fi
echo "    tunnel: $TUNNEL_URL"

# 3. publish to the shared DB so the deployed site picks it up (<=30s cache).
# Non-fatal on a DB blip: the watchdog republishes on the next healthy probe.
echo "==> Publishing tunnel URL to the database..."
PUBLISHED_URL=""
if publish_url "$TUNNEL_URL"; then
  PUBLISHED_URL="$TUNNEL_URL"
else
  echo "WARN: initial publish failed (DB blip?) — the watchdog will retry."
fi

echo ""
echo "✅ LIVE — the deployed site can now scrape/refresh/discover."
echo "   Watchdog: probing $TUNNEL_URL/health every ${CHECK_INTERVAL}s;"
echo "   a dead tunnel (e.g. after laptop sleep) is restarted + republished."
echo "   Ctrl-C (or pm2 stop incighder-data-api) goes offline cleanly."
echo ""

# 4. supervision loop — failures here are handled, never fatal
set +e
TUNNEL_FAILS=0
API_FAILS=0
ITER=0
while true; do
  # Stamp BEFORE the sleep so GAP measures only the sleep itself — including
  # iteration work time would make any slow pass (a 30s+ tunnel restart) look
  # like a system wake and collapse the MAX_FAILS damping to one strike.
  LAST_TS=$(date +%s)
  # background sleep + wait: a foreground sleep blocks trap delivery, so a pm2
  # stop (SIGINT/SIGTERM) would hang up to CHECK_INTERVAL and risk the
  # kill_timeout SIGKILL cutting cleanup off; `wait` is interrupted instantly
  sleep "$CHECK_INTERVAL" &
  wait $!
  GAP=$(( $(date +%s) - LAST_TS ))
  WOKE=0
  if [ "$GAP" -gt $((CHECK_INTERVAL + 45)) ]; then
    WOKE=1
    log "wake detected (${GAP}s gap) — verifying tunnel"
  fi
  ITER=$((ITER + 1))

  # scheduler died (OOM, crash)? bring it back — only if this script owns it
  if [ -n "$SCHED_PID" ] && ! kill -0 "$SCHED_PID" 2>/dev/null; then
    log "scheduler died — restarting"
    start_scheduler
  fi

  # data-api health (restart only if this script owns it)
  LOCAL_OK=0
  if curl -s -m 5 "http://127.0.0.1:$DATA_API_PORT/health" >/dev/null 2>&1; then
    LOCAL_OK=1
    API_FAILS=0
  else
    API_FAILS=$((API_FAILS + 1))
    if [ "$API_FAILS" -ge "$MAX_FAILS" ]; then
      if [ -n "$API_PID" ]; then
        log "data-api unresponsive — restarting gunicorn"
        kill "$API_PID" 2>/dev/null
        wait "$API_PID" 2>/dev/null
        start_api || log "ERROR: data-api restart failed — will keep retrying"
      else
        log "WARN: data-api on :$DATA_API_PORT unreachable (not started by this script — restart it yourself)"
      fi
      API_FAILS=0
    fi
  fi

  # cloudflared process died outright → restart regardless of origin state
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    log "cloudflared exited — restarting tunnel"
    restart_tunnel
    TUNNEL_FAILS=0
    continue
  fi

  # Only judge the tunnel through a live origin: with gunicorn down the edge
  # correctly serves 502, and restarting cloudflared would just churn URLs.
  if [ "$LOCAL_OK" -ne 1 ]; then
    continue
  fi

  if tunnel_healthy; then
    TUNNEL_FAILS=0
    if [ "$PUBLISHED_URL" != "$TUNNEL_URL" ]; then
      # heal a publish that failed earlier (e.g. DB was unreachable mid-wake)
      publish_url "$TUNNEL_URL" && PUBLISHED_URL="$TUNNEL_URL"
    elif [ $((ITER % DB_RECHECK_EVERY)) -eq 0 ]; then
      # heal external overwrites: this script is not necessarily the row's
      # only writer (another machine, a stray instance's shutdown clear)
      DB_URL=$(published_db_url 2>/dev/null)
      if [ "$DB_URL" != "$TUNNEL_URL" ]; then
        log "published URL drifted (db has: ${DB_URL:-nothing}) — republishing"
        publish_url "$TUNNEL_URL" && PUBLISHED_URL="$TUNNEL_URL"
      fi
    fi
    continue
  fi

  TUNNEL_FAILS=$((TUNNEL_FAILS + 1))
  # after a wake the quick tunnel is dead for good — don't wait out MAX_FAILS
  if [ "$WOKE" -eq 1 ] || [ "$TUNNEL_FAILS" -ge "$MAX_FAILS" ]; then
    log "tunnel unreachable through the edge (probe failures: $TUNNEL_FAILS) — restarting cloudflared"
    restart_tunnel
    TUNNEL_FAILS=0
  fi
done
