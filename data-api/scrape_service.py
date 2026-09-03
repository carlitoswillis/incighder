"""Orchestrates the per-platform scrapers for one artist.

Owns the DB read/write and the 24h cache policy so the platform scrapers stay
pure (link in -> ScrapeResult out). Returns partial results: a failure on one
platform never blocks the others. See ai/SCRAPING_PLAN.md.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import base64

from scrapeArtistData import get_db_connection
from scrapers.base import ScrapeResult
from scrapers.instagram import fetch_instagram
from scrapers.soundcloud import fetch_soundcloud
from scrapers.spotify import fetch_spotify
from scrapers.tiktok import fetch_tiktok
from scrapers.twitch import fetch_twitch
from scrapers.youtube import fetch_youtube

CACHE_TTL = timedelta(hours=24)

# How many artists the scheduled sweep works on at once. Safe to raise because
# throttle() locks per HOST, not per artist (see base.py): concurrent artists
# hitting the same site still serialize on that host's lock, so we never burst
# it — we only stop leaving hosts idle between artists. Each scrape_artist owns
# its own DB connection, so nothing is shared across sweep threads.
SWEEP_WORKERS = int(os.getenv("SCRAPE_SWEEP_WORKERS", "4"))

# Scraped platforms (X is manual-entry only, handled in the UI / edit form).
PLATFORMS = ("spotify", "youtube", "soundcloud", "instagram", "tiktok", "twitch")

# artists columns a scraper is allowed to write (guards the UPDATE identifiers).
ALLOWED_METRIC_COLUMNS = {
    # Spotify Web API baseline backfilled on scrape (so manually-added artists get it).
    "followers", "popularity", "genres", "spotify_id", "images", "external_urls",
    "top_track_id", "top_track_popularity",
    "monthly_listeners", "top_track_name", "top_track_plays",
    "youtube_subscribers", "youtube_total_views", "youtube_video_count",
    "youtube_top_video_title", "youtube_top_video_views",
    "soundcloud_followers", "soundcloud_track_count",
    "soundcloud_top_track", "soundcloud_top_track_plays",
    "instagram_followers", "instagram_posts", "instagram_verified",
    "tiktok_followers", "tiktok_likes", "tiktok_video_count",
    "twitch_followers",
}

# Columns each platform owns - nulled when its source link is removed. (spotify_id is
# kept so the Web API fallback still resolves the artist after a link is cleared.)
PLATFORM_COLUMNS = {
    "spotify": ["monthly_listeners", "top_track_name", "top_track_plays",
                "followers", "popularity", "genres", "images", "external_urls",
                "top_track_id", "top_track_popularity"],
    "youtube": ["youtube_subscribers", "youtube_total_views", "youtube_video_count",
                "youtube_top_video_title", "youtube_top_video_views"],
    "soundcloud": ["soundcloud_followers", "soundcloud_track_count",
                   "soundcloud_top_track", "soundcloud_top_track_plays"],
    "instagram": ["instagram_followers", "instagram_posts", "instagram_verified"],
    "tiktok": ["tiktok_followers", "tiktok_likes", "tiktok_video_count"],
    "twitch": ["twitch_followers"],
}

# Per-post/per-video rows (IG recent posts, YT uploads). There is no migration
# framework, so the table is created lazily before the first posts write —
# prod TiDB and local MySQL both self-heal. Keep this DDL in sync with schema.sql.
_POSTS_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS artist_posts (
    artist_id VARCHAR(255) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    post_id VARCHAR(128) NOT NULL,
    url VARCHAR(512) NULL,
    caption TEXT NULL,
    is_video TINYINT(1) NULL,
    posted_at TIMESTAMP NULL,
    likes BIGINT NULL,
    comments BIGINT NULL,
    views BIGINT NULL,
    thumbnail_url TEXT NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (artist_id, platform, post_id),
    INDEX idx_posts_artist (artist_id, platform, posted_at),
    CONSTRAINT fk_posts_artist FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""
# ^ collation must match artists.id (utf8mb4_unicode_ci) or the FK is rejected
#   (TiDB's database default utf8mb4_bin is incompatible — seen live as error 3780).

_posts_table_ready = False
_posts_table_lock = threading.Lock()


def _ensure_posts_table(conn) -> None:
    """Lazy CREATE TABLE IF NOT EXISTS, once per process. DDL implicitly commits,
    so this is called before any pending row writes in the transaction."""
    global _posts_table_ready
    with _posts_table_lock:
        if _posts_table_ready:
            return
        with conn.cursor() as cur:
            cur.execute(_POSTS_TABLE_DDL)
        conn.commit()
        _posts_table_ready = True


def _parse_posted_at(value):
    """Normalize a scraper's posted_at (epoch seconds or ISO 8601 string) to a
    naive-UTC datetime for the TIMESTAMP column; anything unparseable -> None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc).replace(tzinfo=None)
        except (ValueError, OSError, OverflowError):
            return None
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    return None


