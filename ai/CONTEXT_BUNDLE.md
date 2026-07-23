# AI Context Bundle
Generated: Thu Jul 23 14:26:04 PDT 2026

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
- **Stack**: Next.js (TypeScript, Tailwind) flat at the repo root, Python `data-api`, MySQL 8.4. **No Docker** — runs natively. Targets a flat Vercel deploy.

## Architecture Constraints
- **Flat app, native run**: The Next.js app lives at the repo root (run `npm` there, not a subdir). Bring up the full stack with **`./start_dev.sh`** (MySQL + venv gunicorn data-api on :5050 + `npm run dev` on :3000). No Docker.
- **Two halves, collapsing**: Native TS routes own DB access (`mysql2`) and Spotify search; the rest still proxy to the Python `data-api` via `DATA_API_URL` (`src/lib/data-api.ts`). Direction: keep porting API-call endpoints into TS so the app stays flat/Vercel-deployable. See `ARCHITECTURE.md` for the route map.
- **Database**: MySQL is the source of truth (local 8.4 or a hosted MySQL via `DATABASE_URL` — see `DEPLOY.md`). `data-api/schema.sql` (MySQL DDL) is the master schema; apply it via `./.venv/bin/python apply_schema.py` from `data-api/` — **idempotent** (`CREATE TABLE IF NOT EXISTS`), safe on every boot. A destructive rebuild requires `--reset` + typed confirmation; NEVER call `--reset` from scripts. `mysql2` (Node) / `PyMySQL` (Python); `?` placeholders, no `RETURNING`. DB config is centralized: `src/lib/db.ts` (`getPool()`), `scripts/db-config.mjs`, and `_db_config()` in `data-api/scrapeArtistData.py` — never hand-roll a new pool/connection config.
- **Browser-free scraping**: No Playwright/Chromium. All scrapers are HTTP. Spotify monthly listeners renders via the **scrape.do** API (`SCRAPE_DO_TOKEN`); Instagram uses the `IG_SESSIONID` cookie. AI verification uses **Google Gemini** (`gemini-2.5-flash`, `GOOGLE_AI_API_KEY`).
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
Incighder aggregates and visualizes artist audience metrics from music and social platforms. It is a **flat Next.js app** (repo root) backed by **MySQL**, with a Python `data-api` for the heavy scraping/discovery work. **No Docker** — everything runs natively (`./start_dev.sh`), and the frontend is structured to deploy to **Vercel** as a single project.

> Migration note (2026-06-29): the app was de-dockerized, moved Postgres→MySQL, flattened out of the old `incighder/incighder/` nesting to the repo root, dropped Playwright/Chromium (all scrapers are now HTTP), and swapped Ollama→Gemini. See `PROJECT_STATE.md` history.

## System Components

### 1. Frontend (Next.js — repo root)
- **Role**: User interface and primary application logic. Lives at the repo root (Vercel auto-detects it; no Root Directory setting needed).
- **Stack**: Next.js 15 (App Router, React 19, TypeScript, Turbopack), Tailwind CSS, shadcn-inspired UI (`src/components/ui/`), `lucide-react`/`react-icons`, `next-themes`, `sonner` toasts.
- **DB access**: reads/writes MySQL directly via **`mysql2`** (`?` placeholders; no `RETURNING` — update/insert then SELECT). Pools configured from `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_PORT` (default `127.0.0.1:3306`, user/db `incighder`).
- **API routes** (`src/app/api/*/route.ts`):
  - **Native (no data-api)**: `GET/POST /api/artists` (list via mysql2 / insert proxies), `GET/PATCH/DELETE /api/artists/[id]`, `POST /api/artists/manual`, `GET /api/spotify-search` (calls the Spotify Web API directly with a cached client-credentials token).
  - **Proxy to data-api** via `DATA_API_URL` (`src/lib/data-api.ts`, default `http://127.0.0.1:5050`): `POST /api/discover`, `GET /api/similar`, `POST /api/scrape`, `POST /api/refresh`, `POST /api/clear-source`, `GET /api/history`, `GET /api/preview`, `POST /api/artists` (insert).
- **Pages**: `/` (artist cards), `/table` (sortable grid), `/discover`, `/artists/add`, `/artists/bulk`, `/artists/refresh`, `/artists/[id]` (detail + sources panel), `/search_spotify`.
- **Key components**: `app-shell`, `artist-card`, `metric-grid` (per-platform `stat-tile`s; Spotify tile = monthly listeners), `sources-panel`, `growth-section`, `sparkline`, `score-badge`.

### 2. Data API (Python Flask — `data-api/app.py`)
- **Role**: scraping, link discovery, AI verification, history. Runs from a local venv via **gunicorn on port 5050** (5000 is taken by macOS AirPlay). `--reload` in dev. Loads the repo-root `.env` via `load_dotenv()`.
- **Stack**: Flask, `spotipy`, **`PyMySQL`** (+`cryptography`), BeautifulSoup4/lxml, `requests`. **No Playwright/Chromium** — every scraper is HTTP-only.
- **Routes**: `/insert_artist`, `/spotify_search`, `/similar_artists`, `/scrape`, `/refresh_artist`, `/discover`, `/preview`, `/history`, `/clear_source`.
- **Subprocess pattern**: insert/search/similar shell out to standalone scripts (`insert_artist_from_json.py`, `spotify_search.py`, `similar_artists.py`) via `sys.executable` (not the literal `python`); `app.py` marshals JSON. Scrape/discover/history call modules in-process.
- **Scrape orchestration (`scrape_service.py`)**: owns the DB read/write and the **24h cache TTL**; fans out to per-platform scrapers in `scrapers/` (`spotify`, `youtube`, `soundcloud`, `instagram`, `tiktok`) which stay pure (`link in → ScrapeResult out`). Returns **partial results**. Writes guarded by `ALLOWED_METRIC_COLUMNS`; `PLATFORM_COLUMNS` defines per-source ownership.
- **Browser-free scraping (`scrapers/`)**: YouTube (Data API) and SoundCloud (api-v2 + scraped client_id) are pure HTTP. TikTok reads the server-rendered `__UNIVERSAL_DATA_FOR_REHYDRATION__` blob over plain HTTP. Instagram uses the `i.instagram.com` web-profile JSON API, authenticated with the **`IG_SESSIONID`** cookie (.env). **Spotify monthly listeners** (a JS-gated metric Spotify blocks for non-browsers) is fetched by rendering the public artist page through the **scrape.do** render API (`SCRAPE_DO_TOKEN`) and parsing "N monthly listeners"; everything else Spotify comes from the Web API.
- **Auto-discovery (`scrapers/discovery.py`)**: finds official profiles for an artist name. YouTube/SoundCloud use native search; IG/TikTok use a free web search (`web_search.py` → Google Programmable Search, `GOOGLE_CSE_KEY`/`GOOGLE_CSE_ID` if set, else a name-slug fallback), then AI-verifies candidates.
- **AI verification (`ai_verify.py`)**: cross-checks discovered IG/TikTok profiles using **Google Gemini** (`gemini-2.5-flash` via `GOOGLE_AI_API_KEY`). Returns `{match, confidence, reason}`. Best-effort — if unavailable the guess is kept unverified.

