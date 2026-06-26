"""Spotify artist data: Web API baseline + scraped monthly listeners / top-track plays.

Two sources, merged:
- **Web API** (spotipy) gives the baseline identity metrics — followers, popularity,
  genres, and the top track (by popularity). These are NOT scraped anywhere else, so a
  manually-added artist only gets them once their Spotify source is scraped.
- **Rendered page**: monthly listeners (absent from the Web API) and the most-played
  track's play count. open.spotify.com is a JS SPA, so we render and read visible text.

Either source succeeding yields a successful result; neither one being available is the
only failure. (token -> GraphQL is faster but TOTP-signed now.)
"""
from __future__ import annotations

import json
import re
import sys
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


def _web_api_data(artist_id: str) -> dict:
    """Baseline identity metrics from the Spotify Web API. Best-effort: returns {} if
    credentials are missing or the call fails, so scraping still yields page data."""
    try:
        from scrapeArtistData import get_spotify_client  # data-api root on sys.path
        sp = get_spotify_client()
        if not sp:
            return {}
        artist = sp.artist(artist_id)
    except Exception as e:
        print(f"spotify web api lookup failed: {e}", file=sys.stderr)
        return {}

    data: dict = {
        "spotify_id": artist_id,
        "followers": (artist.get("followers") or {}).get("total"),
        "popularity": artist.get("popularity"),
        # genres/images/external_urls are JSON columns; serialize to match the insert path.
        "genres": json.dumps(artist.get("genres")) if artist.get("genres") is not None else None,
        "images": json.dumps(artist.get("images")) if artist.get("images") is not None else None,
        "external_urls": json.dumps(artist.get("external_urls")) if artist.get("external_urls") is not None else None,
    }
    try:
        tracks = sp.artist_top_tracks(artist_id).get("tracks") or []
        if tracks:
            top = tracks[0]  # API returns these ordered by popularity
            data["top_track_id"] = top.get("id")
            data["top_track_name"] = top.get("name")
            data["top_track_popularity"] = top.get("popularity")
    except Exception as e:
        print(f"spotify top-tracks lookup failed: {e}", file=sys.stderr)
    return {k: v for k, v in data.items() if v is not None}


def fetch_spotify(spotify_id_or_url: str) -> ScrapeResult:
    platform = "spotify"
    artist_id = _artist_id(spotify_id_or_url)
    if not artist_id:
        return ScrapeResult.failure(platform, "could not parse Spotify artist id")

    data = _web_api_data(artist_id)

    # Page render for monthly listeners + top-track plays (neither is in the Web API).
    try:
        text = render_html(
            f"https://open.spotify.com/artist/{artist_id}",
            wait_text="monthly listeners",
            timeout_ms=25000,
            text=True,
        )
        m = _MONTHLY_RE.search(text)
        if m:
            data["monthly_listeners"] = int(re.sub(r"[.,\s]", "", m.group(1)))
        name, plays = _top_track(text)
        if name:
            # Page's most-played track is a matched (name, plays) pair; prefer it for
            # the play count the Web API can't give.
            data["top_track_name"] = name
            if plays is not None:
                data["top_track_plays"] = plays
    except Exception as e:
        print(f"spotify page render failed: {e}", file=sys.stderr)

    if not data:
        return ScrapeResult.failure(platform, "no data from Web API or rendered page")
    return ScrapeResult.success(platform, data)
