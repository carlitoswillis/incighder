"""Best-effort profile-link discovery (free, no paid search API).

- YouTube: official Data API channel search (reliable).
- SoundCloud: api-v2 user search via the same client_id the scraper uses.
- Instagram / TikTok: free web search (Google Programmable Search) for the
  artist on that platform, yielding real candidate profiles — including handles
  that differ from the artist's name (preferred handle taken, stage vs. legal
  name, etc.), which a blind name-slug guess can never find. Each candidate is
  AI-verified against its profile preview and the best is returned, with the
  runners-up as `alternates` for the user to switch to. When web search is
  unconfigured, falls back to the old name-slug guess so nothing regresses.

Spotify is omitted: the UI already derives its link from the stored spotify_id.
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlparse

from .base import get_session, polite_get
from .soundcloud import _get_client_id
from .web_search import web_search

YT_API = "https://www.googleapis.com/youtube/v3/search"
SC_SEARCH = "https://api-v2.soundcloud.com/search/users"

# Verify at most this many candidates per platform (bounds preview + LLM cost).
MAX_VERIFY = 4
# A match this strong ends the search early — no need to verify more candidates.
STRONG_MATCH_CONFIDENCE = 0.85

# Instagram path segments that are not profiles.
_IG_RESERVED = {
    "p", "reel", "reels", "explore", "stories", "tv", "accounts", "about",
    "directory", "legal", "developer", "api", "web", "graphql", "oauth",
    "emails", "challenge", "privacy", "help",
}
_HANDLE_RE = re.compile(r"^[a-zA-Z0-9._]+$")


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


def _ig_profile(url: str) -> str | None:
    """Normalize an Instagram URL to a profile root, or None if it isn't one."""
    parts = [p for p in urlparse(url).path.split("/") if p]
    if not parts:
        return None
    handle = parts[0].lower()
    if handle in _IG_RESERVED or not _HANDLE_RE.match(handle):
        return None
    return f"https://www.instagram.com/{handle}"


def _tiktok_profile(url: str) -> str | None:
    """Normalize a TikTok URL to a profile root (@handle), or None."""
    parts = [p for p in urlparse(url).path.split("/") if p]
    if not parts or not parts[0].startswith("@"):
        return None
    handle = parts[0][1:].lower()
    if not handle or not _HANDLE_RE.match(handle):
        return None
    return f"https://www.tiktok.com/@{handle}"


_PLATFORM = {
    "instagram": ("instagram.com", _ig_profile, lambda s: f"https://www.instagram.com/{s}"),
    "tiktok": ("tiktok.com", _tiktok_profile, lambda s: f"https://www.tiktok.com/@{s}"),
}


def _candidate_urls(name: str, platform: str) -> list[str]:
    """Ordered, deduped profile-URL candidates: search hits first, slug last."""
    site, normalize, slug_url = _PLATFORM[platform]
    urls: list[str] = []
    for hit in web_search(f"{name} {platform}", site=site, num=6):
        prof = normalize(hit)
        if prof and prof not in urls:
            urls.append(prof)
    slug = _slug(name)
    if slug:  # always keep the name-slug guess as a fallback candidate
        fallback = slug_url(slug)
        if fallback not in urls:
            urls.append(fallback)
    return urls[:MAX_VERIFY]


def _verify(name: str, platform: str, url: str) -> dict:
    """AI-verify one candidate against its profile preview."""
    cand: dict = {"url": url, "verdict": "unknown"}
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


# Verdict desirability for ranking; confidence breaks ties within a verdict.
_VERDICT_RANK = {"match": 3, "unknown": 2, "uncertain": 1, "mismatch": 0}


def _score(cand: dict) -> tuple[int, float]:
    return (_VERDICT_RANK.get(cand["verdict"], 0), cand.get("confidence", 0.0))


def _discover_socials(name: str, platform: str) -> dict | None:
    """Search → verify candidates → return best (+ ranked alternates)."""
    urls = _candidate_urls(name, platform)
    if not urls:
        return None
    verified: list[dict] = []
    for url in urls:
        cand = _verify(name, platform, url)
        verified.append(cand)
        if cand["verdict"] == "match" and cand.get("confidence", 0) >= STRONG_MATCH_CONFIDENCE:
            break  # strong winner — stop spending preview/LLM calls
    verified.sort(key=_score, reverse=True)
    best = dict(verified[0])
    best["guess"] = True
    alternates = [
        {k: c[k] for k in ("url", "verdict", "confidence", "reason") if k in c}
        for c in verified[1:]
    ]
    if alternates:
        best["alternates"] = alternates
    return best


def discover_links(name: str, platforms: list[str] | None = None) -> dict:
    name = (name or "").strip()
    if not name:
        return {}
    wanted = set(platforms or ["youtube", "soundcloud", "instagram", "tiktok"])
    out: dict = {}

    if "youtube" in wanted:
        yt = _youtube(name)
        if yt:
            out["youtube"] = {"url": yt, "verdict": "verified"}
    if "soundcloud" in wanted:
        sc = _soundcloud(name)
        if sc:
            out["soundcloud"] = {"url": sc, "verdict": "verified"}
    for platform in ("instagram", "tiktok"):
        if platform in wanted:
            cand = _discover_socials(name, platform)
            if cand:
                out[platform] = cand

    return out