### 3. Database (MySQL 8.4)
- **Role**: Source of truth for all artist metrics and history. Local install via Homebrew `mysql@8.4`; DB `incighder`, user `incighder`.
- **Master schema**: `data-api/schema.sql` (MySQL DDL — `JSON` columns, `AUTO_INCREMENT`, `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, table-level `FOREIGN KEY`s on InnoDB). Tables: `artists`, `albums`, `tracks`, `metric_snapshots`.
- **Growth tracking**: `metric_snapshots(artist_id, platform, account_key, value, captured_at)`. `account_key` ties a point to the specific linked profile so account switches start a fresh timeline. Big counts are `BIGINT`.
- **Applying schema**: `./.venv/bin/python apply_schema.py` from `data-api/` — **idempotent** (`CREATE TABLE IF NOT EXISTS`; existing data untouched), so `start_dev.sh` safely runs it on every boot. Destructive rebuild: `apply_schema.py --reset` (interactive confirmation, or `APPLY_SCHEMA_RESET_CONFIRM=yes`). History: the old drop-and-recreate default silently wiped all data on every dev start — that was the recurring "DB lost everything" bug. There is no incremental-migration framework yet (see tech-debt backlog).
- **Connection config (all three runtimes)**: `DATABASE_URL` (`mysql://user:pass@host:port/db?sslmode=require`) wins; `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_SSL` fill gaps; defaults target local MySQL. Implemented once per runtime: `src/lib/db.ts` (`getPool()` — single shared mysql2 pool), `scripts/db-config.mjs`, `_db_config()` in `data-api/scrapeArtistData.py` (PyMySQL, TLS via certifi). Point `DATABASE_URL` at a hosted MySQL (TiDB Serverless/Aiven) and the whole stack follows — see `DEPLOY.md`.

### 4. Running it (native, no Docker)
- **`./start_dev.sh`** (repo root): starts MySQL 8.4 (skipped when `DATABASE_URL` is set), sets up the Python venv + installs deps on first run, ensures the schema, launches the data-api (gunicorn `:$DATA_API_PORT`, default 5050, with `OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES` for macOS thread-fork safety), then `npm run dev` (frontend `:$WEB_PORT`, default 3000). Ports are env-overridable: `DATA_API_PORT=8080 WEB_PORT=4000 ./start_dev.sh`.
- Frontend alone: `npm run dev` at the repo root. Data-api alone: venv gunicorn in `data-api/`.

### 5. Scheduler (auto-scrape worker — `data-api/scheduler.py`)
- Optional recurring metric pulls. Runs `python scheduler.py` (its own process) — a sleep/sweep loop that every `AUTO_SCRAPE_INTERVAL_HOURS` (default 24) calls `scrape_service.scrape_all(force=False)`. TTL means only stale platforms refetch; each sweep appends `metric_snapshots`.

## Data Flow
1. **Search**: Next.js `/api/spotify-search` → **Spotify Web API directly** (native TS, no data-api).
2. **Discover**: seed name → `/api/discover|similar` → `data-api` → Last.fm `getSimilar` + Spotify/Last.fm enrichment + Gemini verify → grid; "Track" feeds ingestion.
3. **Ingestion**: `data-api` transforms API data → inserts into MySQL.
4. **Scrape**: `/api/scrape` → `scrape_service` → per-platform HTTP scrapers (TTL-cached; Spotify monthly listeners via scrape.do) → updates `artists` + appends `metric_snapshots`.
5. **Display**: Next.js reads MySQL via `mysql2` and renders dashboard, table, detail, sparklines, history.

## Deployment (Vercel)
See **`DEPLOY.md`** (repo root) for the step-by-step. Shape: Vercel hosts the flat Next app with `DATABASE_URL` pointed at a free hosted MySQL (TiDB Serverless/Aiven) — full read/write deployed, with the committed JSON snapshot as read-only fallback when no DB is reachable. The `data-api` stays local (residential IP scrapes more reliably than datacenter ranges) writing to the same hosted DB; a cloudflared tunnel + `DATA_API_URL` in Vercel lets the deployed site trigger live operations. Long-term direction remains porting proxy endpoints into TS routes.

## AI Workspace Substrate
- **State & vision**: `ai/PROJECT_STATE.md` (read first).
- **Rules**: `ai/AGENTS.md`.
- **Plans**: `ai/SCRAPING_PLAN.md`, `ai/DESIGN_OVERHAUL_PLAN.md`.
- **Context bundle**: `ai/CONTEXT_BUNDLE.md` is generated by `ai/ai-context.sh` — regenerate after editing docs; don't hand-edit.
- **Flow**: Human Pilot → AI Implementation → Verification (`./start_dev.sh` + manual QA).

## 3. Project State (PROJECT_STATE.md)
# Current State

PURPOSE: High-level summary of the system's current focus, the product vision, and recent changes — the single place an agent reads first to avoid drift. (Absorbs the former `GOALS.md`.)

## Last Updated: 2026-07-23
## Current Focus: **Deploy-ready with hosted DB.** Killed the recurring data-wipe bug (apply_schema was drop-and-recreate and ran on every dev start — now idempotent, `--reset` gated behind confirmation). Whole stack now takes a single `DATABASE_URL` (mysql://...?sslmode=require, TLS supported) so a free hosted MySQL (TiDB Serverless/Aiven) becomes the wipe-proof source of truth for both local dev and the Vercel deploy; DB config centralized (`src/lib/db.ts`, `scripts/db-config.mjs`, `_db_config()`). Ports env-driven (`DATA_API_PORT`/`WEB_PORT`). See `DEPLOY.md`. Next: create the hosted DB + set Vercel env vars; keep collapsing `data-api` proxy endpoints into TS routes. Backlog: deep scraping/deploy tech debt (below), artist bio, data export, change alerts.

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
- **Admin gate + visitor curation (2026-07-23)**: passphrase login (`/login`, `ADMIN_PASSWORDS` comma-separated — one each for Carlitos/Adam; HMAC cookie via `AUTH_SECRET`, `src/lib/auth.ts`). All mutating + data-api proxy routes 401 without the cookie; visitors see only `artists.is_public = 1` (list/detail/link-preview all filtered), with an admin Public/Private toggle on the detail page. Admin-only UI: Discover/Manual/Bulk nav, Add-artist, edit/delete/scrape, sources panel. The tunneled data-api now requires `DATA_API_SECRET` (header `X-Data-Api-Secret`, `/health` exempt). NOT a user system by design — swap `passwordOk()` for real auth when Manager mode needs it; the `isAdmin()` guards stay.
- **Live deploy + self-healing tunnel (2026-07-23)**: site is LIVE at **incighder.vercel.app** (Vercel project recreated, GitHub-connected, `DATABASE_URL` in prod+preview) backed by **TiDB Cloud Serverless** (all data migrated: artists + growth snapshots). New **`./go_live.sh`**: starts data-api + cloudflared quick tunnel and publishes the tunnel URL to `app_config.data_api_url` in the shared DB; `getDataApiUrl()` (`src/lib/data-api.ts`) resolves it there in production (30s cache) so new tunnels need no redeploy. data-api `/health` + `/api/data-api-status` + amber offline banner in `app-shell` when the home server is unreachable (browse/edit still work — only scrape/refresh/discover pause).
- **Data-wipe bug fixed (2026-07-23)**: the repeated "DB lost everything" incidents were self-inflicted — Docker-era `start_dev.sh` ran `docker-compose down --volumes` (deleted the data volume), and post-migration `apply_schema.py` still dropped all tables on every dev start. `schema.sql` is now `CREATE TABLE IF NOT EXISTS`, `apply_schema.py` is idempotent, and destructive resets require `--reset` + typed confirmation (`APPLY_SCHEMA_RESET_CONFIRM=yes` non-interactively).
- **Single `DATABASE_URL` for the whole stack (2026-07-23)**: `mysql://user:pass@host:port/db?sslmode=require` understood by Next (`src/lib/db.ts` `getPool()` — one shared mysql2 pool replacing 4 duplicates), the node scripts (`scripts/db-config.mjs`, loads root `.env`), and Python (`_db_config()` in `scrapeArtistData.py`, PyMySQL TLS via certifi). `DB_*` vars still fill gaps; `DB_SSL=true` forces TLS. Enables free hosted MySQL (TiDB Serverless/Aiven) for the Vercel deploy — see `DEPLOY.md` + `.env.example`.
- **Port-agnostic (2026-07-23)**: `DATA_API_PORT` (default 5050) and `WEB_PORT` (default 3000) drive `start_dev.sh`, `src/lib/data-api.ts`, and app.py's dev server (`PORT` also honored for cloud hosts). `start_dev.sh` skips local MySQL when `DATABASE_URL` is set.
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
- **Environment**: Local native dev (`./start_dev.sh`); Vercel deploy pending `DATABASE_URL` + env vars in the dashboard (`DEPLOY.md`)
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
- [ ] Add a bio section (scraped from spotify or last fm idc) and make it editable for the cases where people have no bio (for non recording artsts like upcoming clients, glogang skaters etc)
- [ ] Add twitch?
- [ ] data export (select multiple people, or just one person, or groups)
- [ ] maybe a /glogang page that tracks skaters and their djs accounts (instead of artists) and that way itll keep their data separate?

### Manager-platform direction (from the 2026-07 Adam/ChatGPT conversation — "Manager Analytics Platform")
Strategic frame: two complementary products. **Incighder Discover** = today's app (public data, A&Rs/labels). **Incighder Manager** = artist teams connecting their own accounts (official APIs + manual input — "aggregation without replacement", built *with* platforms not against them). Manager-side first-party data could later enrich Discover. The daily-open question that defines the product: "how are all my artists performing across every platform?" — a story no single platform dashboard can tell.
- [ ] **Events/campaign tracking**: an `events` table (release, reel, post, feature, announcement) overlaid on `metric_snapshots` timelines → "this release drove +12% IG followers, +8% Spotify listeners, playlist adds from these 3 playlists". `metric_snapshots` is already the foundation; this is the highest-leverage steal.
- [ ] **AI weekly digest**: Gemini summary over snapshot deltas ("follower growth slowed 28% this week"; "3 platforms spiked after Friday's release") — pairs with the existing change-alerts backlog item; could be a cross-artist morning digest view.
- [ ] **Official integrations tier** (Manager mode): connect Spotify for Artists / Meta login / YouTube Studio / TikTok Business per artist for private stats the scrapers can't see; import priority = official API > CSV import > manual entry (manual is fallback only — managers with 10-20 artists won't type numbers).
- [ ] **Team CRM + notes**: per-artist contacts (playlist curators, journalists, producers, label) and internal team notes.
- [ ] **Goal tracking / release planning**: targets per metric with progress against the snapshot history.
- [ ] **[DEEP TECH DEBT] Scraping & data-api architecture is fragile post-migration.** The 2026-06-28/29 de-dockerize + MySQL + de-Chromium pass shipped working but accrued real debt that will bite on deployment:
  - **Datacenter-IP blocking**: scrapers now use plain HTTP (no browser). That runs fine from a laptop but Instagram/TikTok/Spotify aggressively block cloud/serverless IPs — these scrapers will largely fail if the data-api ever runs on Vercel/Railway/etc. Needs a deliberate strategy: residential/rotating proxy, official APIs where they exist, and honest graceful degradation + alerting when a source goes dark.
  - **Undocumented internal endpoints**: IG `web_profile_info`, TikTok `__UNIVERSAL_DATA_FOR_REHYDRATION__`, and especially the Spotify pathfinder GraphQL (hardcoded persisted-query `sha256Hash` in `scrapers/spotify.py`, TOTP-gated token mint) break with zero notice when the sites change. No version pinning, no health checks, no fallback.
  - **Personal-credential coupling**: monthly-listeners / reliable IG depend on personal login cookies (`SPOTIFY_SP_DC`, `IG_SESSIONID`) in `.env`. These expire, can't be rotated automatically, and tie scraping to a personal account (ban risk). Needs proper secret handling, token refresh, and ideally a dedicated service account.
  - **data-api ↔ Next coupling**: ~~hardcoded `127.0.0.1:5050`~~ done — `DATA_API_URL`/`DATA_API_PORT` env-driven. Remaining fork: port the API-call endpoints (similar/discover/preview/history/clear) into Next TS routes vs. host the Python service publicly (interim: cloudflared tunnel, `DEPLOY.md`). MySQL is the natural unification layer (scraper writes, Vercel reads).
  - **Migration leftovers**: dead selenium scripts (`followerCounts.py`, `artistSoundCloudScrape.py`); no DB migration framework yet (though schema apply is now idempotent — new columns still need hand-run ALTERs).
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
- [x] Login/data gate: passphrase admin sessions + `is_public` visitor curation + tunnel shared secret (2026-07-23) — closes "put some functionality behind gates"
- [x] **Data-wipe fix + hosted-DB/deploy readiness (2026-07-23)**: idempotent `apply_schema.py` (`--reset` gated), `DATABASE_URL`+TLS support across Next/scripts/Python, centralized pool config, env-driven ports, `DEPLOY.md` + `.env.example`
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

