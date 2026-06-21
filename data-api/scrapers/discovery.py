"""Best-effort profile-link discovery (free, no paid search API).

Search-engine scraping (DuckDuckGo/Bing) is unreliable from server IPs, so instead:
- YouTube: official Data API channel search (reliable).
- SoundCloud: api-v2 user search via the same client_id the scraper uses.
- Instagram / TikTok: a best-guess handle from the artist name (no reliable free
  search) - flagged as a guess for the user to confirm/edit before scraping.
Spotify is omitted: the UI already derives its link from the stored spotify_id.
"""
from __future__ import annotations

import os
import re

from .base import get_session, polite_get
from .soundcloud import _get_client_id

YT_API = "https://www.googleapis.com/youtube/v3/search"
SC_SEARCH = "https://api-v2.soundcloud.com/search/users"


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _youtube(name: str) -> str | None:
    key = os.getenv("YOUTUBE_API_KEY")
    if not key:
        return None
    try:
        resp = get_session().get(
            YT_API,
            params={
                "part": "snippet",
                "type": "channel",
                "q": name,
                "maxResults": 1,
                "key": key,
            },
            timeout=20,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if items:
            return f"https://www.youtube.com/channel/{items[0]['snippet']['channelId']}"
    except Exception:
        return None
    return None


def _soundcloud(name: str) -> str | None:
    try:
        cid = _get_client_id()
        if not cid:
            return None
        data = polite_get(
            SC_SEARCH, params={"q": name, "limit": 1, "client_id": cid}
        ).json()
        coll = data.get("collection", [])
        if coll and coll[0].get("permalink_url"):
            return coll[0]["permalink_url"]
    except Exception:
        return None
    return None


def discover_links(name: str, platforms: list[str] | None = None) -> dict:
    name = (name or "").strip()
    if not name:
        return {}
    wanted = set(platforms or ["youtube", "soundcloud", "instagram", "tiktok"])
    slug = _slug(name)
    out: dict = {}

    if "youtube" in wanted:
        yt = _youtube(name)
        if yt:
            out["youtube"] = {"url": yt}
    if "soundcloud" in wanted:
        sc = _soundcloud(name)
        if sc:
            out["soundcloud"] = {"url": sc}
    if "instagram" in wanted and slug:
        out["instagram"] = {"url": f"https://www.instagram.com/{slug}", "guess": True}
    if "tiktok" in wanted and slug:
        out["tiktok"] = {"url": f"https://www.tiktok.com/@{slug}", "guess": True}

    return out
