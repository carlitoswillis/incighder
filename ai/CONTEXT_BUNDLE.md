# AI Context Bundle
Generated: Thu Jun 25 17:50:10 PDT 2026

## ⚠️ Agent Navigation Guide
1. Start with the **Current State** below to understand the focus.
2. Check **Active Tasks** for your specific assignment.
3. Only read files from the repository structure that are directly related to those tasks.
4. Do NOT perform full repository scans unless the task is an architectural audit.

## 1. Authoritative Rules (AGENTS.md)
# Agent Guidelines (AGENTS.md)

PURPOSE: This is the authoritative rulebook for AI assistants. It defines the 'how' and 'what' of the Incighder codebase.

## Project Context
- **Objective**: Build a data application for A&Rs/Labels to track artist audience traction.
- **Stack**: Next.js (TypeScript, Tailwind), Python (Data API), PostgreSQL, Docker.

## Architecture Constraints
- **Dual-API Structure**: The Next.js frontend calls Next.js API routes, which in turn communicate with the Python `data-api` service. See `ARCHITECTURE.md` for the route map.
- **Docker-First**: All services run in Docker. Prefer `docker compose up --build`; the root `./start_*.sh` scripts are convenience wrappers.
- **Database**: PostgreSQL is the source of truth. `data-api/schema.sql` is the master schema; apply it via `docker compose run --rm data-api python apply_schema.py`.
- **Local-First & Free AI**: Prioritize local inference and development. AI verification uses local Ollama only — no paid AI APIs.
- **Best-Effort Scraping**: Scrapers are isolated and partial-by-design; one platform failing must never block the others. Respect the 24h cache TTL.
- **Markdown Persistence**: All state must be tracked in `ai/*.md`.

## Coding Conventions
- **Explicit over Implicit**: Avoid hidden logic, reflection, or complex inheritance.
- **Verification First**: All changes must be verified via tests ideally
- **Compact Context**: Keep context files task-scoped and minimal.
- **TypeScript**: Ensure strict typing in the Next.js frontend.
- **Python**: Use idiomatic Python for the `data-api`.

## How to Navigate This Workspace (Priority Flow)
To minimize token waste and maximize focus, follow this priority sequence:
1. **START HERE**: Read `ai/PROJECT_STATE.md`. It defines the current high-level objective, the product/metrics vision (absorbs the former `GOALS.md`), and the task backlog.
2. **Operational Rules**: Read `AGENTS.md` (this file). Adhere strictly to these constraints.
3. **System Design**: Read `ai/ARCHITECTURE.md` for components, the API route map, and data flow.
4. **Deep Plans (as needed)**: `ai/SCRAPING_PLAN.md` (scraping engineering plan), `ai/DESIGN_OVERHAUL_PLAN.md` (UI system).
5. **Self-Correction**: If your understanding feels out of sync, run `ai/ai-context.sh` to regenerate `ai/CONTEXT_BUNDLE.md`. Update the source `ai/*.md` files after completing work; never hand-edit the generated bundle.

## 2. Architecture (ARCHITECTURE.md)
# Incighder Architecture

PURPOSE: Technical system design and data flow of the Incighder application.

## Overview
Incighder is a multi-service data application that aggregates and visualizes artist audience metrics from music and social platforms. Three Docker services: a Next.js frontend, a Python `data-api`, and PostgreSQL.

## System Components

### 1. Frontend (Next.js — `incighder/`)
- **Role**: User interface and primary application logic.
- **Stack**: Next.js (App Router, React 19, TypeScript), Tailwind CSS, shadcn-inspired UI (`src/components/ui/`), `lucide-react`/`react-icons`, `next-themes`, `sonner` toasts.
- **API routes as proxy/orchestrator** (`src/app/api/*/route.ts`): they don't hold business logic — they forward to the Python `data-api` (or, for reads, query Postgres directly via `pg`). Route map:
  - `GET/POST /api/artists` → list / insert · `GET/PATCH/DELETE /api/artists/[id]` → detail / edit / remove · `POST /api/artists/manual` → manual insert
  - `GET /api/spotify-search` · `GET /api/similar` · `POST /api/discover` · `POST /api/scrape` · `POST /api/clear-source` · `GET /api/history` · `GET /api/preview`