## 4. Repository Structure
```text
.
./start_dev.sh
./go_live.sh
./postcss.config.mjs
./tsconfig.tsbuildinfo
./node_modules
./node_modules/pkce-challenge
./node_modules/queue-microtask
./node_modules/is-plain-obj
./node_modules/is-docker
./node_modules/tinyglobby
./node_modules/callsites
./node_modules/@alloc
./node_modules/is-inside-container
./node_modules/stringify-object
./node_modules/tapable
./node_modules/zod
./node_modules/styled-jsx
./node_modules/ts-morph
./node_modules/reusify
./node_modules/simple-swizzle
./node_modules/define-data-property
./node_modules/is-bigint
./node_modules/named-placeholders
./node_modules/which-boxed-primitive
./node_modules/jsesc
./node_modules/@types
./node_modules/globals
./node_modules/is-regexp
./node_modules/@dotenvx
./node_modules/browserslist
./node_modules/formdata-polyfill
./node_modules/shebang-regex
./node_modules/eventsource
./node_modules/web-streams-polyfill
./node_modules/json-parse-even-better-errors
./node_modules/is-wsl
./node_modules/functions-have-names
./node_modules/next
./node_modules/is-array-buffer
./node_modules/tailwind-merge
./node_modules/jiti
./node_modules/has-property-descriptors
./node_modules/@emnapi
./node_modules/csstype
./node_modules/toidentifier
./node_modules/stdin-discarder
./node_modules/string.prototype.trimend
./node_modules/ts-api-utils
./node_modules/mimic-fn
./node_modules/strip-ansi
./node_modules/lightningcss-darwin-arm64
./node_modules/tsconfig-paths
./node_modules/content-type
./node_modules/systeminformation
./node_modules/react-is
./node_modules/is-typed-array
./node_modules/rspack-resolver
./node_modules/function.prototype.name
./node_modules/eventsource-parser
./node_modules/flatted
./node_modules/loose-envify
./node_modules/es-errors
./node_modules/is-obj
./node_modules/has-proto
./node_modules/node-domexception
./node_modules/agent-base
./node_modules/bundle-name
./node_modules/string.prototype.trimstart
./node_modules/mysql2
./node_modules/mimic-function
./node_modules/ms
./node_modules/strip-final-newline
./node_modules/content-disposition
./node_modules/possible-typed-array-names
./node_modules/call-bind
./node_modules/math-intrinsics
./node_modules/prelude-ls
./node_modules/node-releases
./node_modules/dotenv
./node_modules/escape-string-regexp
./node_modules/has-tostringtag
./node_modules/strip-json-comments
./node_modules/lru-cache
./node_modules/use-sync-external-store
./node_modules/imurmurhash
./node_modules/language-tags
./node_modules/eslint-scope
./node_modules/chownr
./node_modules/commander
./node_modules/punycode
./node_modules/proxy-addr
./node_modules/depd
./node_modules/array.prototype.flat
./node_modules/eslint-config-next
./node_modules/string.prototype.trim
./node_modules/atomically
./node_modules/autoprefixer
./node_modules/escalade
./node_modules/node-fetch
./node_modules/@ts-morph
./node_modules/ip-address
./node_modules/range-parser
./node_modules/color-string
./node_modules/side-channel-list
./node_modules/fast-json-stable-stringify
./node_modules/eslint-plugin-import
./node_modules/error-ex
./node_modules/@sec-ant
./node_modules/object.values
./node_modules/detect-libc
./node_modules/balanced-match
./node_modules/path-exists
./node_modules/resolve
./node_modules/bytes
./node_modules/@eslint
./node_modules/data-view-byte-offset
./node_modules/call-bind-apply-helpers
./node_modules/define-lazy-prop
./node_modules/is-number-object
./node_modules/parse-json
./node_modules/aria-query
./node_modules/nanoid
./node_modules/acorn
./node_modules/ast-types
./node_modules/file-entry-cache
./node_modules/express
./node_modules/@nodelib
./node_modules/encodeurl
./node_modules/signal-exit
./node_modules/own-keys
./node_modules/once
./node_modules/gensync
./node_modules/get-own-enumerable-keys
./node_modules/object-treeify
./node_modules/reflect.getprototypeof
./node_modules/is-generator-function
./node_modules/async-function
./node_modules/ignore
./node_modules/sisteransi
./node_modules/debounce-fn
./node_modules/esrecurse
./node_modules/merge-descriptors
./node_modules/@hono
./node_modules/tslib
./node_modules/@tailwindcss
./node_modules/magic-string
./node_modules/ajv-formats
./node_modules/reselect
./node_modules/argparse
./node_modules/picomatch
./node_modules/jsx-ast-utils
./node_modules/is-symbol
./node_modules/function-bind
./node_modules/recast
./node_modules/is-glob
./node_modules/npm-run-path
./node_modules/is-async-function
./node_modules/is-weakref
./node_modules/axe-core
./node_modules/ee-first
./node_modules/color
./node_modules/env-paths
./node_modules/@ampproject
./node_modules/typescript
./node_modules/ora
./node_modules/flat-cache
./node_modules/baseline-browser-mapping
./node_modules/inherits
./node_modules/jsonfile
./node_modules/is-date-object
./node_modules/react-icons
./node_modules/array-includes
./node_modules/iconv-lite
./node_modules/color-name
./node_modules/es-define-property
./node_modules/@swc
./node_modules/postcss
./node_modules/p-locate
./node_modules/shadcn
./node_modules/fresh
./node_modules/undici
./node_modules/get-intrinsic
./node_modules/eslint-import-resolver-node
./node_modules/lucide-react
./node_modules/object.entries
./node_modules/keyv
./node_modules/path-browserify
./node_modules/@typescript-eslint
./node_modules/es-to-primitive
./node_modules/es-abstract
./node_modules/zod-to-json-schema
./node_modules/@tybys
./node_modules/qs
./node_modules/js-yaml
./node_modules/eslint-visitor-keys
./node_modules/call-bound
./node_modules/yocto-spinner
./node_modules/typed-array-length
./node_modules/scheduler
./node_modules/eslint-plugin-react-hooks
./node_modules/set-function-name
./node_modules/parent-module
./node_modules/@humanwhocodes
./node_modules/eslint-module-utils
./node_modules/is-in-ssh
./node_modules/dunder-proto
./node_modules/path-to-regexp
./node_modules/hasown
./node_modules/safer-buffer
./node_modules/side-channel-weakmap
./node_modules/is-promise
./node_modules/deepmerge
./node_modules/run-parallel
./node_modules/p-limit
./node_modules/data-view-buffer
./node_modules/diff
./node_modules/mime-types
./node_modules/typed-array-byte-length
./node_modules/undici-types
./node_modules/wsl-utils
./node_modules/tiny-invariant
./node_modules/strip-bom
./node_modules/json-schema-traverse
./node_modules/@isaacs
./node_modules/fuzzysort
./node_modules/natural-compare
./node_modules/type-is
./node_modules/minimist
./node_modules/sql-escaper
./node_modules/is-property
./node_modules/fraction.js
./node_modules/code-block-writer
./node_modules/pkg-up
./node_modules/regexp.prototype.flags
./node_modules/is-stream
./node_modules/string.prototype.includes
./node_modules/iterator.prototype
./node_modules/universalify
./node_modules/onetime
./node_modules/eslint-plugin-jsx-a11y
./node_modules/esutils
./node_modules/find-up
./node_modules/chalk
./node_modules/ansi-regex
./node_modules/damerau-levenshtein
./node_modules/enhanced-resolve
./node_modules/esprima
./node_modules/jose
./node_modules/has-flag
./node_modules/supports-color
./node_modules/unbox-primitive
./node_modules/is-shared-array-buffer
./node_modules/vary
./node_modules/fs-extra
./node_modules/supports-preserve-symlinks-flag
./node_modules/typed-array-byte-offset
./node_modules/color-convert
./node_modules/path-key
./node_modules/merge-stream
./node_modules/is-bun-module
./node_modules/unpipe
./node_modules/stable-hash
./node_modules/array-buffer-byte-length
./node_modules/brace-expansion
./node_modules/fill-range
./node_modules/json-stable-stringify-without-jsonify
./node_modules/react-dom
./node_modules/util-deprecate
./node_modules/word-wrap
./node_modules/path-parse
./node_modules/json-schema-typed
./node_modules/has-symbols
./node_modules/generate-function
./node_modules/powershell-utils
./node_modules/clsx
./node_modules/picocolors
./node_modules/string.prototype.repeat
./node_modules/ansi-colors
./node_modules/arraybuffer.prototype.slice
./node_modules/@napi-rs
./node_modules/internal-slot
./node_modules/set-proto
./node_modules/json-buffer
./node_modules/which-builtin-type
./node_modules/sonner
./node_modules/long
./node_modules/default-browser-id
./node_modules/safe-array-concat
./node_modules/raw-body
./node_modules/doctrine
./node_modules/minizlib
./node_modules/lines-and-columns
./node_modules/@nolyfill
./node_modules/array.prototype.tosorted
./node_modules/semver
./node_modules/hono
./node_modules/http-errors
./node_modules/is-finalizationregistry
./node_modules/define-properties
./node_modules/minimatch
./node_modules/is-weakset
./node_modules/@modelcontextprotocol
./node_modules/postcss-value-parser
./node_modules/accepts
./node_modules/class-variance-authority
./node_modules/@sindresorhus
./node_modules/estraverse
./node_modules/ansi-styles
./node_modules/is-core-module
./node_modules/graphemer
./node_modules/is-map
./node_modules/fast-uri
./node_modules/cookie-signature
./node_modules/forwarded
./node_modules/js-tokens
./node_modules/@base-ui
./node_modules/negotiator
./node_modules/body-parser
./node_modules/acorn-jsx
./node_modules/client-only
./node_modules/@babel
./node_modules/tw-animate-css
./node_modules/is-number
./node_modules/ast-types-flow
./node_modules/@humanfs
./node_modules/express-rate-limit
./node_modules/levn
./node_modules/@img
./node_modules/get-east-asian-width
./node_modules/yocto-queue
./node_modules/lodash.merge
./node_modules/figures
./node_modules/has-bigints
./node_modules/@rtsao
./node_modules/postcss-selector-parser
./node_modules/denque
./node_modules/side-channel
./node_modules/concat-map
./node_modules/axobject-query
./node_modules/json5
./node_modules/cors
./node_modules/get-stream
./node_modules/yoctocolors
./node_modules/update-browserslist-db
./node_modules/set-function-length
./node_modules/aws-ssl-profiles
./node_modules/es-shim-unscopables
./node_modules/restore-cursor
./node_modules/serve-static
./node_modules/safe-regex-test
./node_modules/optionator
./node_modules/get-symbol-description
./node_modules/convert-source-map
./node_modules/uri-js
./node_modules/is-arrayish
./node_modules/prompts
./node_modules/parse-ms
./node_modules/object-assign
./node_modules/get-proto
./node_modules/cross-spawn
./node_modules/is-data-view
./node_modules/prop-types
./node_modules/ipaddr.js
./node_modules/espree
./node_modules/is-boolean-object
./node_modules/which-collection
./node_modules/is-regex
./node_modules/eslint
./node_modules/esquery
./node_modules/import-fresh
./node_modules/cookie
./node_modules/fast-levenshtein
./node_modules/to-regex-range
./node_modules/streamsearch
./node_modules/normalize-range
./node_modules/source-map
./node_modules/default-browser
./node_modules/@next
./node_modules/@floating-ui
./node_modules/object-keys
./node_modules/cosmiconfig
./node_modules/gopd
./node_modules/busboy
./node_modules/is-unicode-supported
./node_modules/safe-push-apply
./node_modules/escape-html
./node_modules/for-each
./node_modules/run-applescript
./node_modules/statuses
./node_modules/https-proxy-agent
./node_modules/which-typed-array
./node_modules/array.prototype.findlast
./node_modules/string-width
./node_modules/is-interactive
./node_modules/minipass
./node_modules/enquirer
./node_modules/execa
./node_modules/yallist
./node_modules/is-callable
./node_modules/parseurl
./node_modules/@jridgewell
./node_modules/is-weakmap
./node_modules/etag
./node_modules/cssesc
./node_modules/data-view-byte-length
./node_modules/log-symbols
./node_modules/p-try
./node_modules/isarray
./node_modules/eslint-import-resolver-typescript
./node_modules/micromatch
./node_modules/is-set
./node_modules/wrappy
./node_modules/eslint-plugin-react
./node_modules/fast-glob
./node_modules/array.prototype.findlastindex
./node_modules/resolve-from
./node_modules/tailwindcss
./node_modules/lru.min
./node_modules/send
./node_modules/is-extglob
./node_modules/data-uri-to-buffer
./node_modules/fastq
./node_modules/conf
./node_modules/finalhandler
./node_modules/available-typed-arrays
./node_modules/fetch-blob
./node_modules/es-iterator-helpers
./node_modules/cli-cursor
./node_modules/tar
./node_modules/string.prototype.matchall
./node_modules/cli-spinners
./node_modules/caniuse-lite
./node_modules/@rushstack
./node_modules/validate-npm-package-name
./node_modules/merge2
./node_modules/deep-is
./node_modules/es-set-tostringtag
./node_modules/is-string
./node_modules/globalthis
./node_modules/kleur
./node_modules/react
./node_modules/@unrs
./node_modules/braces
./node_modules/array.prototype.flatmap
./node_modules/which
./node_modules/side-channel-map
./node_modules/ajv
./node_modules/emoji-regex
./node_modules/open
./node_modules/object-inspect
./node_modules/sharp
./node_modules/@eslint-community
./node_modules/typed-array-buffer
./node_modules/next-themes
./node_modules/dedent
./node_modules/type-check
./node_modules/object.fromentries
./node_modules/resolve-pkg-maps
./node_modules/locate-path
./node_modules/object.assign
./node_modules/mkdirp
./node_modules/graceful-fs
./node_modules/on-finished
./node_modules/human-signals
./node_modules/fast-deep-equal
./node_modules/shebang-command
./node_modules/electron-to-chromium
./node_modules/require-from-string
./node_modules/debug
./node_modules/dot-prop
./node_modules/glob-parent
./node_modules/lightningcss
./node_modules/source-map-js
./node_modules/media-typer
./node_modules/mime-db
./node_modules/isexe
./node_modules/unicorn-magic
./node_modules/es-object-atoms
./node_modules/language-subtag-registry
./node_modules/get-tsconfig
./node_modules/object.groupby
./node_modules/router
./node_modules/pretty-ms
./node_modules/setprototypeof
./incighder
./incighder/node_modules
./incighder/next-env.d.ts
./next-env.d.ts
./data-api
./data-api/apply_schema.py
./data-api/migrations
./data-api/spotify_search.py
./data-api/scrape_service.py
./data-api/requirements.txt
./data-api/schema.sql
./data-api/link_preview.py
./data-api/ai_verify.py
./data-api/scrapeArtistData.py
./data-api/__pycache__
./data-api/flush_db.py
./data-api/similar_artists.py
./data-api/wait-for-it.sh
./data-api/insert_artist_from_json.py
./data-api/app.py
./data-api/scheduler.py
./data-api/scrapers
./data-api/brezzo.json
./README.md
./DEPLOY.md
./public
./public/file.svg
./public/vercel.svg
./public/next.svg
./public/globe.svg
./public/window.svg
./package-lock.json
./package.json
./ai
./ai/ai-context.sh
./ai/DESIGN_OVERHAUL_PLAN.md
./ai/ARCHITECTURE.md
./ai/COMPETITORS.md
./ai/SCRAPING_PLAN.md
./ai/CONTEXT_BUNDLE.md
./ai/PROJECT_STATE.md
./ai/AGENTS.md
./scripts
./scripts/db-config.mjs
./scripts/export-artists.mjs
./scripts/import-artists.mjs
./components.json
./tsconfig.json
./eslint.config.mjs
./next.config.ts
./src
./src/app
./src/utils
./src/components
./src/lib
./src/data
```

