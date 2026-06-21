# Social & Streaming Scraping Plan

PURPOSE: Detailed implementation plan for pulling artist metrics that the Spotify
API no longer exposes (and that other platforms never did) via low-volume,
ban-resistant scraping. This is the active feature plan; see `PROJECT_STATE.md`
for status.

## Last Updated: 2026-06-20
## Status: Planned (not started)

---

## 1. Goal & Decisions

Aggregate an artist's cross-platform traction by either (a) pasting 4–8 profile
links or (b) auto-discovering them from the artist name, then scraping public
metrics into the existing `artists` record.

Decisions captured from discussion:
- **Input modes: Both.** Manual link paste is the base; DuckDuckGo auto-discovery
  pre-fills candidate links for the user to confirm.
- **Platforms: all, phased by reliability** — Spotify monthly listeners, YouTube,
  SoundCloud (reliable first), then Instagram/TikTok (best-effort), then X (manual).
- **Cost/deps: rogue & free.** Playwright headless browser is allowed; YouTube uses
  its free official API; discovery uses DuckDuckGo's free HTML endpoint. **No paid
  SERP APIs, no paid social-data providers, no proxy/CAPTCHA farms.**

## 2. Operating Principle — Anti-Ban Strategy

At our scale (a handful of artists, refreshed at most daily) bans come from
**volume** and from hitting the **most-defended endpoint**, not from missing some
evasion trick. The strategy is low volume + softest data path + look human.

Rules every scraper must follow (enforced in `scrapers/base.py`):
1. **Cache hard, refresh rarely.** Per-platform TTL of 24h. Serve from DB unless
   `force=true`. This is the single biggest ban-avoider.
2. **Serialize + jitter.** One request at a time per platform; random 5–30s delay
   between external calls. Never burst-parallel.
3. **Look human.** Realistic `User-Agent` + full header set + `Accept-Language`;
   for JS/anti-bot sites a real headless browser (Playwright) with reused
   cookies/session and a stealth-ish config.
4. **Back off on signals.** On `429`/`403`: exponential backoff and pause that
   platform for the run. Never retry-storm.
5. **Prefer the softest path** (see §3): internal JSON/GraphQL or official APIs
   over full HTML rendering, embeds/oEmbed over authed surfaces.
6. **Own IP, low volume.** No proxies needed at this scale; datacenter IPs and free
   proxy lists get blocked — avoid both.
7. **Isolate failures.** Each platform runs in its own try/catch and returns
   `null` + an error status on failure; one dead platform never breaks the others.
   Partial results, always.

Explicitly out of scope (wrong tool for this scale; where legal/cost/maintenance
risk actually lives): proxy-rotation farms, CAPTCHA-solving services, fake/farmed
accounts. If a platform blocks us, the fallback is **manual entry for that field**,
not escalation.

## 3. Per-Platform Data Paths

| Platform | Primary method | Fallback | Fields | Reliability | Maintenance risk |
|---|---|---|---|---|---|
| **Spotify** | Playwright render of the artist page → read "monthly listeners" text (token→GraphQL deferred: Spotify now TOTP-signs the token endpoint) | — | `monthly_listeners` | Medium | Page markup changes |
| **YouTube** | Official **Data API v3** (`channels.list` stats; `search.list` order=viewCount for top video) | — | `youtube_subscribers`, `youtube_top_video_{title,views}` | High | None (just quota) |
| **SoundCloud** | Extract `client_id` from site JS once → `api-v2.soundcloud.com/resolve` + `/users/{id}/tracks` | — | `soundcloud_followers`, `soundcloud_top_track{,_plays}` | Med-High | `client_id` rotates |
| **Instagram** | `i.instagram.com/api/v1/users/web_profile_info/?username=` w/ `x-ig-app-id` header | Playwright render, parse `og:description` ("X Followers…") | `instagram_followers` | Low | Session-gating / rate limits |
| **TikTok** | Playwright render of `tiktok.com/@handle`, parse `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON | — | `tiktok_followers`, `tiktok_likes` | Low | Markup/bot detection changes |
| **X/Twitter** | **Manual entry** (login wall since 2023) | — | `x_followers` | N/A | — |

Spotify artist ID is parsed from a pasted `open.spotify.com/artist/<id>` URL, or
reused from the existing `spotify_id`/`id` we already store.

## 4. Architecture

Scrapers live in the Python `data-api` (the right layer for external I/O). Unlike
the existing one-script-per-subprocess pattern, scrapers are **imported and called
in-process** — Playwright is too expensive to cold-start per request.

```
data-api/
  scrapers/
    __init__.py
    base.py          # ScrapeResult dataclass; throttle/jitter; shared requests.Session;
                     #   Playwright browser manager (launched once at startup, reused);
                     #   backoff + global scrape lock (serialize external calls)
    spotify.py       # fetch_spotify(spotify_id_or_url) -> ScrapeResult
    youtube.py       # fetch_youtube(channel_url_or_handle, api_key) -> ScrapeResult
    soundcloud.py    # fetch_soundcloud(profile_url) -> ScrapeResult
    instagram.py     # fetch_instagram(handle_or_url) -> ScrapeResult
    tiktok.py        # fetch_tiktok(handle_or_url) -> ScrapeResult
    discovery.py     # duckduckgo_find(name, platforms) -> {platform: {url, title}}
  scrape_service.py  # orchestrates: TTL check -> dispatch -> assemble partial result -> persist