- **Pages**: `/` (artist cards), `/table` (sortable grid), `/discover`, `/artists/add`, `/artists/[id]` (detail + sources panel), `/about`, `/search_spotify`.
- **Key components**: `app-shell` (global nav), `artist-card`, `metric-grid`, `sources-panel`, `growth-section`, `sparkline`, `score-badge`, `delete-artist-dialog`, `link-preview`.

### 2. Data API (Python Flask — `data-api/app.py`)
- **Role**: All heavy lifting — data ingestion, search, scraping, AI verification, history.
- **Stack**: Flask, `spotipy`, `psycopg2`, Playwright (headless browser), BeautifulSoup4/lxml, `requests`.
- **Routes**: `/insert_artist`, `/spotify_search`, `/similar_artists`, `/scrape`, `/discover`, `/preview`, `/history`, `/clear_source`.
- **Subprocess pattern**: insert/search/similar shell out to standalone scripts (`insert_artist_from_json.py`, `spotify_search.py`, `similar_artists.py`) so each is runnable and testable in isolation; `app.py` marshals JSON in/out. Scrape/discover/history call modules in-process (`scrape_service`, `scrapers.discovery`, `link_preview`).
- **Scrape orchestration (`scrape_service.py`)**: owns the DB read/write and the **24h cache TTL**; fans out to per-platform scrapers in `scrapers/` (`spotify`, `youtube`, `soundcloud`, `instagram`, `tiktok`) which stay pure (`link in → ScrapeResult out`). Returns **partial results** — one platform failing never blocks the others. X is manual-entry only. Writes are guarded by an `ALLOWED_METRIC_COLUMNS` allowlist (no column-name injection); `PLATFORM_COLUMNS` defines what each source owns and is nulled on unlink.
- **Artist discovery (similar artists)**: `/discover` seeds on an artist name and uses the free **Last.fm `artist.getSimilar`** graph (Spotify's related-artists API was retired in late 2024), then enriches each result via Spotify search + Last.fm `artist.getInfo`. Backed by `similar_artists.py`; requires `LAST_FM_API_KEY`. "Track" reuses the standard `/insert_artist` pipeline.
- **Auto-discovery of links (`scrapers/discovery.py`)**: best-guesses official YouTube/SoundCloud/IG/TikTok profiles for an artist name.
- **AI verification (`ai_verify.py`, optional)**: cross-checks discovered IG/TikTok profiles against the artist with a **local LLM via Ollama** (`OLLAMA_URL`, default `host.docker.internal:11434`; `OLLAMA_MODEL`, default `qwen2.5-coder:14b`). Returns `{match, confidence, reason}`. Free, private, best-effort — **no paid AI APIs**; if Ollama is unreachable the guess is kept as unverified. Reaches the host's Ollama via `extra_hosts: host.docker.internal:host-gateway` in `docker-compose.yml`.

### 3. Database (PostgreSQL)
- **Role**: Source of truth for all artist metrics and history.
- **Master schema**: `data-api/schema.sql` — the **single source of truth**. Tables: `artists` (Spotify + per-platform metric columns, `social_links`, `scrape_meta`), `albums`, `tracks`, and `metric_snapshots`.
- **Growth tracking**: `metric_snapshots` stores `(artist_id, platform, account_key, value, captured_at)`. `account_key` ties a data point to the specific linked profile, so switching accounts starts a fresh timeline instead of registering a fake jump. Big counts are `BIGINT` (views/plays exceed `INTEGER`'s 2.1B cap).
- **Incremental migrations**: `data-api/migrations/*.sql` (`0001_social_columns`, `0002_more_metrics`, `0003_growth_snapshots`) record schema evolution; `schema.sql` is the consolidated truth.
- **Applying schema**: `docker compose run --rm data-api python apply_schema.py` (first run / reset).

### 4. Infrastructure (Docker)
- **Services** (`docker-compose.yml`): `db`, `data-api`, `incighder-dev` (Next.js). `extra_hosts` bridges the data-api to the host's Ollama.
- **Run**: `docker compose up --build` → frontend at `http://localhost:3000`.

## Data Flow
1. **Search**: Next.js → `/api/spotify-search` → `data-api /spotify_search` → Spotify.
2. **Discover**: seed name → `/api/discover|similar` → `data-api` → Last.fm `getSimilar` + Spotify/Last.fm enrichment → grid; "Track" feeds ingestion.
3. **Ingestion**: `data-api` transforms API data → inserts into PostgreSQL.
4. **Scrape**: `/api/scrape` → `scrape_service` → per-platform scrapers (TTL-cached) → updates `artists` + appends `metric_snapshots`.
5. **Display**: Next.js reads structured data (via API routes / `pg`) and renders dashboard, table, detail, sparklines, and history.

## AI Workspace Substrate
This repo uses an AI-assisted engineering substrate in `ai/`.
- **State & vision**: `ai/PROJECT_STATE.md` (read first; absorbs the former `GOALS.md`).
- **Rules**: `ai/AGENTS.md` defines agent constraints.
- **Plans**: `ai/SCRAPING_PLAN.md` (live scraping plan), `ai/DESIGN_OVERHAUL_PLAN.md` (UI system).
- **Context bundle**: `ai/CONTEXT_BUNDLE.md` is generated by `ai/ai-context.sh` — regenerate it after editing the docs above; don't hand-edit.
- **Flow**: Human Pilot → AI Implementation → Verification (`docker compose up` + manual QA).

## 3. Project State (PROJECT_STATE.md)
# Current State

PURPOSE: High-level summary of the system's current focus, the product vision, and recent changes — the single place an agent reads first to avoid drift. (Absorbs the former `GOALS.md`.)

## Last Updated: 2026-06-25
## Current Focus: Artist discovery (seed → similar artists) shipped. Backlog: scheduled auto-scrape, bulk import, data export.

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
1. Execute `SCRAPING_PLAN.md` follow-ups; keep `YOUTUBE_API_KEY` / `LAST_FM_API_KEY` provisioned in `.env`.
2. Scheduled auto-scrape for growth (cron/worker pulling metrics on a cadence).
3. Bulk artist import and data export (CSV/JSON).


# Tasks

PURPOSE: Tracks active work and backlog. AI agents should update this after completing tasks.

## Active
- (nothing in progress — pick next from Backlog)

## Backlog
- [ ] Scheduled auto-scrape for growth (recurring metric pulls)
- [ ] Bulk import: paste several artist names → auto-add + auto-discover socials
- [ ] Update / re-scrape multiple artists in one action
- [ ] Export artist data (CSV / JSON)
- [ ] Discovery seeded from an already-tracked artist (in-app, not just the `/discover` search box)
- [ ] Weighted cross-platform traction score
- [ ] Robust history charts (currently sparse — often only 2 points until more scans accrue)
- [ ] Remove Spotify logos from the design

## Completed
- [x] Artist discovery: `/discover` page (seed → Last.fm similar → Spotify-enriched grid → one-click Track)
- [x] UI design overhaul (Phases A–D): shadcn dark slate/cyan system, all pages redesigned (`DESIGN_OVERHAUL_PLAN.md`)
- [x] Scraping Phase 0-4: scrapers + `/scrape` + auto-discovery + metrics across the UI (`SCRAPING_PLAN.md`)
- [x] Growth-over-time: account-keyed metric snapshots + `/history` + sparklines (re-linking doesn't fake growth)
- [x] AI-verified discovery: local Ollama (`qwen2.5-coder`) checks auto-found IG/TikTok accounts; panel flags uncertain/mismatch (`ARCHITECTURE.md`)
- [x] Bug fix: Spotify scrape now backfills the Web API baseline (followers, popularity, genres, spotify_id, top track) so manually-added artists get full data once their Spotify source is scraped
- [x] Artist editing (PATCH) + delete + manual insert (`/insert_artist_manual`)
- [x] Navigation bar; decoupled schema (spotify_id nullable); consolidated `schema.sql` to `data-api/`
- [x] Deploy with ngrok / cloudflared

## 4. Repository Structure
```text
.
./start_incighder_dev.sh
./start_dev.sh
./start_data_api.sh
./start_db.sh
./incighder
./incighder/postcss.config.mjs
./incighder/Dockerfile
./incighder/tsconfig.tsbuildinfo
./incighder/node_modules
./incighder/next-env.d.ts
./incighder/README.md
./incighder/Dockerfile.dev
./incighder/public
./incighder/package-lock.json
./incighder/package.json
./incighder/components.json
./incighder/tsconfig.json
./incighder/eslint.config.mjs
./incighder/next.config.ts
./incighder/src
./data-api
./data-api/apply_schema.py
./data-api/migrations
./data-api/spotify_search.py
./data-api/scrape_service.py
./data-api/requirements.txt
./data-api/schema.sql
./data-api/link_preview.py
./data-api/Dockerfile
./data-api/ai_verify.py
./data-api/followerCounts.py
./data-api/scrapeArtistData.py
./data-api/__pycache__
./data-api/artistSoundCloudScrape.py
./data-api/flush_db.py
./data-api/similar_artists.py
./data-api/wait-for-it.sh
./data-api/insert_artist_from_json.py
./data-api/app.py
./data-api/scheduler.py
./data-api/scrapers
./data-api/brezzo.json
./README.md
./package-lock.json
./ai
./ai/ai-context.sh
./ai/DESIGN_OVERHAUL_PLAN.md
./ai/ARCHITECTURE.md
./ai/COMPETITORS.md
./ai/SCRAPING_PLAN.md
./ai/CONTEXT_BUNDLE.md
./ai/PROJECT_STATE.md
./ai/AGENTS.md
./docker-compose.yml
```

## 5. Recent Git Changes (Summary)
```text
581aabd docs: fuse GOALS into PROJECT_STATE; align ai/ docs + README with code
bce4b5d add more goals
e35414e docs: note artist discovery (Last.fm) in ARCHITECTURE; regen context bundle
77ff62f feat(discovery): /discover page — seed artist → similar artists
a3798b0 docs: prioritize docker compose up over bash wrapper scripts in README
```

## 6. Active Diff
```diff
diff --git a/ai/CONTEXT_BUNDLE.md b/ai/CONTEXT_BUNDLE.md
index 9e07faf..11232f3 100644
--- a/ai/CONTEXT_BUNDLE.md
+++ b/ai/CONTEXT_BUNDLE.md
@@ -1,5 +1,5 @@
 # AI Context Bundle
-Generated: Thu Jun 25 17:42:50 PDT 2026
+Generated: Thu Jun 25 17:50:10 PDT 2026
 
 ## ⚠️ Agent Navigation Guide
 1. Start with the **Current State** below to understand the focus.
@@ -177,7 +177,6 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 - [ ] Weighted cross-platform traction score
 - [ ] Robust history charts (currently sparse — often only 2 points until more scans accrue)
 - [ ] Remove Spotify logos from the design
-- [ ] Bug: manual artist add has no follower/etc. data even after adding Spotify as a source and scraping — works when added via search / Spotify-search instead
 
 ## Completed
 - [x] Artist discovery: `/discover` page (seed → Last.fm similar → Spotify-enriched grid → one-click Track)
@@ -185,6 +184,7 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 - [x] Scraping Phase 0-4: scrapers + `/scrape` + auto-discovery + metrics across the UI (`SCRAPING_PLAN.md`)
 - [x] Growth-over-time: account-keyed metric snapshots + `/history` + sparklines (re-linking doesn't fake growth)
 - [x] AI-verified discovery: local Ollama (`qwen2.5-coder`) checks auto-found IG/TikTok accounts; panel flags uncertain/mismatch (`ARCHITECTURE.md`)
+- [x] Bug fix: Spotify scrape now backfills the Web API baseline (followers, popularity, genres, spotify_id, top track) so manually-added artists get full data once their Spotify source is scraped
 - [x] Artist editing (PATCH) + delete + manual insert (`/insert_artist_manual`)
 - [x] Navigation bar; decoupled schema (spotify_id nullable); consolidated `schema.sql` to `data-api/`
 - [x] Deploy with ngrok / cloudflared
@@ -248,213 +248,12 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 
 ## 5. Recent Git Changes (Summary)
 ```text
+581aabd docs: fuse GOALS into PROJECT_STATE; align ai/ docs + README with code
 bce4b5d add more goals
 e35414e docs: note artist discovery (Last.fm) in ARCHITECTURE; regen context bundle
 77ff62f feat(discovery): /discover page — seed artist → similar artists
 a3798b0 docs: prioritize docker compose up over bash wrapper scripts in README
-7563006 docs: update README to reflect cross-platform scrapers, Ollama verification, and growth history; rename package-lock project name
 ```
 
 ## 6. Active Diff
 ```diff
-diff --git a/GOALS.md b/GOALS.md
-deleted file mode 100644
-index 76a3748..0000000
---- a/GOALS.md
-+++ /dev/null
-@@ -1,399 +0,0 @@
--Comprehensive Data Integration Plan for Artist Assessment (Revised)
--
--  Overall Goal: To build a data application that provides a holistic view
--  of an artist's online traction and potential, incorporating a wide array
--   of metrics from various digital platforms for A&R assessment, with a
--  continuously updated and reflective user interface.
--
--  1. Core Metrics to Integrate (User's Requirements)
--
--  Here's a structured list of the metrics we aim to integrate, categorized
--   for clarity:
--
--  A. Artist Identity & Basic Presence:
--   * Artist Name
--   * Instagram Handle
--   * TikTok Handle
--   * X/Twitter Handle
--
--
--  B. Follower & Subscriber Counts:
--   * Instagram Follower Count
--   * TikTok Follower Count
--   * X/Twitter Follower Count
--   * Spotify Monthly Listeners (Note: Proprietary, manual input/proxy
--     needed)
--   * SoundCloud Follower Count
--   * YouTube Subscriber Count
--
--
--  C. Top Content & Performance:
--   * Top Spotify Song
--   * Spotify Top Song Plays (Note: Public API provides popularity, not
--     exact plays)
--   * Top SoundCloud Song
--   * SoundCloud Top Song Plays
--   * Top YouTube Song
--   * YouTube Top Song Plays (Video Views)
--
--
--  D. Engagement & Growth Metrics:
--   * Instagram Engagement Rate (Likes + Comments ÷ Followers)
--   * TikTok Engagement Rate (Likes, Shares, Comments per video)
--   * TikTok Average Views Per Video
--   * TikTok Virality Score (Number of viral videos)
--   * TikTok Sounds Usage (How many people are using their original sounds)
--   * YouTube Engagement Rate (Likes, Comments, Watch Time per video)
--   * YouTube Average Views Per Video
--   * YouTube Shorts Performance (Views, Likes, Shares)
--   * X/Twitter Engagement Rate (Likes, Retweets, Comments per tweet)
--   * Follower Growth Rate (Across all platforms)
--   * Cross-Platform Presence (How well they perform across multiple
--     platforms)
--
```