## 5. Recent Git Changes (Summary)
```text
8d5c97e feat: passphrase admin gate, is_public visitor curation, tunnel shared secret
3e8f2a3 feat: go_live.sh self-healing tunnel + offline banner; live features discover data-api via DB
94bc68a docs: backlog — manager-platform direction from Adam conversation (events/campaign tracking, AI digest, official integrations, CRM, goals)
37ecdde fix: stop wiping the DB on every dev start; single DATABASE_URL for hosted MySQL; env-driven ports
ce05300 feat: refresh artist snapshot on dev start, fail gracefully
```

## 6. Active Diff
```diff
diff --git a/ai/CONTEXT_BUNDLE.md b/ai/CONTEXT_BUNDLE.md
index 51bda66..8af0afc 100644
--- a/ai/CONTEXT_BUNDLE.md
+++ b/ai/CONTEXT_BUNDLE.md
@@ -1,5 +1,5 @@
 # AI Context Bundle
-Generated: Thu Jul 23 13:23:21 PDT 2026
+Generated: Thu Jul 23 14:26:04 PDT 2026
 
 ## ⚠️ Agent Navigation Guide
 1. Start with the **Current State** below to understand the focus.
@@ -152,6 +152,8 @@ The long-term aim is a single dashboard that scores artist traction from many si
 ---
 
 ## Recent Changes
+- **Admin gate + visitor curation (2026-07-23)**: passphrase login (`/login`, `ADMIN_PASSWORDS` comma-separated — one each for Carlitos/Adam; HMAC cookie via `AUTH_SECRET`, `src/lib/auth.ts`). All mutating + data-api proxy routes 401 without the cookie; visitors see only `artists.is_public = 1` (list/detail/link-preview all filtered), with an admin Public/Private toggle on the detail page. Admin-only UI: Discover/Manual/Bulk nav, Add-artist, edit/delete/scrape, sources panel. The tunneled data-api now requires `DATA_API_SECRET` (header `X-Data-Api-Secret`, `/health` exempt). NOT a user system by design — swap `passwordOk()` for real auth when Manager mode needs it; the `isAdmin()` guards stay.
+- **Live deploy + self-healing tunnel (2026-07-23)**: site is LIVE at **incighder.vercel.app** (Vercel project recreated, GitHub-connected, `DATABASE_URL` in prod+preview) backed by **TiDB Cloud Serverless** (all data migrated: artists + growth snapshots). New **`./go_live.sh`**: starts data-api + cloudflared quick tunnel and publishes the tunnel URL to `app_config.data_api_url` in the shared DB; `getDataApiUrl()` (`src/lib/data-api.ts`) resolves it there in production (30s cache) so new tunnels need no redeploy. data-api `/health` + `/api/data-api-status` + amber offline banner in `app-shell` when the home server is unreachable (browse/edit still work — only scrape/refresh/discover pause).
 - **Data-wipe bug fixed (2026-07-23)**: the repeated "DB lost everything" incidents were self-inflicted — Docker-era `start_dev.sh` ran `docker-compose down --volumes` (deleted the data volume), and post-migration `apply_schema.py` still dropped all tables on every dev start. `schema.sql` is now `CREATE TABLE IF NOT EXISTS`, `apply_schema.py` is idempotent, and destructive resets require `--reset` + typed confirmation (`APPLY_SCHEMA_RESET_CONFIRM=yes` non-interactively).
 - **Single `DATABASE_URL` for the whole stack (2026-07-23)**: `mysql://user:pass@host:port/db?sslmode=require` understood by Next (`src/lib/db.ts` `getPool()` — one shared mysql2 pool replacing 4 duplicates), the node scripts (`scripts/db-config.mjs`, loads root `.env`), and Python (`_db_config()` in `scrapeArtistData.py`, PyMySQL TLS via certifi). `DB_*` vars still fill gaps; `DB_SSL=true` forces TLS. Enables free hosted MySQL (TiDB Serverless/Aiven) for the Vercel deploy — see `DEPLOY.md` + `.env.example`.
 - **Port-agnostic (2026-07-23)**: `DATA_API_PORT` (default 5050) and `WEB_PORT` (default 3000) drive `start_dev.sh`, `src/lib/data-api.ts`, and app.py's dev server (`PORT` also honored for cloud hosts). `start_dev.sh` skips local MySQL when `DATABASE_URL` is set.
