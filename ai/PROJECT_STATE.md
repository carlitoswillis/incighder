# Current State

PURPOSE: High-level summary of the system's current focus, the product vision, and recent changes — the single place an agent reads first to avoid drift. (Absorbs the former `GOALS.md`.)

## Last Updated: 2026-06-29
## Current Focus: **Flattened & Vercel-ready.** Migrated off Docker to a native run (`./start_dev.sh`); Postgres→MySQL 8.4; flattened the Next app out of `incighder/incighder/` to the repo root; dropped Playwright/Chromium (all scrapers now HTTP — Spotify monthly listeners via the scrape.do render API, Instagram via the `IG_SESSIONID` cookie); Ollama→Gemini (`gemini-2.5-flash`) for AI verify; Spotify search ported to a native TS route. Next: keep collapsing the remaining `data-api` proxy endpoints into TS routes, and stand up a hosted MySQL + public `data-api` (or finish the TS port) for an actual Vercel deploy. Backlog: deep scraping/deploy tech debt (below), artist bio, data export, change alerts.

## Project Goal
Build a data application that gives A&Rs, labels, and artists a **holistic view of an artist's online traction and growth potential** by aggregating public metrics across music and social platforms — Spotify, YouTube, SoundCloud, Instagram, TikTok, and X — and tracking how they move over time.

---

## Product Vision & Metrics Roadmap
The long-term aim is a single dashboard that scores artist traction from many signals. Not every metric is reachable via public APIs; the list below is the north star plus an honest feasibility read. Status legend: ✅ implemented · 🟡 partial / proxy · 🔭 planned · 🚫 not feasible via public data (manual or third-party only).

### Identity & presence
- ✅ Artist name, genres, images, external URLs (Spotify)
- ✅ Instagram / TikTok / SoundCloud / YouTube handles (auto-discovered + AI-verified)
- 🟡 X/Twitter handle (manual entry — login wall)

### Followers & subscribers
- ✅ Spotify followers & popularity
- 🟡 Spotify monthly listeners (scraped, best-effort — not in the public API)
- ✅ YouTube subscribers · SoundCloud followers · Instagram followers · TikTok followers
- 🟡 X/Twitter followers (manual)

### Top content & performance
- ✅ Top Spotify track (name + popularity as a plays proxy)
- ✅ Top YouTube video (title + views) · top SoundCloud track (plays)
- ✅ YouTube total views & video count · SoundCloud track count · TikTok likes & video count · Instagram posts

### Engagement & growth
- ✅ Follower/subscriber growth over time (account-keyed `metric_snapshots`, sparklines, `/history`)
- 🚫 Per-post engagement rates (IG/TikTok/YT/X), avg views per video, virality, sound usage — require restricted post-level data; defer to manual or third-party providers
- 🚫 Spotify skip/save rate, algorithmic reach, playlist placements — not in the public API

### Streaming, revenue, fanbase, industry, quality
- 🚫 Apple/Amazon streams, Bandcamp/merch/ticket sales, superfans, Discord/Patreon, press, co-signs, brand deals — proprietary or qualitative; manual-input or future integrations only
- 🔭 Catalog size & release consistency (derivable from Spotify catalog — not yet surfaced)
- 🔭 Weighted cross-platform traction score (combine the signals above into one number)

### Hard constraints to remember
- Social APIs (IG/TikTok/X) are rate-limited and gated; we rely on careful scraping (24h TTL, jitter, stealth headers) with graceful per-platform degradation, never blocking other platforms.
- Spotify's related-artists API was retired in late 2024 → discovery uses Last.fm `getSimilar`.
- Scraping is fragile by nature; treat each scraper as best-effort and keep them isolated.

---

