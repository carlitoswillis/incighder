"""SoundCloud metrics via the unofficial api-v2.

api-v2 needs a client_id, which we extract from the site and cache. We try a cheap
HTTP fetch of the homepage JS first; if SoundCloud bot-challenges that (it returns a
tiny 202 interstitial), we fall back to a real browser and capture the client_id
from the api-v2 calls the web app fires. The id rotates, so on an auth failure we
re-extract once and retry.
"""
from __future__ import annotations

import re
import urllib.parse
from typing import Optional

from .base import DEFAULT_USER_AGENT, ScrapeResult, polite_get, throttle

_SCRIPT_RE = re.compile(r'<script[^>]+src="(https://[^"]*sndcdn\.com/assets/[^"]+\.js)"')
_CLIENT_ID_RE = re.compile(r'client_id\s*[:=]\s*"([A-Za-z0-9]{20,})"')

_client_id: Optional[str] = None


def _client_id_via_http() -> Optional[str]:
    try:
        home = polite_get("https://soundcloud.com/").text
    except Exception:
        return None
    for src in reversed(_SCRIPT_RE.findall(home)):
        try:
            js = polite_get(src).text
        except Exception:
            continue
        m = _CLIENT_ID_RE.search(js)
        if m:
            return m.group(1)
    return None


def _client_id_via_browser() -> Optional[str]:
    """Load a SoundCloud page in a real browser and capture the client_id from the
    api-v2 requests it fires - works when the plain HTTP homepage is bot-challenged."""
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return None
    holder: dict = {}
    throttle()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        try:
            page = browser.new_context(
                user_agent=DEFAULT_USER_AGENT, locale="en-US"
            ).new_page()

            def on_request(req):
                if "api-v2.soundcloud.com" in req.url and "client_id=" in req.url and "id" not in holder:
                    qs = urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query)
                    if qs.get("client_id"):
                        holder["id"] = qs["client_id"][0]

            page.on("request", on_request)
            try:
                page.goto("https://soundcloud.com/discover", wait_until="networkidle", timeout=25000)
            except Exception:
                pass  # may time out after we already captured the id
        finally:
            browser.close()
    return holder.get("id")


def _get_client_id(force: bool = False) -> Optional[str]:
    global _client_id
    if _client_id and not force:
        return _client_id
    cid = _client_id_via_http() or _client_id_via_browser()
    if cid:
        _client_id = cid
    return cid


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
            "soundcloud_track_count": user.get("track_count"),
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