@@ -186,17 +188,18 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 - (nothing in progress — pick next from Backlog)
 
 ## Backlog
+- [ ] Add a bio section (scraped from spotify or last fm idc) and make it editable for the cases where people have no bio (for non recording artsts like upcoming clients, glogang skaters etc)
+- [ ] Add twitch?
+- [ ] data export (select multiple people, or just one person, or groups)
+- [ ] maybe a /glogang page that tracks skaters and their djs accounts (instead of artists) and that way itll keep their data separate?
 
 ### Manager-platform direction (from the 2026-07 Adam/ChatGPT conversation — "Manager Analytics Platform")
 Strategic frame: two complementary products. **Incighder Discover** = today's app (public data, A&Rs/labels). **Incighder Manager** = artist teams connecting their own accounts (official APIs + manual input — "aggregation without replacement", built *with* platforms not against them). Manager-side first-party data could later enrich Discover. The daily-open question that defines the product: "how are all my artists performing across every platform?" — a story no single platform dashboard can tell.
-- [ ] **Events/campaign tracking**: an `events` table (release, reel, feature, announcement) overlaid on `metric_snapshots` timelines → "this release drove +12% IG followers, +8% Spotify listeners, playlist adds from these 3 playlists". `metric_snapshots` is already the foundation; this is the highest-leverage steal.
+- [ ] **Events/campaign tracking**: an `events` table (release, reel, post, feature, announcement) overlaid on `metric_snapshots` timelines → "this release drove +12% IG followers, +8% Spotify listeners, playlist adds from these 3 playlists". `metric_snapshots` is already the foundation; this is the highest-leverage steal.
 - [ ] **AI weekly digest**: Gemini summary over snapshot deltas ("follower growth slowed 28% this week"; "3 platforms spiked after Friday's release") — pairs with the existing change-alerts backlog item; could be a cross-artist morning digest view.
 - [ ] **Official integrations tier** (Manager mode): connect Spotify for Artists / Meta login / YouTube Studio / TikTok Business per artist for private stats the scrapers can't see; import priority = official API > CSV import > manual entry (manual is fallback only — managers with 10-20 artists won't type numbers).
 - [ ] **Team CRM + notes**: per-artist contacts (playlist curators, journalists, producers, label) and internal team notes.
 - [ ] **Goal tracking / release planning**: targets per metric with progress against the snapshot history.
