"""Orchestrates the per-platform scrapers for one artist.

Owns the DB read/write and the 24h cache policy so the platform scrapers stay
pure (link in -> ScrapeResult out). Returns partial results: a failure on one
platform never blocks the others. See ai/SCRAPING_PLAN.md.
"""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from scrapeArtistData import get_db_connection
from scrapers.base import ScrapeResult
from scrapers.instagram import fetch_instagram
from scrapers.soundcloud import fetch_soundcloud
from scrapers.spotify import fetch_spotify
from scrapers.tiktok import fetch_tiktok
from scrapers.youtube import fetch_youtube

CACHE_TTL = timedelta(hours=24)

# Scraped platforms (X is manual-entry only, handled in the UI / edit form).
PLATFORMS = ("spotify", "youtube", "soundcloud", "instagram", "tiktok")

# artists columns a scraper is allowed to write (guards the UPDATE identifiers).
ALLOWED_METRIC_COLUMNS = {
    # Spotify Web API baseline backfilled on scrape (so manually-added artists get it).
    "followers", "popularity", "genres", "spotify_id",
    "top_track_id", "top_track_popularity",
    "monthly_listeners", "top_track_name", "top_track_plays",
    "youtube_subscribers", "youtube_total_views", "youtube_video_count",
    "youtube_top_video_title", "youtube_top_video_views",
    "soundcloud_followers", "soundcloud_track_count",
    "soundcloud_top_track", "soundcloud_top_track_plays",
    "instagram_followers", "instagram_posts", "instagram_verified",
    "tiktok_followers", "tiktok_likes", "tiktok_video_count",
}

# Columns each platform owns - nulled when its source link is removed. (spotify_id is
# kept so the Web API fallback still resolves the artist after a link is cleared.)
PLATFORM_COLUMNS = {
    "spotify": ["monthly_listeners", "top_track_name", "top_track_plays",
                "followers", "popularity", "genres",
                "top_track_id", "top_track_popularity"],
    "youtube": ["youtube_subscribers", "youtube_total_views", "youtube_video_count",
                "youtube_top_video_title", "youtube_top_video_views"],
    "soundcloud": ["soundcloud_followers", "soundcloud_track_count",
                   "soundcloud_top_track", "soundcloud_top_track_plays"],
    "instagram": ["instagram_followers", "instagram_posts", "instagram_verified"],
    "tiktok": ["tiktok_followers", "tiktok_likes", "tiktok_video_count"],
}

# The headline follower-type metric per platform, snapshotted for growth tracking.
PRIMARY_METRIC = {
    "spotify": "monthly_listeners",
    "youtube": "youtube_subscribers",
    "soundcloud": "soundcloud_followers",
    "instagram": "instagram_followers",
    "tiktok": "tiktok_followers",
}


def _dispatch(platform: str, link, artist: dict) -> ScrapeResult:
    if platform == "spotify":
        return fetch_spotify(link or artist.get("spotify_id"))
    if platform == "youtube":
        return fetch_youtube(link, os.getenv("YOUTUBE_API_KEY"))
    if platform == "soundcloud":
        return fetch_soundcloud(link)
    if platform == "instagram":
        return fetch_instagram(link)
    if platform == "tiktok":
        return fetch_tiktok(link)
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

        # Submitted links are authoritative: a provided-but-empty value clears it.
        merged_links = {
            k: v
            for k, v in {**_as_dict(artist.get("social_links")), **links}.items()
            if v
        }
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

        with conn.cursor() as cur:
            for platform in PLATFORMS:
                r = results.get(platform)
                if not r or not r.get("ok") or r.get("skipped"):
                    continue
                metric = PRIMARY_METRIC.get(platform)
                value = r.get("data", {}).get(metric) if metric else None
                if value is None:
                    continue
                _maybe_snapshot(
                    cur,
                    artist_id,
                    platform,
                    _account_key(platform, merged_links.get(platform), r.get("data", {}), artist),
                    value,
                )
        conn.commit()
        return {"results": results, "artist": dict(zip(updated_cols, updated_row))}
    finally:
        conn.close()


def clear_platform(artist_id: str, platform: str) -> dict:
    """Remove a platform's source link, its metrics, and its scrape_meta entry."""
    conn = get_db_connection()
    if not conn:
        raise RuntimeError("database connection failed")
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT social_links, scrape_meta FROM artists WHERE id = %s",
                (artist_id,),
            )
            row = cur.fetchone()
            if not row:
                raise LookupError("artist not found")

        links = _as_dict(row[0])
        links.pop(platform, None)
        meta = _as_dict(row[1])
        meta.pop(platform, None)

        cols = PLATFORM_COLUMNS.get(platform, [])
        set_cols = cols + ["social_links", "scrape_meta"]
        set_vals = [None] * len(cols) + [json.dumps(links), json.dumps(meta)]
        assignments = ", ".join(f"{c} = %s" for c in set_cols)
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE artists SET {assignments} WHERE id = %s RETURNING *",
                set_vals + [artist_id],
            )
            updated_row = cur.fetchone()
            updated_cols = [d[0] for d in cur.description]
        conn.commit()
        return dict(zip(updated_cols, updated_row))
    finally:
        conn.close()


def _account_key(platform, link, data, artist):
    """Stable identity for the specific linked account, so growth is measured within
    one account's timeline (not across a wrong -> right account switch)."""
    if platform == "youtube":
        return data.get("youtube_channel_id")
    if platform == "soundcloud":
        uid = data.get("soundcloud_user_id")
        return f"sc:{uid}" if uid is not None else None
    if platform == "spotify":
        m = re.search(r"artist/([A-Za-z0-9]+)", link or "")
        return m.group(1) if m else (artist.get("spotify_id") or None)
    if platform in ("instagram", "tiktok"):
        if not link:
            return None
        segs = [s for s in urlparse(link).path.split("/") if s]
        return f"{platform}:{segs[0].lstrip('@').lower()}" if segs else None
    return None


def _maybe_snapshot(cur, artist_id, platform, account_key, value):
    cur.execute(
        "SELECT value FROM metric_snapshots WHERE artist_id = %s AND platform = %s "
        "AND account_key IS NOT DISTINCT FROM %s ORDER BY captured_at DESC LIMIT 1",
        (artist_id, platform, account_key),
    )
    last = cur.fetchone()
    if last and last[0] == value:
        return  # unchanged for this account; skip duplicate point
    cur.execute(
        "INSERT INTO metric_snapshots (artist_id, platform, account_key, value) "
        "VALUES (%s, %s, %s, %s)",
        (artist_id, platform, account_key, value),
    )


def metric_history(artist_id: str) -> dict:
    """Per-platform follower time series for the CURRENTLY-linked account only."""
    conn = get_db_connection()
    if not conn:
        raise RuntimeError("database connection failed")
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT platform, account_key, captured_at, value FROM metric_snapshots "
                "WHERE artist_id = %s ORDER BY captured_at",
                (artist_id,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    by_platform = defaultdict(list)
    for platform, account_key, ts, value in rows:
        by_platform[platform].append((account_key, ts, value))

    out: dict = {}
    for platform, series in by_platform.items():
        current_key = series[-1][0]  # most recent account wins
        pts = [
            {"t": ts.isoformat(), "v": int(value)}
            for (account_key, ts, value) in series
            if account_key == current_key
        ]
        if pts:
            out[platform] = {
                "account_key": current_key,
                "points": pts,
                "current": pts[-1]["v"],
                "first": pts[0]["v"],
                "change": pts[-1]["v"] - pts[0]["v"],
                "since": pts[0]["t"],
            }
    return out
