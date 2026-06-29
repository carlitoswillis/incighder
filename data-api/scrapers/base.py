"""Shared scraping infrastructure.

Operating rules (see ai/SCRAPING_PLAN.md section 2): low volume, serialized
external calls with jitter, realistic headers, backoff on 429/403, isolated
failures. Individual platform scrapers import these helpers and return a
ScrapeResult; they should not raise to the caller.
"""
from __future__ import annotations

import os
import random
import threading
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import requests

# Realistic current desktop Chrome UA. Refresh occasionally (maintenance point).
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

DEFAULT_HEADERS = {
    "User-Agent": DEFAULT_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Spacing between any two external requests (seconds), jittered in this range.
# Kept modest because the real anti-ban lever is the 24h cache (low daily volume);
# override with SCRAPE_THROTTLE_MIN / SCRAPE_THROTTLE_MAX (e.g. 0 in tests).
THROTTLE_MIN_SECONDS = float(os.getenv("SCRAPE_THROTTLE_MIN", "2.0"))
THROTTLE_MAX_SECONDS = float(os.getenv("SCRAPE_THROTTLE_MAX", "6.0"))

# Throttling is per-host: requests to the *same* host are serialized with the
# jittered gap (the anti-ban invariant), while different hosts run free. This lets
# us scrape an artist's platforms concurrently without ever bursting one site.
_registry_lock = threading.Lock()
_host_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)
_last_request_at: dict[str, float] = defaultdict(float)


def _host_key(host: Optional[str]) -> str:
    h = (host or "").lower()
    return h[4:] if h.startswith("www.") else (h or "default")


@dataclass
class ScrapeResult:
    """Uniform outcome of one platform fetch. ok=False carries an error string."""

    platform: str
    ok: bool
    data: dict = field(default_factory=dict)
    error: Optional[str] = None
    scraped_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    @classmethod
    def success(cls, platform: str, data: dict) -> "ScrapeResult":
        return cls(platform=platform, ok=True, data=data)

    @classmethod
    def failure(cls, platform: str, error: str) -> "ScrapeResult":
        return cls(platform=platform, ok=False, error=error)

    def to_dict(self) -> dict:
        return asdict(self)


def throttle(host: Optional[str] = None) -> None:
    """Block until it is polite to make the next external request to ``host``.

    Holds that host's lock for the wait so calls to the same host are serialized
    (we never burst-parallel one site), while different hosts proceed in parallel.
    Pass the request's hostname; a URL is also accepted and its host extracted.
    """
    if host and "://" in host:
        host = urlparse(host).hostname
    key = _host_key(host)
    with _registry_lock:
        lock = _host_locks[key]
    with lock:
        wait = random.uniform(THROTTLE_MIN_SECONDS, THROTTLE_MAX_SECONDS)
        elapsed = time.monotonic() - _last_request_at[key]
        if elapsed < wait:
            time.sleep(wait - elapsed)
        _last_request_at[key] = time.monotonic()


_session: Optional[requests.Session] = None
_session_lock = threading.Lock()


def get_session() -> requests.Session:
    """Process-wide requests session (persists cookies, reuses connections)."""
    global _session
    with _session_lock:
        if _session is None:
            _session = requests.Session()
            _session.headers.update(DEFAULT_HEADERS)
        return _session


def polite_get(
    url: str,
    *,
    headers: Optional[dict] = None,
    params: Optional[dict] = None,
    timeout: float = 20.0,
    max_retries: int = 2,
) -> requests.Response:
    """Throttled GET with jittered backoff on 429/403. Raises on final failure."""
    session = get_session()
    host = urlparse(url).hostname
    attempt = 0
    while True:
        throttle(host)
        resp = session.get(url, headers=headers, params=params, timeout=timeout)
        if resp.status_code in (429, 403) and attempt < max_retries:
            time.sleep((2 ** attempt) * random.uniform(5, 15))
            attempt += 1
            continue
        resp.raise_for_status()
        return resp


# Headless-browser rendering was removed: all scrapers now fetch over plain HTTP
# (authenticated via session cookies in .env where a site needs it), so the data-api
# no longer depends on Playwright/Chromium and can run anywhere — including serverless.


def shutdown() -> None:
    """No-op, kept so existing imports / atexit hooks stay valid."""
    return None