def _upsert_posts(cur, artist_id: str, posts: list) -> None:
    """Upsert post rows; counts refresh on re-scrape (fetched_at tracks the last
    time we saw the post). Posts never create metric_snapshots rows."""
    for post in posts:
        platform = post.get("platform")
        post_id = post.get("post_id")
        if not platform or not post_id:
            continue
        post_id = str(post_id)
        is_video = post.get("is_video")
        cur.execute(
            "INSERT INTO artist_posts (artist_id, platform, post_id, url, "
            "caption, is_video, posted_at, likes, comments, views, thumbnail_url) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE likes = VALUES(likes), "
            "comments = VALUES(comments), views = VALUES(views), "
            "caption = VALUES(caption), "
            "posted_at = COALESCE(VALUES(posted_at), posted_at), "
            "url = VALUES(url), is_video = VALUES(is_video), "
            "thumbnail_url = VALUES(thumbnail_url), fetched_at = NOW()",
            (
                artist_id,
                platform,
                post_id[:128],
                post.get("url"),
                post.get("caption"),
                int(bool(is_video)) if is_video is not None else None,
                _parse_posted_at(post.get("posted_at")),
                post.get("likes"),
                post.get("comments"),
                post.get("views"),
                post.get("thumbnail_url"),
            ),
        )