-- [ ] Add twitch?
-- [ ] login?
-- [ ] data export (select multiple people, or just one person, or groups)
 - [ ] **[DEEP TECH DEBT] Scraping & data-api architecture is fragile post-migration.** The 2026-06-28/29 de-dockerize + MySQL + de-Chromium pass shipped working but accrued real debt that will bite on deployment:
   - **Datacenter-IP blocking**: scrapers now use plain HTTP (no browser). That runs fine from a laptop but Instagram/TikTok/Spotify aggressively block cloud/serverless IPs — these scrapers will largely fail if the data-api ever runs on Vercel/Railway/etc. Needs a deliberate strategy: residential/rotating proxy, official APIs where they exist, and honest graceful degradation + alerting when a source goes dark.
   - **Undocumented internal endpoints**: IG `web_profile_info`, TikTok `__UNIVERSAL_DATA_FOR_REHYDRATION__`, and especially the Spotify pathfinder GraphQL (hardcoded persisted-query `sha256Hash` in `scrapers/spotify.py`, TOTP-gated token mint) break with zero notice when the sites change. No version pinning, no health checks, no fallback.
@@ -215,6 +218,7 @@ Strategic frame: two complementary products. **Incighder Discover** = today's ap
 - [ ] Playlist / chart-placement tracking — competitor table-stakes we lack (see `COMPETITORS.md`)
 
 ## Completed
