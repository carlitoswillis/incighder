"""Instagram follower count (best-effort - Instagram blocks aggressively).

Uses the web profile JSON endpoint with the public web-app id header. Instagram
session-gates this hard, so set IG_SESSIONID in .env (your instagram.com `sessionid`
cookie) to authenticate the request — without it most lookups hit the login wall.
"""
from __future__ import annotations

import os
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
                })
        return ScrapeResult.failure(
            platform,
            f"profile lookup failed (HTTP {resp.status_code}; "
            f"{'set' if not sessionid else 'check'} IG_SESSIONID)",
        )
    except Exception as e:
        return ScrapeResult.failure(platform, f"request error: {e}")
