"""Spotify artist data: Web API baseline + monthly listeners via a render API.

Two sources, merged:
- **Web API** (spotipy) gives the baseline identity metrics — followers, popularity,
  genres, and the top track (by popularity). These are NOT scraped anywhere else, so a
  manually-added artist only gets them once their Spotify source is scraped.
- **Render API**: monthly listeners is absent from the Web API and the page is a JS SPA
  that Spotify protects against non-browser requests. So we render the public artist page
  through scrape.do (SCRAPE_DO_TOKEN) and parse "N monthly listeners" from the result.
  Best-effort, browser-free on our side, and serverless-friendly — skipped if no token.

Either source succeeding yields a successful result; neither being available is the
only failure.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Optional
from urllib.parse import urlparse

from .base import ScrapeResult, get_session, throttle

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


_RENDER_ATTEMPTS = 3


def _monthly_listeners(artist_id: str) -> tuple[Optional[int], Optional[str]]:
    """Render the public artist page via scrape.do and parse monthly listeners.

    Returns (value, miss_reason). (None, None) means the fetch wasn't attempted
    (no SCRAPE_DO_TOKEN). A miss_reason string means it was attempted and failed
    even after retries — the caller marks the scrape partial so the cache retries
    it on the next refresh instead of waiting out the 24h TTL. Renders are flaky
    (upstream 502s, JS not finishing before customWait), so retry both a non-200
    and a rendered page missing the listener count.
    """
    token = os.getenv("SCRAPE_DO_TOKEN")
    if not token:
        return None, None
    reason = "render failed"
    for attempt in range(_RENDER_ATTEMPTS):
        if attempt:
            time.sleep(5 * attempt)
        try:
            throttle("api.scrape.do")
            resp = get_session().get(
                "https://api.scrape.do/",
                params={
                    "token": token,
                    "url": f"https://open.spotify.com/artist/{artist_id}",
                    "render": "true",
                    "customWait": "3500",
                },
                timeout=120,
            )
            if resp.status_code != 200:
                reason = f"render failed: HTTP {resp.status_code}"
            else:
                m = _MONTHLY_RE.search(resp.text)
                if m:
                    return int(re.sub(r"[.,\s]", "", m.group(1))), None
                reason = "monthly listeners not in rendered page"
        except Exception as e:
            reason = f"render error: {e}"
        print(
            f"spotify monthly-listeners attempt {attempt + 1}/{_RENDER_ATTEMPTS}: {reason}",
            file=sys.stderr,
        )
    return None, reason


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

    # Monthly listeners isn't in the Web API; render the page via scrape.do.
    # Skipped silently when no token; an attempted-but-failed fetch marks the
    # result partial so the cache retries it next refresh.
    ml, ml_miss = _monthly_listeners(artist_id)
    if ml is not None:
        data["monthly_listeners"] = ml

    if not data:
        return ScrapeResult.failure(platform, "no data from Web API or render API")
    result = ScrapeResult.success(platform, data)
    if ml_miss:
        result.partial = f"monthly listeners missing ({ml_miss})"
    return result