+- [x] Login/data gate: passphrase admin sessions + `is_public` visitor curation + tunnel shared secret (2026-07-23) — closes "put some functionality behind gates"
 - [x] **Data-wipe fix + hosted-DB/deploy readiness (2026-07-23)**: idempotent `apply_schema.py` (`--reset` gated), `DATABASE_URL`+TLS support across Next/scripts/Python, centralized pool config, env-driven ports, `DEPLOY.md` + `.env.example`
 - [x] **De-dockerize + flatten for Vercel (2026-06-29)**: removed Docker entirely (run natively via `./start_dev.sh`); **Postgres → MySQL 8.4** (`mysql2`/`PyMySQL`, `?` placeholders, `ON DUPLICATE KEY UPDATE`, update-then-SELECT in place of `RETURNING`); **flattened** the Next app from `incighder/incighder/` to the repo root; **dropped Playwright/Chromium** — all scrapers HTTP-only (TikTok rehydration blob, IG `web_profile_info` + `IG_SESSIONID` cookie, Spotify monthly listeners via **scrape.do** render API `SCRAPE_DO_TOKEN`); **Ollama → Gemini** (`gemini-2.5-flash`, `GOOGLE_AI_API_KEY`) in `ai_verify.py`; **Spotify search ported to a native TS route** (no data-api); remaining proxy routes parameterized via `DATA_API_URL`. data-api on :5050 (AirPlay owns 5000), `OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES` for macOS thread-fork safety.
 - [x] Bulk re-scrape + social auto-discovery for tracked artists: `/artists/refresh` + `/api/refresh` → data-api `refresh_artist`; 24h-cache-aware (skips fresh platforms) and surfaces per-platform failure reasons (`artists/refresh/page.tsx`, `scrape_service.py`)
