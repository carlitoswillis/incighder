"""TikTok follower/like counts (best-effort - strong bot detection).

TikTok signs its API requests, so we render the public profile page and read the
embedded __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob.
"""
from __future__ import annotations

import json
import re
from typing import Optional
from urllib.parse import urlparse

from .base import ScrapeResult, render_html

_REHYDRATION_RE = re.compile(
    r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
    re.DOTALL,
)


def _handle(handle_or_url: str) -> Optional[str]:
    s = (handle_or_url or "").strip()
    if not s:
        return None
    if "tiktok.com" in s:
        m = re.search(r"@([\w.\-]+)", urlparse(s).path)
        return m.group(1) if m else None
    return s.lstrip("@")


def _to_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def fetch_tiktok(handle_or_url: str) -> ScrapeResult:
    platform = "tiktok"
    handle = _handle(handle_or_url)
    if not handle:
        return ScrapeResult.failure(platform, "could not parse TikTok handle")
    try:
        html = render_html(f"https://www.tiktok.com/@{handle}", timeout_ms=25000)
    except Exception as e:
        return ScrapeResult.failure(platform, f"render failed: {e}")

    m = _REHYDRATION_RE.search(html)
    if not m:
        return ScrapeResult.failure(platform, "rehydration JSON not found (likely blocked)")
    try:
        scope = json.loads(m.group(1)).get("__DEFAULT_SCOPE__", {})
        info = scope.get("webapp.user-detail", {}).get("userInfo", {})
        stats = info.get("statsV2") or info.get("stats")
        if not stats:
            return ScrapeResult.failure(platform, "stats not in rehydration JSON")
        return ScrapeResult.success(platform, {
            "tiktok_followers": _to_int(stats.get("followerCount")),
            "tiktok_likes": _to_int(stats.get("heartCount") or stats.get("heart")),
            "tiktok_video_count": _to_int(stats.get("videoCount")),
        })
    except (ValueError, KeyError, TypeError) as e:
        return ScrapeResult.failure(platform, f"parse error: {e}")
