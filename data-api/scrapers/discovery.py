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


def _verified_guess(name: str, platform: str, url: str) -> dict:
    """A best-guess handle, AI-verified against the profile's preview when possible."""
    cand: dict = {"url": url, "guess": True, "verdict": "unknown"}
    try:
        from link_preview import link_preview
        from ai_verify import verify_account

        prev = link_preview(url)
        text = " | ".join(filter(None, [prev.get("title"), prev.get("description")])) or url
        v = verify_account(name, platform, text)
        if v:
            cand.update(confidence=v["confidence"], match=v["match"], reason=v["reason"])
            if v["match"] and v["confidence"] >= 0.6:
                cand["verdict"] = "match"
            elif not v["match"] and v["confidence"] >= 0.6:
                cand["verdict"] = "mismatch"
            else:
                cand["verdict"] = "uncertain"
    except Exception:
        pass
    return cand


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
            out["youtube"] = {"url": yt, "verdict": "verified"}
    if "soundcloud" in wanted:
        sc = _soundcloud(name)
        if sc:
            out["soundcloud"] = {"url": sc, "verdict": "verified"}
    if "instagram" in wanted and slug:
        out["instagram"] = _verified_guess(name, "instagram", f"https://www.instagram.com/{slug}")
    if "tiktok" in wanted and slug:
        out["tiktok"] = _verified_guess(name, "tiktok", f"https://www.tiktok.com/@{slug}")

    return out