```

- A shared sync Playwright browser is launched at Flask startup and reused; a
  module-level lock serializes scrapes (we want low concurrency anyway).
- `scrape_service.py` owns the DB read/write and TTL logic so individual scrapers
  stay pure (link in → data out).

## 5. Data Model Changes (`schema.sql`, `artists` table)

Headline scalar metrics (first-class so the table view can sort on them). Counts are
BIGINT — views/plays/likes routinely exceed INTEGER's 2.1B cap:
- `monthly_listeners BIGINT` *(widened from INTEGER)*
- `youtube_subscribers BIGINT`
- `youtube_top_video_title VARCHAR(255)`
- `youtube_top_video_views BIGINT`
- `soundcloud_followers BIGINT`
- `soundcloud_top_track VARCHAR(255)`
- `soundcloud_top_track_plays BIGINT`
- `instagram_followers BIGINT`
- `tiktok_followers BIGINT`
- `tiktok_likes BIGINT`
- `x_followers BIGINT`  *(manual)*

Flexible JSON (avoids a migration per future field):
- `social_links JSONB` — input URLs: `{ spotify, youtube, soundcloud, instagram, tiktok, x }`
- `scrape_meta JSONB` — per-platform freshness: `{ <platform>: { last_scraped_at, status: ok|error, error? } }`

**Applying it:** `apply_schema.py` does `DROP TABLE ... CASCADE` then recreates, so a
plain re-apply **wipes data**. Two paths:
- *Dev / disposable data:* edit `schema.sql`, run `./start_dev.sh` (full clean rebuild).
- *Preserve data:* add an idempotent `ALTER TABLE artists ADD COLUMN IF NOT EXISTS ...`
  migration (new `data-api/migrations/0001_social.sql` + a small runner) instead of
  re-applying the full schema.

## 6. API Surface

**data-api (Flask, `app.py`):**
- `POST /scrape` — body `{ artist_id, links: {platform: url}, force?: bool }`.
  Runs eligible scrapers (skips fresh ones unless `force`), persists, returns
  `{ results: { platform: { ok, data|error, scraped_at } }, artist: <updated row> }`.
- `POST /discover` — body `{ name, platforms?: [...] }` → `{ candidates: { platform: { url, title } } }`.

**Next.js proxy routes** (mirror existing `/api/spotify-search`):
- `incighder/src/app/api/scrape/route.ts` → forwards to `http://data-api:5000/scrape`
- `incighder/src/app/api/discover/route.ts` → forwards to `http://data-api:5000/discover`

## 7. Frontend Changes

On `/artists/[id]` add a **"Sources & Scraping"** panel:
- A link input per platform (pre-fillable / editable).
- **Auto-discover** button → `POST /api/discover` → fills candidate links for the
  user to confirm/edit before scraping.
- **Scrape now** button → `POST /api/scrape` → refreshes displayed metrics; shows
  per-platform success/failure and a "last updated" timestamp from `scrape_meta`.
- **Force refresh** toggle to bypass the 24h cache.

Surface the new metrics on the home cards (`/`), the table (`/table`, new sortable
columns), and the detail page. Keep `score.ts` as-is for now; a later pass can fold
the new signals into the score.

## 8. Discovery Flow (free, no paid search API)

