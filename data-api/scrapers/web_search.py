"""Free web search via Google Programmable Search (Custom Search JSON API).

Used by link discovery to find an artist's real social profiles even when their
handle differs from their name (preferred handle taken, stage vs. legal name,
etc.) — a blind name-slug guess can't recover from that, a search can.

Free tier: 100 queries/day. Needs GOOGLE_CSE_KEY (API key) and GOOGLE_CSE_ID
(the Programmable Search Engine "cx" id, configured to search the whole web).
Both come from https://programmablesearchengine.google.com + Google Cloud.
Best-effort: returns [] if unconfigured or on any error, so callers degrade to
the name-slug guess instead of breaking.
"""
from __future__ import annotations

import os

from .base import get_session

CSE_API = "https://www.googleapis.com/customsearch/v1"


def is_configured() -> bool:
    return bool(os.getenv("GOOGLE_CSE_KEY") and os.getenv("GOOGLE_CSE_ID"))


def web_search(query: str, *, site: str | None = None, num: int = 5) -> list[str]:
    """Return up to `num` result link URLs for `query` (optionally on one site).

    `site` restricts results to a single domain (e.g. "instagram.com"). Never
    raises — an unconfigured or failed search yields an empty list.
    """
    key = os.getenv("GOOGLE_CSE_KEY")
    cx = os.getenv("GOOGLE_CSE_ID")
    if not (key and cx and query):
        return []
    params = {
        "key": key,
        "cx": cx,
        "q": query,
        "num": max(1, min(10, num)),
    }
    if site:
        params["siteSearch"] = site
        params["siteSearchFilter"] = "i"  # include only this site
    try:
        resp = get_session().get(CSE_API, params=params, timeout=20)
        resp.raise_for_status()
        items = resp.json().get("items", [])
        return [it["link"] for it in items if it.get("link")]
    except Exception:
        return []
