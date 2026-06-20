"""SoundCloud metrics via the unofficial api-v2.

api-v2 needs a client_id, which we extract from the site's JS bundles and cache.
The id rotates, so on an auth failure we re-extract once and retry.
"""
from __future__ import annotations

import re
from typing import Optional

from .base import ScrapeResult, polite_get

_SCRIPT_RE = re.compile(r'<script[^>]+src="(https://[^"]*sndcdn\.com/assets/[^"]+\.js)"')
_CLIENT_ID_RE = re.compile(r'client_id\s*[:=]\s*"([A-Za-z0-9]{20,})"')

_client_id: Optional[str] = None


def _get_client_id(force: bool = False) -> Optional[str]:
    global _client_id
    if _client_id and not force:
        return _client_id
    home = polite_get("https://soundcloud.com/").text
    # client_id tends to live in the later bundles, so try them last-first.
    for src in reversed(_SCRIPT_RE.findall(home)):
        try:
            js = polite_get(src).text
        except Exception:
            continue
        m = _CLIENT_ID_RE.search(js)
        if m:
            _client_id = m.group(1)
            return _client_id
    return None


def _api(path_or_url: str, cid: str, **params):
    params["client_id"] = cid
    url = path_or_url if path_or_url.startswith("http") \
        else f"https://api-v2.soundcloud.com{path_or_url}"
    return polite_get(url, params=params).json()


def fetch_soundcloud(profile_url: str) -> ScrapeResult:
    platform = "soundcloud"
    try:
        cid = _get_client_id()
        if not cid:
            return ScrapeResult.failure(platform, "could not obtain client_id")
        try:
            user = _api("/resolve", cid, url=profile_url)
        except Exception:
            cid = _get_client_id(force=True)  # id may have rotated
            if not cid:
                return ScrapeResult.failure(platform, "could not refresh client_id")
            user = _api("/resolve", cid, url=profile_url)

        if user.get("kind") != "user":
            return ScrapeResult.failure(platform, "URL did not resolve to a user")

        data = {
            "soundcloud_user_id": user.get("id"),
            "soundcloud_username": user.get("username"),
            "soundcloud_followers": user.get("followers_count"),
        }
        try:
            tracks = _api(f"/users/{user['id']}/tracks", cid, limit=20)
            coll = tracks.get("collection", [])
            if coll:
                top = max(coll, key=lambda t: t.get("playback_count") or 0)
                data["soundcloud_top_track"] = top.get("title")
                data["soundcloud_top_track_plays"] = top.get("playback_count")
        except Exception:
            pass  # follower count already captured; top track is optional

        return ScrapeResult.success(platform, data)
    except Exception as e:
        return ScrapeResult.failure(platform, str(e))
