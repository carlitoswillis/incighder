"""Background auto-scrape scheduler — recurring metric pulls for growth tracking.

Runs as its own container (see docker-compose.yml). Every AUTO_SCRAPE_INTERVAL_HOURS
it sweeps all tracked artists via scrape_service.scrape_all(force=False); the 24h
cache TTL means only stale platforms are actually refetched. Each sweep appends growth
snapshots through the normal scrape path, so the /history charts fill in over time.
One artist failing never aborts the sweep. See ai/SCRAPING_PLAN.md / ai/ARCHITECTURE.md.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

from scrape_service import scrape_all

INTERVAL_HOURS = float(os.getenv("AUTO_SCRAPE_INTERVAL_HOURS", "24"))
# Delay the first sweep so the DB and other services settle on boot.
STARTUP_DELAY_SECONDS = float(os.getenv("AUTO_SCRAPE_STARTUP_DELAY", "60"))


def _log(msg: str) -> None:
    print(f"[scheduler {datetime.now(timezone.utc).isoformat()}] {msg}", flush=True)


def run_once() -> dict:
    _log("starting auto-scrape sweep")
    summary = scrape_all(force=False)
    ok = sum(1 for s in summary.values() if s.get("ok"))
    failed = len(summary) - ok
    _log(f"sweep complete: {len(summary)} artists, {ok} ok, {failed} failed")
    return summary


def main() -> None:
    _log(f"up; interval={INTERVAL_HOURS}h, startup_delay={STARTUP_DELAY_SECONDS}s")
    time.sleep(STARTUP_DELAY_SECONDS)
    while True:
        try:
            run_once()
        except Exception as e:  # keep the loop alive across transient failures
            _log(f"sweep error: {e}")
        time.sleep(INTERVAL_HOURS * 3600)


if __name__ == "__main__":
    main()
