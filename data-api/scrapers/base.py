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
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional

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

_throttle_lock = threading.Lock()
_last_request_at = 0.0


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


def throttle() -> None:
    """Block until it is polite to make the next external request.

    Holds a global lock for the wait so all callers are serialized - we never
    burst-parallel a platform.
    """
    global _last_request_at
    with _throttle_lock:
        wait = random.uniform(THROTTLE_MIN_SECONDS, THROTTLE_MAX_SECONDS)
        elapsed = time.monotonic() - _last_request_at
        if elapsed < wait:
            time.sleep(wait - elapsed)
        _last_request_at = time.monotonic()


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
    attempt = 0
    while True:
        throttle()
        resp = session.get(url, headers=headers, params=params, timeout=timeout)
        if resp.status_code in (429, 403) and attempt < max_retries:
            time.sleep((2 ** attempt) * random.uniform(5, 15))
            attempt += 1
            continue
        resp.raise_for_status()
        return resp


# --- Shared headless browser (lazy, reused across scrapes) ---
_playwright = None
_browser = None
_browser_lock = threading.Lock()


def get_browser():
    """Lazily launch a single shared headless Chromium, reused across scrapes.

    Playwright is imported lazily so the HTTP-only scrapers still work in
    environments where the browser is not installed.
    """
    global _playwright, _browser
    with _browser_lock:
        if _browser is None:
            from playwright.sync_api import sync_playwright

            _playwright = sync_playwright().start()
            _browser = _playwright.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
        return _browser


def render_html(
    url: str,
    *,
    wait_selector: Optional[str] = None,
    wait_text: Optional[str] = None,
    timeout_ms: int = 20000,
) -> str:
    """Return a JS-rendered page's HTML via the shared browser (throttled).

    wait_selector waits for a CSS selector; wait_text waits until that substring
    appears in the page's visible text (case-insensitive) - useful for SPA values
    that render after load (e.g. Spotify monthly listeners).
    """
    throttle()
    context = get_browser().new_context(
        user_agent=DEFAULT_USER_AGENT,
        locale="en-US",
        viewport={"width": 1280, "height": 800},
    )
    try:
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        if wait_selector:
            page.wait_for_selector(wait_selector, timeout=timeout_ms)
        if wait_text:
            page.wait_for_function(
                "t => document.body && document.body.innerText.toLowerCase().includes(t)",
                arg=wait_text.lower(),
                timeout=timeout_ms,
            )
        return page.content()
    finally:
        context.close()


def shutdown() -> None:
    """Tear down the shared browser/Playwright (call on app shutdown)."""
    global _playwright, _browser
    with _browser_lock:
        if _browser is not None:
            _browser.close()
            _browser = None
        if _playwright is not None:
            _playwright.stop()
            _playwright = None
