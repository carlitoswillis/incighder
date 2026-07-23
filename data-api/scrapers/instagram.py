"""Instagram follower count (best-effort - Instagram blocks aggressively).

Uses the web profile JSON endpoint with the public web-app id header. Instagram
session-gates this hard, so set IG_SESSIONID in .env (your instagram.com `sessionid`
cookie) to authenticate the request — without it most lookups hit the login wall.
"""
from __future__ import annotations

import os
import re
from typing import Optional
from urllib.parse import urlparse

from .base import DEFAULT_USER_AGENT, ScrapeResult, get_session, throttle

# Public web-app id used by instagram.com's own web client.
_IG_APP_ID = "936619743392459"


def _handle(handle_or_url: str) -> Optional[str]:
    s = (handle_or_url or "").strip()
    if not s:
        return None
    if "instagram.com" in s:
        parts = [p for p in urlparse(s).path.split("/") if p]
        return parts[0] if parts else None
    return s.lstrip("@")


# og:description on a profile page: "25.5K Followers, 4,256 Following, 240 Posts ..."
_META_RE = re.compile(
    r'content="([\d.,KMkm]+)\s+Followers?,\s+[\d.,KMkm]+\s+Following,\s+([\d.,KMkm]+)\s+Posts',
)
_OG_IMAGE_RE = re.compile(r'property="og:image"\s+content="([^"]+)"')


def _approx_count(text: str) -> Optional[int]:
    """'2,064' -> 2064; '25.5K' -> 25500; '1.2M' -> 1200000."""
    t = text.replace(",", "").strip()
    mult = 1
    if t[-1:] in ("K", "k"):
        mult, t = 1_000, t[:-1]
    elif t[-1:] in ("M", "m"):
        mult, t = 1_000_000, t[:-1]
    try:
        return int(float(t) * mult)
    except ValueError:
        return None


def _fetch_via_html(handle: str, headers: dict) -> Optional[dict]:
    """Fallback for accounts the JSON API refuses (HTTP 400 despite auth).
    Instagram serves crawler user-agents a static page whose og: meta tags
    carry the counts — exact for small accounts, abbreviated (25.5K) for big
    ones. No cookies: the crawler treatment is for anonymous requests."""
    page_headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    }
    throttle("www.instagram.com")
    resp = get_session().get(
        f"https://www.instagram.com/{handle}/", headers=page_headers, timeout=20,
    )
    if resp.status_code != 200:
        return None
    m = _META_RE.search(resp.text)
    if not m:
        return None
    data = {
        "instagram_followers": _approx_count(m.group(1)),
        "instagram_posts": _approx_count(m.group(2)),
    }
    img = _OG_IMAGE_RE.search(resp.text)
    if img:
        data["profile_pic_url"] = img.group(1).replace("&amp;", "&")
    return data


def fetch_instagram(handle_or_url: str) -> ScrapeResult:
    platform = "instagram"
    handle = _handle(handle_or_url)
    if not handle:
        return ScrapeResult.failure(platform, "could not parse Instagram handle")

    headers = {"x-ig-app-id": _IG_APP_ID, "User-Agent": DEFAULT_USER_AGENT}
    sessionid = os.getenv("IG_SESSIONID")
    if sessionid:
        headers["Cookie"] = f"sessionid={sessionid}"

    try:
        throttle("i.instagram.com")
        resp = get_session().get(
            "https://i.instagram.com/api/v1/users/web_profile_info/",
            params={"username": handle},
            headers=headers,
            timeout=20,
        )
        if resp.status_code == 200:
            user = resp.json().get("data", {}).get("user")
            if user:
                return ScrapeResult.success(platform, {
                    "instagram_followers": user.get("edge_followed_by", {}).get("count"),
                    "instagram_posts": user.get("edge_owner_to_timeline_media", {}).get("count"),
                    "instagram_verified": user.get("is_verified"),
                    # not a DB column — scrape_service uses it as an avatar fallback
                    "profile_pic_url": user.get("profile_pic_url_hd") or user.get("profile_pic_url"),
                })
        # Some accounts 400 on the JSON API even when authenticated; the
        # profile page's meta tags still expose (possibly rounded) counts.
        try:
            html_data = _fetch_via_html(handle, headers)
        except Exception:
            html_data = None
        if html_data and html_data.get("instagram_followers") is not None:
            return ScrapeResult.success(platform, html_data)
        return ScrapeResult.failure(
            platform,
            f"profile lookup failed (HTTP {resp.status_code}; "
            f"{'set' if not sessionid else 'check'} IG_SESSIONID)",
        )
    except Exception as e:
        return ScrapeResult.failure(platform, f"request error: {e}")
