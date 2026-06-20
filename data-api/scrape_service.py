"""Orchestrates the per-platform scrapers for one artist.

Owns the DB read/write and the 24h cache policy so the platform scrapers stay
pure (link in -> ScrapeResult out). Returns partial results: a failure on one
platform never blocks the others. See ai/SCRAPING_PLAN.md.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

from scrapeArtistData import get_db_connection
from scrapers.base import ScrapeResult
from scrapers.soundcloud import fetch_soundcloud
from scrapers.spotify import fetch_spotify
from scrapers.youtube import fetch_youtube

CACHE_TTL = timedelta(hours=24)

# Platforms implemented in Phase 1 (Instagram/TikTok/X arrive in Phase 2).
PLATFORMS = ("spotify", "youtube", "soundcloud")

# artists columns a scraper is allowed to write (guards the UPDATE identifiers).
ALLOWED_METRIC_COLUMNS = {
    "monthly_listeners",
    "youtube_subscribers", "youtube_top_video_title", "youtube_top_video_views",
    "soundcloud_followers", "soundcloud_top_track", "soundcloud_top_track_plays",
}


def _dispatch(platform: str, link, artist: dict) -> ScrapeResult:
    if platform == "spotify":
        return fetch_spotify(link or artist.get("spotify_id"))
    if platform == "youtube":
        return fetch_youtube(link, os.getenv("YOUTUBE_API_KEY"))
    if platform == "soundcloud":
        return fetch_soundcloud(link)
    return ScrapeResult.failure(platform, "platform not implemented")


def _is_fresh(meta: dict, platform: str) -> bool:
    entry = (meta or {}).get(platform) or {}
    raw = entry.get("last_scraped_at")
    if not raw or entry.get("status") != "ok":
        return False
    try:
        ts = datetime.fromisoformat(raw)
    except ValueError:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - ts < CACHE_TTL


def _as_dict(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return {}
    return value or {}


def scrape_artist(artist_id: str, links: dict | None = None, force: bool = False) -> dict:
    links = links or {}
    conn = get_db_connection()
    if not conn:
        raise RuntimeError("database connection failed")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM artists WHERE id = %s", (artist_id,))
            row = cur.fetchone()
            if not row:
                raise LookupError("artist not found")
            colnames = [d[0] for d in cur.description]
        artist = dict(zip(colnames, row))

        merged_links = {**_as_dict(artist.get("social_links")),
                        **{k: v for k, v in links.items() if v}}
        meta = _as_dict(artist.get("scrape_meta"))

        results: dict = {}
        updates: dict = {}
        for platform in PLATFORMS:
            link = merged_links.get(platform)
            if not link and not (platform == "spotify" and artist.get("spotify_id")):
                continue
            if not force and _is_fresh(meta, platform):
                results[platform] = {"ok": True, "skipped": "cached",
                                     "scraped_at": meta[platform]["last_scraped_at"]}
                continue
            res = _dispatch(platform, link, artist)
            results[platform] = res.to_dict()
            if res.ok:
                updates.update({k: v for k, v in res.data.items()
                                if k in ALLOWED_METRIC_COLUMNS})
            meta[platform] = {"last_scraped_at": res.scraped_at,
                              "status": "ok" if res.ok else "error",
                              "error": res.error}

        set_cols = list(updates.keys()) + ["social_links", "scrape_meta"]
        set_vals = list(updates.values()) + [json.dumps(merged_links), json.dumps(meta)]
        assignments = ", ".join(f"{c} = %s" for c in set_cols)
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE artists SET {assignments} WHERE id = %s RETURNING *",
                set_vals + [artist_id],
            )
            updated_row = cur.fetchone()
            updated_cols = [d[0] for d in cur.description]
        conn.commit()
        return {"results": results, "artist": dict(zip(updated_cols, updated_row))}
    finally:
        conn.close()