# The headline follower-type metric per platform, snapshotted for growth tracking.
PRIMARY_METRIC = {
    "spotify": "monthly_listeners",
    "youtube": "youtube_subscribers",
    "soundcloud": "soundcloud_followers",
    "instagram": "instagram_followers",
    "tiktok": "tiktok_followers",
    "twitch": "twitch_followers",
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
    if platform == "twitch":
        return fetch_twitch(link)
    return ScrapeResult.failure(platform, "platform not implemented")


# Avatar-fallback preference when an artist has no image: face-forward
# platforms first.
_AVATAR_PRIORITY = ("instagram", "tiktok", "twitch", "youtube", "soundcloud")


def _has_image(value) -> bool:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return bool(value)
    return bool(value)


def _download_avatar(url: str):
    """Fetch a profile picture and inline it as a data URI (survives CDN URL
    expiry, needs no file storage). Returns None on any failure — best-effort."""
    try:
        from scrapers.base import get_session, throttle
        from urllib.parse import urlparse
        throttle(urlparse(url).hostname)
        r = get_session().get(url, timeout=15)
        ctype = r.headers.get("Content-Type", "")
        # Avatars are small (IG hd ~320px, Twitch 300px). Hard cap keeps a data
        # URI row bounded (~530KB base64 worst case) so images never meaningfully
        # eat DB space; uploads are client-downscaled to 512px JPEG separately.
        if r.status_code != 200 or not ctype.startswith("image/") or len(r.content) > 400_000:
            return None
        return f"data:{ctype.split(';')[0]};base64,{base64.b64encode(r.content).decode()}"
    except Exception:
        return None


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

        # Decide what to fetch (honouring the per-platform cache), then dispatch
        # those platforms concurrently. They hit different hosts, and the per-host
        # throttle keeps us from ever bursting a single site. DB writes stay on
        # this thread, below, so the connection is never shared across threads.
        to_scrape: list[tuple[str, object]] = []
        for platform in PLATFORMS:
            link = merged_links.get(platform)
            if not link and not (platform == "spotify" and artist.get("spotify_id")):
                continue
            if not force and _is_fresh(meta, platform):
                results[platform] = {"ok": True, "skipped": "cached",
                                     "scraped_at": meta[platform]["last_scraped_at"]}
                continue
            to_scrape.append((platform, link))

        dispatched: dict = {}
        if to_scrape:
            with ThreadPoolExecutor(max_workers=len(to_scrape)) as pool:
                futures = {pool.submit(_dispatch, p, link, artist): p
                           for p, link in to_scrape}
                for fut in as_completed(futures):
                    platform = futures[fut]
                    try:
                        dispatched[platform] = fut.result()
                    except Exception as e:  # a scraper should never raise, but isolate it
                        dispatched[platform] = ScrapeResult.failure(platform, str(e))

        avatar_urls: dict = {}
        artist_posts: list = []
        for platform, _link in to_scrape:
            res = dispatched[platform]
            # Post-level rows ride alongside metrics under a 'posts' key: strip
            # them before the metric-column write (and before to_dict, so the
            # response payload isn't bloated). Persisted below into artist_posts.
            scraped_posts = res.data.pop("posts", None) if res.ok else None
            if scraped_posts:
                artist_posts.extend(scraped_posts)
            results[platform] = res.to_dict()
            if res.ok:
                pic = res.data.get("profile_pic_url")
                if pic:
                    avatar_urls[platform] = pic
                # Never write None over an existing metric: a "successful" scrape
                # with unparseable counts (soft-block) must not erase good data.
                # Clearing metrics is clear_platform's job, not a scrape's.
                updates.update({k: v for k, v in res.data.items()
                                if k in ALLOWED_METRIC_COLUMNS and v is not None})
            # "partial" (ok, but a metric the platform owns went missing — e.g.
            # the monthly-listeners render 502'd) is deliberately not fresh per
            # _is_fresh, so the next refresh retries it instead of waiting out
            # the TTL and losing a day of snapshots.
            status = "error" if not res.ok else ("partial" if res.partial else "ok")
            meta[platform] = {"last_scraped_at": res.scraped_at,
                              "status": status,
                              "error": res.error or res.partial}

        # Avatar fallback: someone with no picture (manual adds — skaters, DJs)
        # inherits their social profile pic. Never overwrites an existing image
        # (Spotify baseline or a manual upload).
        if "images" not in updates and not _has_image(artist.get("images")) and avatar_urls:
            for platform in _AVATAR_PRIORITY:
                if platform in avatar_urls:
                    data_uri = _download_avatar(avatar_urls[platform])
                    if data_uri:
                        updates["images"] = json.dumps([{"url": data_uri}])
                        break

        # Ensure the posts table BEFORE the row writes below: CREATE TABLE is an
        # implicit commit, so running it mid-transaction would split the commit.
        if artist_posts:
            try:
                _ensure_posts_table(conn)
            except Exception as e:
                print(f"artist_posts table ensure failed: {e}", file=sys.stderr)
                artist_posts = []  # skip posts; never block the metrics write

        set_cols = list(updates.keys()) + ["social_links", "scrape_meta"]
        set_vals = list(updates.values()) + [json.dumps(merged_links), json.dumps(meta)]
        assignments = ", ".join(f"{c} = %s" for c in set_cols)
        with conn.cursor() as cur:
            # MySQL has no UPDATE ... RETURNING; update then read the row back.
            cur.execute(
                f"UPDATE artists SET {assignments} WHERE id = %s",
                set_vals + [artist_id],
            )
            cur.execute("SELECT * FROM artists WHERE id = %s", (artist_id,))
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

        if artist_posts:
            try:
                with conn.cursor() as cur:
                    _upsert_posts(cur, artist_id, artist_posts)
            except Exception as e:  # posts are additive; never fail the scrape
                print(f"artist_posts upsert failed for {artist_id}: {e}",
                      file=sys.stderr)
        conn.commit()
        return {"results": results, "artist": dict(zip(updated_cols, updated_row))}
    finally:
        conn.close()


# Platforms whose profile links can be auto-discovered (spotify resolves via spotify_id).
DISCOVERABLE_PLATFORMS = ("youtube", "soundcloud", "instagram", "tiktok")

# Verdicts confident enough to auto-link in a bulk refresh without manual review.
# Uncertain / mismatch / unknown guesses are dropped so we never write a wrong link.
AUTO_ACCEPT_VERDICTS = {"verified", "match"}


def _artist_name_and_links(artist_id: str) -> tuple[str, dict]:
    conn = get_db_connection()
    if not conn:
        raise RuntimeError("database connection failed")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name, social_links FROM artists WHERE id = %s", (artist_id,))
            row = cur.fetchone()
            if not row:
                raise LookupError("artist not found")
            return row[0], _as_dict(row[1])
    finally:
        conn.close()


def refresh_artist(artist_id: str, force: bool = False, discover: bool = True) -> dict:
    """Auto-discover socials for any platform an artist isn't linked on yet
    (accepting only confident matches), then scrape every linked platform.

    Discovery is best-effort: if it fails or finds nothing, we still scrape the
    artist's existing links. Returns the scrape result plus the links we added.
    discover=False skips the search/LLM step entirely — a scrape-only refresh of
    the links the artist already has.
    """
    name, social_links = _artist_name_and_links(artist_id)
    missing = [p for p in DISCOVERABLE_PLATFORMS if not social_links.get(p)]

    discovered: dict = {}
    if discover and missing and name:
        try:
            from scrapers.discovery import discover_links
            for platform, cand in discover_links(name, missing).items():
                url = (cand or {}).get("url")
                if url and cand.get("verdict") in AUTO_ACCEPT_VERDICTS:
                    discovered[platform] = url
        except Exception as e:
            print(f"Refresh discover error for {artist_id}: {e}", file=sys.stderr)

    result = scrape_artist(artist_id, links=discovered or None, force=force)
    return {
        "artist_id": artist_id,
        "name": name,
        "discovered": discovered,
        "results": result["results"],
        "artist": result["artist"],
    }


def all_artist_ids() -> list:
    """Every tracked artist id, for the scheduled sweep."""
    conn = get_db_connection()
    if not conn:
        raise RuntimeError("database connection failed")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM artists ORDER BY name")
            return [r[0] for r in cur.fetchall()]
    finally:
        conn.close()


def _sweep_one(aid: str, force: bool) -> tuple[str, dict]:
    try:
        results = scrape_artist(aid, force=force).get("results", {})
        return aid, {
            "ok": True,
            "scraped": [p for p, r in results.items()
                        if r.get("ok") and not r.get("skipped")],
            "skipped": [p for p, r in results.items() if r.get("skipped")],
            # An artist is "ok" as long as scrape_artist didn't raise, so a
            # platform that failed outright, or succeeded while losing a metric
            # it owns (partial — e.g. the Spotify monthly-listeners render),
            # would otherwise be invisible to the caller. Report both per
            # platform so the scheduler's summary can surface them.
            "partial": {p: r["partial"] for p, r in results.items()
                        if r.get("ok") and r.get("partial")},
            "platform_errors": {p: (r.get("error") or "failed")
                                for p, r in results.items()
                                if not r.get("ok") and not r.get("skipped")},
        }
    except Exception as e:  # never let one artist abort the whole sweep
        return aid, {"ok": False, "error": str(e)}


def scrape_all(force: bool = False) -> dict:
    """Sweep every tracked artist (TTL-respected unless force). Returns a per-artist
    summary; one artist failing never aborts the sweep. Used by the scheduler.

    Artists are swept SWEEP_WORKERS at a time. The per-host throttle (not per-artist)
    is what keeps this polite: two artists hitting the same site still queue on that
    host's lock, so raising concurrency fills idle host time without ever bursting a
    single site. A larger roster gets a near-linear wall-clock win up to the point
    where every distinct host is kept busy."""
    ids = all_artist_ids()
    if not ids:
        return {}
    workers = max(1, min(SWEEP_WORKERS, len(ids)))
    summary: dict = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_sweep_one, aid, force) for aid in ids]
        for fut in as_completed(futures):
            aid, s = fut.result()
            summary[aid] = s
    return summary


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
            # MySQL has no UPDATE ... RETURNING; update then read the row back.
            cur.execute(
                f"UPDATE artists SET {assignments} WHERE id = %s",
                set_vals + [artist_id],
            )
            cur.execute("SELECT * FROM artists WHERE id = %s", (artist_id,))
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
        "AND account_key <=> %s ORDER BY captured_at DESC LIMIT 1",
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