DuckDuckGo and Bing both bot-challenge server IPs (202 interstitials / shifting
markup), so search-scraping was dropped. `discovery.py` instead uses a reliable path
per platform: **YouTube** via the official Data API channel search; **SoundCloud**
via its api-v2 user search (same `client_id` the scraper extracts);
**Instagram/TikTok** via a best-guess handle from the artist name (flagged
`guess`). **Spotify** is omitted (the UI fills it from the stored `spotify_id`).
Results are *suggestions* — the user confirms before scraping.

## 9. Caching & Freshness

- Per-platform 24h TTL stored in `scrape_meta.<platform>.last_scraped_at`.
- `/scrape` skips platforms still within TTL unless `force=true`.
- UI shows freshness per platform and lets the user force-refresh one artist.
- *Future:* a nightly cron (`schedule`/cloud routine) to refresh all artists with
  large jitter — out of scope for the first slices.

## 10. Phased Implementation

**Phase 0 — Foundations** — code complete (image build validating)
- [x] Add `playwright`, `beautifulsoup4`, `lxml` to `requirements.txt`; install
      Chromium in the Dockerfile (`playwright install --with-deps chromium`). Base
      image bumped to `python:3.11-slim-bookworm` (buster is EOL and breaks apt).
- [x] Add new scraper files to Dockerfile `COPY` lines (dev already works via the
      `./data-api:/app` volume mount; this is for the prod image).
- [x] `scrapers/base.py`: `ScrapeResult`, shared session, throttle/jitter, backoff,
      Playwright manager, global lock.
- [x] Schema: columns added to `schema.sql` + idempotent
      `migrations/0001_social_columns.sql` for the data-preserving path.

**Phase 1 — Reliable three (end-to-end MVP)** — done & verified
- [x] `spotify.py` (Playwright render; token/GraphQL deferred — TOTP-signed token
      endpoint), `youtube.py` (Data API v3), `soundcloud.py` (client_id → api-v2).
      All three verified against live artists.
- [x] `scrape_service.py` (24h TTL cache, partial results, BIGINT persist) +
      `POST /scrape` + Next.js `/api/scrape` proxy.
- [x] "Sources & Scraping" panel on the artist page; persistence verified end-to-end.

**Phase 2 — Best-effort socials** — done & verified
- [x] `instagram.py` (web profile JSON → og:description browser fallback) and
      `tiktok.py` (rehydration JSON via browser). Wired into `/scrape` with
      per-platform failure isolation; both returned real counts live.
- [x] Manual `x_followers` field in the edit form (PATCH-allowlisted); the edit
      form now only sends edited fields so it no longer clobbers scraped values.

**Phase 3 — Discovery** — done
- [x] `discovery.py` (hybrid: YouTube Data API channel search + SoundCloud api-v2
      user search + IG/TikTok handle guess; DDG/Bing scraping dropped — both
      bot-block server IPs) + `POST /discover` + Next.js `/api/discover`.
- [x] "Auto-discover" button fills candidate links for the user to confirm.

**Phase 4 — Display & polish** — done (via the design overhaul)
- [x] Metrics on home cards (`StatTile`s), sortable table columns, detail
      `MetricGrid`; freshness ("updated Xh ago") in the `SourcesPanel`.
- [ ] (Optional, deferred) fold signals into `score.ts`; scheduled refresh.

## 11. Prerequisites

- **YouTube Data API key** (free, Google Cloud → enable "YouTube Data API v3").
  Add `YOUTUBE_API_KEY=...` to `.env`; it's already `env_file`'d into the
  `data-api` service in `docker-compose.yml`.
- Playwright Chromium in the data-api image (Phase 0).

## 12. Risks & Caveats

- **ToS:** scraping IG/TikTok/X violates their terms. For a private, low-volume tool
  the practical worst case is a temporary IP block, not legal action — but it is a
  ToS violation. Not legal advice.
- **Fragility:** scrapers break when sites change. Spotify's persisted-query hash and
  SoundCloud's `client_id` rotate; IG/TikTok markup shifts. Budget for maintenance
  and keep failures isolated.
- **Reliability tiers are real:** treat IG/TikTok/X as best-effort with manual
  fallback; don't block the feature on them.
- **Image size / cold start:** Playwright + Chromium meaningfully enlarge the
  data-api image and add startup cost.

## 13. Verification

- Per-platform: a smoke test against one known artist (e.g. an established act) that
  asserts a plausible non-null metric, plus a graceful-`null` test for a bad link.
- End-to-end: paste links in the UI → scrape → confirm DB rows + UI render; confirm
  TTL skip and `force` override; confirm one failing platform yields partial results.
