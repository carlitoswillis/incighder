"""Spotify monthly listeners.

The figure isn't in the Web API, and open.spotify.com is a JS SPA, so we render
the artist page with Playwright and read the "monthly listeners" text. (The
token -> pathfinder GraphQL path is faster, but Spotify now TOTP-signs the token
endpoint, so rendering is the more durable default.)
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlparse

from .base import ScrapeResult, render_html

_MONTHLY_RE = re.compile(r"([\d.,]+)\s*monthly listeners", re.IGNORECASE)


def _artist_id(spotify_id_or_url: str) -> Optional[str]:
    s = (spotify_id_or_url or "").strip()
    if not s:
        return None
    if "open.spotify.com" in s:
        parts = [p for p in urlparse(s).path.split("/") if p]
        if len(parts) >= 2 and parts[0] == "artist":
            return parts[1].split("?")[0]
        return None
    if s.startswith("spotify:artist:"):
        return s.split(":")[-1]
    return s  # assume bare id


def fetch_spotify(spotify_id_or_url: str) -> ScrapeResult:
    platform = "spotify"
    artist_id = _artist_id(spotify_id_or_url)
    if not artist_id:
        return ScrapeResult.failure(platform, "could not parse Spotify artist id")
    try:
        html = render_html(
            f"https://open.spotify.com/artist/{artist_id}",
            wait_text="monthly listeners",
            timeout_ms=25000,
        )
    except Exception as e:
        return ScrapeResult.failure(platform, f"render failed: {e}")

    m = _MONTHLY_RE.search(html)
    if not m:
        return ScrapeResult.failure(platform, "monthly listeners not found on page")
    number = int(re.sub(r"[.,\s]", "", m.group(1)))
    return ScrapeResult.success(platform, {"monthly_listeners": number})