## Recent Changes
- **Bulk re-scrape + auto-discover** (`/artists/refresh`, `/api/refresh` → data-api `/refresh_artist`): select tracked artists → auto-discover socials for unlinked platforms (confident matches only) → scrape. Honors the per-platform 24h cache (fresh platforms are skipped, not re-scraped) and surfaces per-platform failure reasons in the UI.
- **Bulk tools hub**: `/artists/bulk` (import) and `/artists/refresh` now share one entry point via an Import/Refresh tab bar (`components/bulk-tabs.tsx`); nav collapsed from two items to one "Bulk".
- **Shareable artist pages**: `artists/[id]` split into a server `page.tsx` (exports `generateMetadata`, reads `lib/artist-meta.ts` straight from Postgres) + `artist-detail.tsx` (the existing client UI). Emits per-artist `<title>` and Open Graph/Twitter cards (name, Spotify image, genres) so links unfurl in iMessage/Slack/etc. Root layout uses a `"%s · Incighder"` title template.
- **Add-artist → Spotify search**: the top-right "Add artist" button now opens `/search_spotify` (full data); manual name-only add moved to its own "Manual" nav item (`/artists/add`).
- **Dev workflow**: data-api gunicorn now runs with `--reload` (compose `command`) so code edits take effect without a manual restart; `/api/refresh` hardened to return a clear error instead of crashing on non-JSON upstream responses.
- **Search-backed social discovery**: IG/TikTok auto-discovery now runs a free web search (Google Programmable Search, `web_search.py`) for the artist on each platform instead of blind name-slug guessing, so it finds handles that differ from the artist's name. Candidates are normalized to profile roots, AI-verified, ranked; the best is auto-filled and `alternates` are one-click switchable in the sources panel. Falls back to the name-slug guess when no search key is set. Needs `GOOGLE_CSE_KEY`/`GOOGLE_CSE_ID`.
- **Artist Discovery**: New `/discover` page — seed artist → Last.fm `getSimilar` → Spotify-enriched grid (followers/popularity + Last.fm listeners/playcount/tags), one-click "Track" reuses the insert pipeline; already-tracked artists are marked. Backend `similar_artists.py` + `/similar_artists` route; uses `LAST_FM_API_KEY`.
- **Scraping Plan**: Authored `SCRAPING_PLAN.md` for cross-platform metric scraping (the live engineering plan; supersedes the old GOALS phases).
- **Cleanup**: Fixed substrate drift, removed dead endpoints, guarded PATCH/scrape writes against column-name injection.
- **Artist Editing**: PATCH handling for artist info updates; full-field editing on `artists/[id]`; DELETE support.
- **Navigation/UI**: Global navigation bar (`app-shell`); shadcn-inspired dark slate/cyan system.

## Active Context
- **Branch**: `main` (commit directly to main for this repo)
- **Environment**: Local Development (Docker Compose)
- **Blockers**: None