@@ -240,6 +244,7 @@ Strategic frame: two complementary products. **Incighder Discover** = today's ap
 ```text
 .
 ./start_dev.sh
+./go_live.sh
 ./postcss.config.mjs
 ./tsconfig.tsbuildinfo
 ./node_modules
@@ -782,113 +787,12 @@ Strategic frame: two complementary products. **Incighder Discover** = today's ap
 
 ## 5. Recent Git Changes (Summary)
 ```text
+8d5c97e feat: passphrase admin gate, is_public visitor curation, tunnel shared secret
+3e8f2a3 feat: go_live.sh self-healing tunnel + offline banner; live features discover data-api via DB
+94bc68a docs: backlog — manager-platform direction from Adam conversation (events/campaign tracking, AI digest, official integrations, CRM, goals)
 37ecdde fix: stop wiping the DB on every dev start; single DATABASE_URL for hosted MySQL; env-driven ports
 ce05300 feat: refresh artist snapshot on dev start, fail gracefully
-fa8a449 feat: JSON fallback for GET /api/artists/[id]
-8c656f0 feat: JSON fallback for /api/artists + two-way DB sync
-085b49b Fix React Server Components CVE vulnerabilities (#15)
 ```
 
 ## 6. Active Diff
 ```diff
-diff --git a/ai/CONTEXT_BUNDLE.md b/ai/CONTEXT_BUNDLE.md
-index a5c5d29..cc3f0cc 100644
---- a/ai/CONTEXT_BUNDLE.md
-+++ b/ai/CONTEXT_BUNDLE.md
-@@ -1,5 +1,5 @@
- # AI Context Bundle
--Generated: Thu Jul 23 13:19:42 PDT 2026
-+Generated: Thu Jul 23 13:23:21 PDT 2026
- 
- ## ⚠️ Agent Navigation Guide
- 1. Start with the **Current State** below to understand the focus.
-@@ -186,6 +186,14 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
- - (nothing in progress — pick next from Backlog)
- 
- ## Backlog
-+
-+### Manager-platform direction (from the 2026-07 Adam/ChatGPT conversation — "Manager Analytics Platform")
-+Strategic frame: two complementary products. **Incighder Discover** = today's app (public data, A&Rs/labels). **Incighder Manager** = artist teams connecting their own accounts (official APIs + manual input — "aggregation without replacement", built *with* platforms not against them). Manager-side first-party data could later enrich Discover. The daily-open question that defines the product: "how are all my artists performing across every platform?" — a story no single platform dashboard can tell.
-+- [ ] **Events/campaign tracking**: an `events` table (release, reel, feature, announcement) overlaid on `metric_snapshots` timelines → "this release drove +12% IG followers, +8% Spotify listeners, playlist adds from these 3 playlists". `metric_snapshots` is already the foundation; this is the highest-leverage steal.
-+- [ ] **AI weekly digest**: Gemini summary over snapshot deltas ("follower growth slowed 28% this week"; "3 platforms spiked after Friday's release") — pairs with the existing change-alerts backlog item; could be a cross-artist morning digest view.
-+- [ ] **Official integrations tier** (Manager mode): connect Spotify for Artists / Meta login / YouTube Studio / TikTok Business per artist for private stats the scrapers can't see; import priority = official API > CSV import > manual entry (manual is fallback only — managers with 10-20 artists won't type numbers).
-+- [ ] **Team CRM + notes**: per-artist contacts (playlist curators, journalists, producers, label) and internal team notes.
-+- [ ] **Goal tracking / release planning**: targets per metric with progress against the snapshot history.
- - [ ] Add twitch?
- - [ ] login?
```
