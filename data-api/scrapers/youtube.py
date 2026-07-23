"""YouTube channel metrics via the official Data API v3.

This is the official, keyed API - no scraping/anti-ban needed, so we skip the
global throttle. Quota (not bans) is the limiter: channels.list/videos.list cost
1 unit, search.list costs 100; the default 10k/day quota covers ~90 artists/day.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import unquote, urlparse

from .base import ScrapeResult, get_session

API = "https://www.googleapis.com/youtube/v3"


def _to_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _channel_query(url_or_handle: str) -> Optional[dict]:
    """Map a channel URL/handle to channels.list params, or None to fall back to search."""
    s = (url_or_handle or "").strip()
    if not s:
        return None
    if s.startswith("@"):
        return {"forHandle": s}
    path = urlparse(s).path if "://" in s else s
    parts = [p for p in path.split("/") if p]
    if not parts:
        return None
    if parts[0] == "channel" and len(parts) > 1:
        return {"id": parts[1]}
    if parts[0] == "user" and len(parts) > 1:
        return {"forUsername": parts[1]}
    last = unquote(parts[-1])
    if last.startswith("@"):
        return {"forHandle": last}
    return None  # /c/CustomName or bare term -> resolve via search


def _api_get(session, resource: str, params: dict, api_key: str) -> dict:
    params = {**params, "key": api_key}
    resp = session.get(f"{API}/{resource}", params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def fetch_youtube(url_or_handle: str, api_key: Optional[str]) -> ScrapeResult:
    platform = "youtube"
    if not api_key:
        return ScrapeResult.failure(platform, "YOUTUBE_API_KEY not set")
    try:
        session = get_session()
        query = _channel_query(url_or_handle)
        if query is None:
            term = (url_or_handle or "").rstrip("/").split("/")[-1].lstrip("@")
            search = _api_get(session, "search", {
                "part": "snippet", "type": "channel", "q": term, "maxResults": 1,
            }, api_key)
            items = search.get("items", [])
            if not items:
                return ScrapeResult.failure(platform, f"no channel found for '{term}'")
            query = {"id": items[0]["snippet"]["channelId"]}

        chan = _api_get(session, "channels",
                        {"part": "snippet,statistics", **query}, api_key)
        items = chan.get("items", [])
        if not items:
            return ScrapeResult.failure(platform, "channel not found")
        ch = items[0]
        stats = ch.get("statistics", {})
        data = {
            "youtube_channel_id": ch.get("id"),
            "youtube_channel_title": ch.get("snippet", {}).get("title"),
            "youtube_subscribers": _to_int(stats.get("subscriberCount")),
            "youtube_total_views": _to_int(stats.get("viewCount")),
            "youtube_video_count": _to_int(stats.get("videoCount")),
            "profile_pic_url": ((ch.get("snippet", {}).get("thumbnails") or {}).get("high")
                                or (ch.get("snippet", {}).get("thumbnails") or {}).get("default")
                                or {}).get("url"),
        }

        # search.list's viewCount order is approximate, so fetch the top handful and
        # pick the real most-viewed by actual view count.
        try:
            top = _api_get(session, "search", {
                "part": "snippet", "type": "video", "order": "viewCount",
                "channelId": ch["id"], "maxResults": 10,
            }, api_key)
            vids = [
                it["id"]["videoId"]
                for it in top.get("items", [])
                if it.get("id", {}).get("videoId")
            ]
            if vids:
                vresp = _api_get(session, "videos",
                                 {"part": "snippet,statistics", "id": ",".join(vids)},
                                 api_key)
                best = max(
                    vresp.get("items", []),
                    key=lambda v: int(v.get("statistics", {}).get("viewCount") or 0),
                    default=None,
                )
                if best:
                    data["youtube_top_video_title"] = best["snippet"]["title"]
                    data["youtube_top_video_views"] = _to_int(
                        best["statistics"].get("viewCount"))
        except Exception:
            pass  # subscriber count already captured; top video is optional

        return ScrapeResult.success(platform, data)
    except Exception as e:
        return ScrapeResult.failure(platform, str(e))