## Next Steps
1. Artist bio section (start with a single-source pull — Last.fm `artist.getInfo` returns bios; Spotify's public API does not — then evolve toward an AI-synthesized summary across sources).
2. Data export (CSV/JSON).
3. Execute `SCRAPING_PLAN.md` follow-ups; keep `YOUTUBE_API_KEY` / `LAST_FM_API_KEY` provisioned in `.env`.


# Tasks

PURPOSE: Tracks active work and backlog. AI agents should update this after completing tasks.

## Active
- (nothing in progress — pick next from Backlog)

## Backlog
- [ ] **[DEEP TECH DEBT] Scraping & data-api architecture is fragile post-migration.** The 2026-06-28/29 de-dockerize + MySQL + de-Chromium pass shipped working but accrued real debt that will bite on deployment:
  - **Datacenter-IP blocking**: scrapers now use plain HTTP (no browser). That runs fine from a laptop but Instagram/TikTok/Spotify aggressively block cloud/serverless IPs — these scrapers will largely fail if the data-api ever runs on Vercel/Railway/etc. Needs a deliberate strategy: residential/rotating proxy, official APIs where they exist, and honest graceful degradation + alerting when a source goes dark.
  - **Undocumented internal endpoints**: IG `web_profile_info`, TikTok `__UNIVERSAL_DATA_FOR_REHYDRATION__`, and especially the Spotify pathfinder GraphQL (hardcoded persisted-query `sha256Hash` in `scrapers/spotify.py`, TOTP-gated token mint) break with zero notice when the sites change. No version pinning, no health checks, no fallback.
  - **Personal-credential coupling**: monthly-listeners / reliable IG depend on personal login cookies (`SPOTIFY_SP_DC`, `IG_SESSIONID`) in `.env`. These expire, can't be rotated automatically, and tie scraping to a personal account (ban risk). Needs proper secret handling, token refresh, and ideally a dedicated service account.
  - **data-api ↔ Next coupling**: the 9 Next API routes hardcode `http://127.0.0.1:5050`. Not deploy-portable. Needs a `DATA_API_URL` env var, and a decision on the bigger fork: port the API-call endpoints (spotify/similar/discover/preview/history/clear) into Next TS routes vs. host the Python service publicly. MySQL is the natural unification layer (scraper writes, Vercel reads).
  - **Migration leftovers**: dead selenium scripts (`followerCounts.py`, `artistSoundCloudScrape.py`); now-unused `Dockerfile`/`Dockerfile.dev`/`docker-compose.yml` + stale `start_db.sh`/`start_data_api.sh`/`start_incighder_dev.sh`; no DB migration framework (schema applied by drop-and-recreate, old data was lost in the PG→MySQL switch).
- [ ] Prioritize the most resume-impressive additions next (this is a portfolio/interview piece — weigh features by how well they demonstrate engineering depth, not just product value)
- [ ] discover feature should prioritize smaller artists that have super high match to the search
- [ ] ADD A BIO. BIOGRAPHY section for artists (v1: single source — Last.fm `artist.getInfo`; later: AI-synthesized summary across all sources)
- [ ] Top youtube video embedded in the artist page like as a hero under or over the stats idk yet
- [ ] Export artist data (CSV / JSON)
- [ ] Discovery seeded from an already-tracked artist (in-app, not just the `/discover` search box)
- [ ] Weighted cross-platform traction score
- [ ] Robust history charts (currently sparse — often only 2 points until more scans accrue)
- [ ] Change/threshold alerts (notify when a metric jumps X%) — `metric_snapshots` is the foundation; pairs with scheduled auto-scrape. Closes a gap vs competitors (see `COMPETITORS.md`)
- [ ] Playlist / chart-placement tracking — competitor table-stakes we lack (see `COMPETITORS.md`)

## Completed
- [x] **De-dockerize + flatten for Vercel (2026-06-29)**: removed Docker entirely (run natively via `./start_dev.sh`); **Postgres → MySQL 8.4** (`mysql2`/`PyMySQL`, `?` placeholders, `ON DUPLICATE KEY UPDATE`, update-then-SELECT in place of `RETURNING`); **flattened** the Next app from `incighder/incighder/` to the repo root; **dropped Playwright/Chromium** — all scrapers HTTP-only (TikTok rehydration blob, IG `web_profile_info` + `IG_SESSIONID` cookie, Spotify monthly listeners via **scrape.do** render API `SCRAPE_DO_TOKEN`); **Ollama → Gemini** (`gemini-2.5-flash`, `GOOGLE_AI_API_KEY`) in `ai_verify.py`; **Spotify search ported to a native TS route** (no data-api); remaining proxy routes parameterized via `DATA_API_URL`. data-api on :5050 (AirPlay owns 5000), `OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES` for macOS thread-fork safety.
- [x] Bulk re-scrape + social auto-discovery for tracked artists: `/artists/refresh` + `/api/refresh` → data-api `refresh_artist`; 24h-cache-aware (skips fresh platforms) and surfaces per-platform failure reasons (`artists/refresh/page.tsx`, `scrape_service.py`)
- [x] Bulk tools hub: Import/Refresh tabs over `/artists/bulk` + `/artists/refresh`; single "Bulk" nav entry (`components/bulk-tabs.tsx`)
- [x] Shareable artist pages: server-rendered per-artist `<title>` + Open Graph/Twitter link-preview cards; `[id]` split into server `page.tsx` + `artist-detail.tsx` client; `lib/artist-meta.ts` (`layout.tsx` title template)
- [x] Add-artist defaults to Spotify search (button → `/search_spotify`); manual name-only add given its own "Manual" nav entry
- [x] data-api gunicorn `--reload` in dev; `/api/refresh` hardened against non-JSON upstream responses
- [x] Bulk artist import: `/artists/bulk` — paste names → each auto-resolved to its top Spotify match → confirm/swap/skip per row (flags already-tracked & no-match) → batch insert via the existing `/api/spotify-search` + `/api/artists` (`insert_artist`) path; no backend changes (`artists/bulk/page.tsx`)
- [x] Search-backed IG/TikTok auto-discovery: free web search (Google Programmable Search) → normalized profile candidates → AI-verified + ranked → best auto-filled with one-click `alternates`; name-slug fallback when no key (`scrapers/web_search.py`, `scrapers/discovery.py`, `sources-panel.tsx`)
- [x] Artist discovery: `/discover` page (seed → Last.fm similar → Spotify-enriched grid → one-click Track)
- [x] UI design overhaul (Phases A–D): shadcn dark slate/cyan system, all pages redesigned (`DESIGN_OVERHAUL_PLAN.md`)
- [x] Scraping Phase 0-4: scrapers + `/scrape` + auto-discovery + metrics across the UI (`SCRAPING_PLAN.md`)
- [x] Growth-over-time: account-keyed metric snapshots + `/history` + sparklines (re-linking doesn't fake growth)
- [x] AI-verified discovery: local Ollama (`qwen2.5-coder`) checks auto-found IG/TikTok accounts; panel flags uncertain/mismatch (`ARCHITECTURE.md`)
- [x] Scheduled auto-scrape for growth: `scheduler` container runs a recurring sweep (`scrape_all`, TTL-respected, default 24h via `AUTO_SCRAPE_INTERVAL_HOURS`) appending growth snapshots (`scheduler.py`, `ARCHITECTURE.md`)
- [x] UI: removed misplaced Spotify logos from Incighder actions (Discover "Track", Spotify-search "Add to dataset" → neutral Plus); kept logos that genuinely open Spotify
- [x] Bug fix: Spotify scrape now backfills the Web API baseline (followers, popularity, genres, spotify_id, top track, images, external_urls) so manually-added artists get full data once their Spotify source is scraped
- [x] Artist editing (PATCH) + delete + manual insert (`/insert_artist_manual`)
- [x] Navigation bar; decoupled schema (spotify_id nullable); consolidated `schema.sql` to `data-api/`
- [x] Deploy with ngrok / cloudflared
