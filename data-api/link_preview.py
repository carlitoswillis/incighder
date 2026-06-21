"""Best-effort OpenGraph link previews (cached).

Used by the /preview endpoint so the UI can preview a discovered profile link
(image + title) before scraping. Tries a fast HTTP fetch first; for sites that
bot-block server IPs (Instagram/TikTok) it falls back to a real browser.
"""
from __future__ import annotations

import re
from html import unescape

from scrapers.base import DEFAULT_HEADERS, get_session, render_html

_META_RE = re.compile(r"<meta\b[^>]*>", re.I)
_ATTR_RE = re.compile(r'([\w:-]+)\s*=\s*"([^"]*)"')
_KEYS = ("title", "image", "description", "site_name")

_cache: dict[str, dict] = {}


def _parse_og(html: str) -> dict:
    og: dict = {}
    for tag in _META_RE.findall(html):
        attrs = dict(_ATTR_RE.findall(tag))
        prop = attrs.get("property") or attrs.get("name") or ""
        if prop.startswith("og:") and "content" in attrs:
            og[prop[3:]] = unescape(attrs["content"])
    return {k: og[k] for k in _KEYS if og.get(k)}


def link_preview(url: str) -> dict:
    if not url or not url.startswith("http"):
        return {}
    if url in _cache:
        return _cache[url]

    data: dict = {}
    try:
        resp = get_session().get(url, headers=DEFAULT_HEADERS, timeout=8)
        if resp.status_code == 200 and "og:" in resp.text:
            data = _parse_og(resp.text)
    except Exception:
        pass

    # Browser fallback when HTTP is bot-blocked / has no usable preview.
    if not data.get("image") and not data.get("title"):
        try:
            data = _parse_og(render_html(url, timeout_ms=20000))
        except Exception:
            pass

    _cache[url] = data
    return data
