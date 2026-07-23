"""Twitch follower counts via the public web GQL endpoint.

Uses the Client-ID the twitch.tv website itself ships (no account/API keys),
same best-effort footing as the other scrapers. One POST per scrape, throttled
per-host by the shared session rules.
"""
from __future__ import annotations

import re

import requests

from .base import DEFAULT_USER_AGENT, ScrapeResult, throttle

# The twitch.tv web client's public Client-ID (embedded in their frontend JS —
# not a secret). If Twitch rotates it, update from any twitch.tv page request.
_WEB_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"

_LOGIN_RE = re.compile(r"twitch\.tv/([A-Za-z0-9_]{3,25})")


def _login_from_url(url: str) -> str | None:
    m = _LOGIN_RE.search(url or "")
    return m.group(1).lower() if m else None


def fetch_twitch(profile_url: str) -> ScrapeResult:
    platform = "twitch"
    login = _login_from_url(profile_url)
    if not login:
        return ScrapeResult.failure(platform, f"could not parse channel from {profile_url!r}")
    try:
        throttle("gql.twitch.tv")
        r = requests.post(
            "https://gql.twitch.tv/gql",
            json={
                "query": "query($login: String!) { user(login: $login) { id displayName profileImageURL(width: 300) followers { totalCount } } }",
                "variables": {"login": login},
            },
            headers={
                "Client-ID": _WEB_CLIENT_ID,
                "User-Agent": DEFAULT_USER_AGENT,
            },
            timeout=15,
        )
        r.raise_for_status()
        user = (r.json().get("data") or {}).get("user")
        if not user:
            return ScrapeResult.failure(platform, f"channel {login!r} not found")
        return ScrapeResult.success(platform, {
            "twitch_followers": (user.get("followers") or {}).get("totalCount"),
            "profile_pic_url": user.get("profileImageURL"),
        })
    except Exception as e:
        return ScrapeResult.failure(platform, f"twitch lookup failed: {e}")
