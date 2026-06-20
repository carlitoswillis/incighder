"""Instagram follower count (best-effort - Instagram blocks aggressively).

Primary: the web profile JSON endpoint with the public web-app id header. It's
heavily rate-limited/session-gated, so on failure we fall back to rendering the
profile page and reading the og:description meta ("N Followers, ...").
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlparse

from .base import DEFAULT_USER_AGENT, ScrapeResult, get_session, render_html, throttle

# Public web-app id used by instagram.com's own web client.
_IG_APP_ID = "936619743392459"
_OG_FOLLOWERS_RE = re.compile(r"([\d.,]+[KMB]?)\s*Followers", re.IGNORECASE)


def _handle(handle_or_url: str) -> Optional[str]:
    s = (handle_or_url or "").strip()
    if not s:
        return None
    if "instagram.com" in s:
        parts = [p for p in urlparse(s).path.split("/") if p]
        return parts[0] if parts else None
    return s.lstrip("@")


def _count_from_text(text: str) -> Optional[int]:
    """Parse '1,234,567' or abbreviated '1.2M' / '118K'."""
    text = text.strip()
    mult = 1
    if text and text[-1].upper() in "KMB":
        mult = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}[text[-1].upper()]
        text = text[:-1]
    text = text.replace(",", "")
    try:
        return int(float(text) * mult)
    except ValueError:
        return None


def fetch_instagram(handle_or_url: str) -> ScrapeResult:
    platform = "instagram"
    handle = _handle(handle_or_url)
    if not handle:
        return ScrapeResult.failure(platform, "could not parse Instagram handle")

    # Primary: web profile JSON endpoint.
    try:
        throttle()
        resp = get_session().get(
            "https://i.instagram.com/api/v1/users/web_profile_info/",
            params={"username": handle},
            headers={"x-ig-app-id": _IG_APP_ID, "User-Agent": DEFAULT_USER_AGENT},
            timeout=20,
        )
        if resp.status_code == 200:
            user = resp.json().get("data", {}).get("user")
            if user:
                return ScrapeResult.success(platform, {
                    "instagram_followers": user.get("edge_followed_by", {}).get("count"),
                })
    except Exception:
        pass  # fall through to the browser

    # Fallback: render the profile and read the og:description meta.
    try:
        html = render_html(f"https://www.instagram.com/{handle}/", timeout_ms=25000)
    except Exception as e:
        return ScrapeResult.failure(platform, f"render failed: {e}")

    m = re.search(r'<meta property="og:description" content="([^"]*)"', html)
    if m:
        fm = _OG_FOLLOWERS_RE.search(m.group(1))
        if fm:
            count = _count_from_text(fm.group(1))
            if count is not None:
                return ScrapeResult.success(platform, {"instagram_followers": count})
    return ScrapeResult.failure(platform, "followers not found (likely blocked / login wall)")
