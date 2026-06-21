"""Spotify monthly listeners + top track (by plays), from the rendered artist page.

The figure isn't in the Web API and open.spotify.com is a JS SPA, so we render the
page and read its visible text. The "Popular" list isn't ordered strictly by plays,
so we pick the most-played track. (token -> GraphQL is faster but TOTP-signed now.)
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlparse

from .base import ScrapeResult, render_html

_MONTHLY_RE = re.compile(r"([\d.,]+)\s*monthly listeners", re.IGNORECASE)
# A Popular-list row in the page's innerText: rank, name, (E?), plays, duration.
_TRACK_RE = re.compile(r"^\d+\n(.+?)\n(?:E\n)?([\d,]+)\n\d+:\d+", re.MULTILINE)


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


def _top_track(text: str):
    """Most-played track in the Popular section: (name, plays) or (None, None)."""
    start = text.find("Popular")
    if start == -1:
        return None, None
    block = text[start:]
    for marker in ("See more", "Artist pick", "Discography"):
        e = block.find(marker)
        if e != -1:
            block = block[:e]
            break
    best_name, best_plays = None, -1
    for m in _TRACK_RE.finditer(block):
        plays = int(m.group(2).replace(",", ""))
        if plays > best_plays:
            best_plays, best_name = plays, m.group(1).strip()
    return (best_name, best_plays) if best_name else (None, None)


def fetch_spotify(spotify_id_or_url: str) -> ScrapeResult:
    platform = "spotify"
    artist_id = _artist_id(spotify_id_or_url)
    if not artist_id:
        return ScrapeResult.failure(platform, "could not parse Spotify artist id")
    try:
        text = render_html(
            f"https://open.spotify.com/artist/{artist_id}",
            wait_text="monthly listeners",
            timeout_ms=25000,
            text=True,
        )
    except Exception as e:
        return ScrapeResult.failure(platform, f"render failed: {e}")

    m = _MONTHLY_RE.search(text)
    if not m:
        return ScrapeResult.failure(platform, "monthly listeners not found on page")
    data = {"monthly_listeners": int(re.sub(r"[.,\s]", "", m.group(1)))}

    name, plays = _top_track(text)
    if name:
        data["top_track_name"] = name
        if plays is not None:
            data["top_track_plays"] = plays

    return ScrapeResult.success(platform, data)
