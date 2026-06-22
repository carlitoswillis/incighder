# AI Context Bundle
Generated: Sun Jun 21 20:00:39 PDT 2026

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
- **Dual-API Structure**: The Next.js frontend calls Next.js API routes, which in turn communicate with the Python `data-api` service.
- **Docker-First**: All services run in Docker. Use the provided `./start_*.sh` scripts for development.
- **Database**: PostgreSQL is the source of truth. Schema changes must be applied via `data-api/apply_schema.py`.
- **Local-First**: Prioritize local inference and development.
- **Markdown Persistence**: All state must be tracked in `ai/*.md`.

## Coding Conventions
- **Explicit over Implicit**: Avoid hidden logic, reflection, or complex inheritance.
- **Verification First**: All changes must be verified via tests ideally
- **Compact Context**: Keep context files task-scoped and minimal.
- **TypeScript**: Ensure strict typing in the Next.js frontend.
- **Python**: Use idiomatic Python for the `data-api`.

## How to Navigate This Workspace (Priority Flow)
To minimize token waste and maximize focus, follow this priority sequence:
1. **START HERE**: Read `ai/PROJECT_STATE.md`. It defines the current high-level objective
2. **Operational Rules**: Read `AGENTS.md` (this file). Adhere strictly to these constraints.
3. **Task Details**: Read tasks in`PROJECT_STATE` to see the specific backlog and active items.
4. **Self-Correction**: If you feel your understanding of the project state is out of sync, you may run `./ai-context.sh` to refresh your local context bundle.

## 2. Architecture (ARCHITECTURE.md)
# Incighder Architecture

PURPOSE: Technical system design and data flow of the Incighder application.

## Overview
Incighder is a multi-service data application designed to aggregate and visualize artist audience metrics from various music and social platforms.

## System Components

### 1. Frontend (Next.js)
- **Role**: User interface and primary application logic.
- **Framework**: Next.js with TypeScript and Tailwind CSS.
- **API Routes**: Next.js API routes act as a proxy/orchestrator, calling the specialized `data-api`.

### 2. Data API (Python)
- **Role**: Specialized service for data ingestion, search, and transformation.
- **Framework**: Python with Flask/FastAPI (or similar) using `spotipy` for Spotify and `psycopg2` for PostgreSQL.
- **Isolation**: Handles heavy data lifting and external API interactions to keep the frontend lean.
- **Artist discovery (similar artists)**: `/discover` seeds on an artist name and uses the free **Last.fm `artist.getSimilar`** graph (Spotify's related-artists API was retired in late 2024) for similarity, then enriches each result via the existing Spotify search and Last.fm `artist.getInfo`. Backed by `similar_artists.py` + the `/similar_artists` route; requires `LAST_FM_API_KEY`. "Track" reuses the standard `/insert_artist` pipeline.
- **AI verification (optional dependency)**: auto-discovery cross-checks Instagram/TikTok guesses against the artist with a **local LLM via Ollama** (`OLLAMA_URL`, default `host.docker.internal:11434`; `OLLAMA_MODEL`, default `qwen2.5-coder:14b`). Free, private, best-effort — no paid AI APIs; if Ollama is unreachable, links fall back to unverified guesses. Reaches the host's Ollama via `extra_hosts: host.docker.internal:host-gateway` in `docker-compose.yml`.

### 3. Database (PostgreSQL)
- **Role**: The source of truth for all artist metrics and historical data.
- **Master Schema**: Located at `data-api/schema.sql`. This is the **single source of truth**. 
- **Application**: Schema changes must be applied via `data-api/apply_schema.py` inside the Docker container.

### 4. Infrastructure (Docker)
- **Role**: Service orchestration and environment parity.
- **Services**: `db`, `data-api`, and `incighder-dev` (Next.js).

## Data Flow
1. **Search**: User triggers search in Next.js -> API Route -> `data-api` (Python) -> Spotify/YouTube APIs.
1b. **Discover**: Seed name -> API Route -> `data-api` -> Last.fm `getSimilar` -> Spotify/Last.fm enrichment -> similar-artist grid; "Track" feeds the ingestion path below.
2. **Ingestion**: `data-api` transforms raw API data and inserts it into PostgreSQL.
3. **Display**: Next.js fetches structured data from the `db` via API routes and renders the dashboard.

## AI Workspace Substrate
This repository uses an AI-assisted engineering substrate located in `ai/`.
- **Cognition Layer**: State and tasks are tracked in `ai/`.
- **Rules**: Agent constraints are defined in `ai/AGENTS.md`.
- **Flow**: Human Pilot -> AI Implementation -> Verification (via `./start_dev.sh` and manual QA).

## 3. Project State (PROJECT_STATE.md)
# Current State

PURPOSE: High-level summary of the system's current focus and recent changes to prevent agent drift.

## Last Updated: 2026-06-21
## Current Focus: Artist discovery (seed -> similar artists) just shipped. Backlog: scheduled auto-scrape, data export.

## Project Goal
Build a data application that provides a holistic view of an artist's online traction and potential, starting with Spotify and expanding to YouTube, SoundCloud, and social media.

## Recent Changes
- **Artist Discovery**: New `/discover` page — seed artist → Last.fm `getSimilar` → Spotify-enriched grid (followers/popularity + Last.fm listeners/playcount/tags), one-click "Track" reuses the insert pipeline; already-tracked artists are marked. Backend `similar_artists.py` + `/similar_artists` route; uses `LAST_FM_API_KEY`.
- **Scraping Plan**: Authored `SCRAPING_PLAN.md` for cross-platform metric scraping.
- **Cleanup**: Fixed substrate drift, removed dead endpoints, guarded PATCH against column-name injection (branch `fix/substrate-and-api-cleanup`).
- **Artist Editing**: Implemented PATCH request handling for artist info updates.
- **Form UI**: Updated `src/app/artists/[id]/page.tsx` for full field editing.
- **Navigation**: Enabled direct navigation to the new artist page.
- **UI Improvements**: Integrated global navigation bar.

## Active Context
- **Branch**: `main`
- **Environment**: Local Development (Docker)
- **Blockers**: None

## Next Steps
1. Obtain a free YouTube Data API key (`YOUTUBE_API_KEY` in `.env`).
2. Execute `SCRAPING_PLAN.md` Phase 0 (foundations) then Phase 1 (Spotify ML, YouTube, SoundCloud).
3. Layer in best-effort socials (IG/TikTok), X manual, then DuckDuckGo discovery.


# Tasks

PURPOSE: Tracks active work and backlog. AI agents should update this after completing tasks.

## Active
- (nothing in progress — design overhaul shipped; pick next from Backlog)

## Backlog
- [ ] Add bulk import of artist data (list a few artists, and add them to the data set automatically, scraping the suggest social media sites etc.)
- [ ] scheduled auto-scrape for growth
- [ ] Add export artist data and  export artist data
- [x] Deploy with ngrok or cloudflared

## Completed
- [x] Artist discovery: `/discover` page (seed → Last.fm similar → Spotify-enriched grid → one-click Track)
- [x] UI design overhaul (Phases A–D): shadcn dark slate/cyan system, all pages redesigned (`DESIGN_OVERHAUL_PLAN.md`)
- [x] Scraping Phase 0-4: scrapers + `/scrape` + auto-discovery (`/discover`) + metrics across the UI (`SCRAPING_PLAN.md`)
- [x] Growth-over-time: per-account metric snapshots + `/history` + sparklines (account-keyed so re-linking doesn't fake growth)
- [x] AI-verified discovery: local Ollama (`qwen2.5-coder`) checks auto-found IG/TikTok accounts are actually the artist; panel flags uncertain/mismatch (`ARCHITECTURE.md`)
- [x] Implement artist editing functionality (PATCH requests)
- [x] Enable navigation to new artist page
- [x] Add navigation bar
- [x] QA/UX testing for artist editing workflow
- [x] Refine error handling for PATCH submissions
- [x] Codebase cleanup (linting fixes in API routes)
- [x] Decouple database schema (spotify_id made nullable)
- [x] Implement `POST /insert_artist_manual` backend endpoint
- [x] Consolidate `schema.sql` to `data-api/`

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
./data-api/scrapers
./data-api/brezzo.json
./README.md
./package-lock.json
./ai
./ai/ai-context.sh
./ai/DESIGN_OVERHAUL_PLAN.md
./ai/ARCHITECTURE.md
./ai/SCRAPING_PLAN.md
./ai/CONTEXT_BUNDLE.md
./ai/PROJECT_STATE.md
./ai/AGENTS.md
./docker-compose.yml
./GOALS.md
```

## 5. Recent Git Changes (Summary)
```text
77ff62f feat(discovery): /discover page — seed artist → similar artists
a3798b0 docs: prioritize docker compose up over bash wrapper scripts in README
7563006 docs: update README to reflect cross-platform scrapers, Ollama verification, and growth history; rename package-lock project name
8ca877b feat(discovery): AI-verify auto-found accounts via local Ollama
930c784 feat(scraping): growth-over-time tracking (account-keyed)
```

## 6. Active Diff
```diff
diff --git a/ai/ARCHITECTURE.md b/ai/ARCHITECTURE.md
index 353a9ab..3f8d445 100644
--- a/ai/ARCHITECTURE.md
+++ b/ai/ARCHITECTURE.md
@@ -16,6 +16,7 @@ Incighder is a multi-service data application designed to aggregate and visualiz
 - **Role**: Specialized service for data ingestion, search, and transformation.
 - **Framework**: Python with Flask/FastAPI (or similar) using `spotipy` for Spotify and `psycopg2` for PostgreSQL.
 - **Isolation**: Handles heavy data lifting and external API interactions to keep the frontend lean.
+- **Artist discovery (similar artists)**: `/discover` seeds on an artist name and uses the free **Last.fm `artist.getSimilar`** graph (Spotify's related-artists API was retired in late 2024) for similarity, then enriches each result via the existing Spotify search and Last.fm `artist.getInfo`. Backed by `similar_artists.py` + the `/similar_artists` route; requires `LAST_FM_API_KEY`. "Track" reuses the standard `/insert_artist` pipeline.
 - **AI verification (optional dependency)**: auto-discovery cross-checks Instagram/TikTok guesses against the artist with a **local LLM via Ollama** (`OLLAMA_URL`, default `host.docker.internal:11434`; `OLLAMA_MODEL`, default `qwen2.5-coder:14b`). Free, private, best-effort — no paid AI APIs; if Ollama is unreachable, links fall back to unverified guesses. Reaches the host's Ollama via `extra_hosts: host.docker.internal:host-gateway` in `docker-compose.yml`.
 
 ### 3. Database (PostgreSQL)
@@ -29,6 +30,7 @@ Incighder is a multi-service data application designed to aggregate and visualiz
 
 ## Data Flow
 1. **Search**: User triggers search in Next.js -> API Route -> `data-api` (Python) -> Spotify/YouTube APIs.
+1b. **Discover**: Seed name -> API Route -> `data-api` -> Last.fm `getSimilar` -> Spotify/Last.fm enrichment -> similar-artist grid; "Track" feeds the ingestion path below.
 2. **Ingestion**: `data-api` transforms raw API data and inserts it into PostgreSQL.
 3. **Display**: Next.js fetches structured data from the `db` via API routes and renders the dashboard.
 
diff --git a/ai/CONTEXT_BUNDLE.md b/ai/CONTEXT_BUNDLE.md
index 6ae5b20..dbab740 100644
--- a/ai/CONTEXT_BUNDLE.md
+++ b/ai/CONTEXT_BUNDLE.md
@@ -1,5 +1,5 @@
 # AI Context Bundle
-Generated: Sun Jun 21 14:48:03 PDT 2026
+Generated: Sun Jun 21 20:00:39 PDT 2026
 
 ## ⚠️ Agent Navigation Guide
 1. Start with the **Current State** below to understand the focus.
@@ -56,6 +56,8 @@ Incighder is a multi-service data application designed to aggregate and visualiz
 - **Role**: Specialized service for data ingestion, search, and transformation.
 - **Framework**: Python with Flask/FastAPI (or similar) using `spotipy` for Spotify and `psycopg2` for PostgreSQL.
 - **Isolation**: Handles heavy data lifting and external API interactions to keep the frontend lean.
+- **Artist discovery (similar artists)**: `/discover` seeds on an artist name and uses the free **Last.fm `artist.getSimilar`** graph (Spotify's related-artists API was retired in late 2024) for similarity, then enriches each result via the existing Spotify search and Last.fm `artist.getInfo`. Backed by `similar_artists.py` + the `/similar_artists` route; requires `LAST_FM_API_KEY`. "Track" reuses the standard `/insert_artist` pipeline.
+- **AI verification (optional dependency)**: auto-discovery cross-checks Instagram/TikTok guesses against the artist with a **local LLM via Ollama** (`OLLAMA_URL`, default `host.docker.internal:11434`; `OLLAMA_MODEL`, default `qwen2.5-coder:14b`). Free, private, best-effort — no paid AI APIs; if Ollama is unreachable, links fall back to unverified guesses. Reaches the host's Ollama via `extra_hosts: host.docker.internal:host-gateway` in `docker-compose.yml`.
 
 ### 3. Database (PostgreSQL)
 - **Role**: The source of truth for all artist metrics and historical data.
@@ -68,6 +70,7 @@ Incighder is a multi-service data application designed to aggregate and visualiz
 
 ## Data Flow
 1. **Search**: User triggers search in Next.js -> API Route -> `data-api` (Python) -> Spotify/YouTube APIs.
+1b. **Discover**: Seed name -> API Route -> `data-api` -> Last.fm `getSimilar` -> Spotify/Last.fm enrichment -> similar-artist grid; "Track" feeds the ingestion path below.
 2. **Ingestion**: `data-api` transforms raw API data and inserts it into PostgreSQL.
 3. **Display**: Next.js fetches structured data from the `db` via API routes and renders the dashboard.
 
@@ -82,13 +85,14 @@ This repository uses an AI-assisted engineering substrate located in `ai/`.
 
 PURPOSE: High-level summary of the system's current focus and recent changes to prevent agent drift.
 
-## Last Updated: 2026-06-20
-## Current Focus: Scraping (Phases 0–4) and the design overhaul are both shipped. Backlog: historical tracking, data export.
+## Last Updated: 2026-06-21
+## Current Focus: Artist discovery (seed -> similar artists) just shipped. Backlog: scheduled auto-scrape, data export.
 
 ## Project Goal
 Build a data application that provides a holistic view of an artist's online traction and potential, starting with Spotify and expanding to YouTube, SoundCloud, and social media.
 
 ## Recent Changes
+- **Artist Discovery**: New `/discover` page — seed artist → Last.fm `getSimilar` → Spotify-enriched grid (followers/popularity + Last.fm listeners/playcount/tags), one-click "Track" reuses the insert pipeline; already-tracked artists are marked. Backend `similar_artists.py` + `/similar_artists` route; uses `LAST_FM_API_KEY`.
 - **Scraping Plan**: Authored `SCRAPING_PLAN.md` for cross-platform metric scraping.
 - **Cleanup**: Fixed substrate drift, removed dead endpoints, guarded PATCH against column-name injection (branch `fix/substrate-and-api-cleanup`).
 - **Artist Editing**: Implemented PATCH request handling for artist info updates.
@@ -115,12 +119,17 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 - (nothing in progress — design overhaul shipped; pick next from Backlog)
 
 ## Backlog
-- [ ] Implement historical data tracking for followers
-- [ ] Add export artist data and bulk export artist data
+- [ ] Add bulk import of artist data (list a few artists, and add them to the data set automatically, scraping the suggest social media sites etc.)
+- [ ] scheduled auto-scrape for growth
+- [ ] Add export artist data and  export artist data
+- [x] Deploy with ngrok or cloudflared
 
 ## Completed
+- [x] Artist discovery: `/discover` page (seed → Last.fm similar → Spotify-enriched grid → one-click Track)
 - [x] UI design overhaul (Phases A–D): shadcn dark slate/cyan system, all pages redesigned (`DESIGN_OVERHAUL_PLAN.md`)
 - [x] Scraping Phase 0-4: scrapers + `/scrape` + auto-discovery (`/discover`) + metrics across the UI (`SCRAPING_PLAN.md`)
+- [x] Growth-over-time: per-account metric snapshots + `/history` + sparklines (account-keyed so re-linking doesn't fake growth)
+- [x] AI-verified discovery: local Ollama (`qwen2.5-coder`) checks auto-found IG/TikTok accounts are actually the artist; panel flags uncertain/mismatch (`ARCHITECTURE.md`)
 - [x] Implement artist editing functionality (PATCH requests)
 - [x] Enable navigation to new artist page
 - [x] Add navigation bar
@@ -163,11 +172,13 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 ./data-api/schema.sql
 ./data-api/link_preview.py
 ./data-api/Dockerfile
+./data-api/ai_verify.py
 ./data-api/followerCounts.py
 ./data-api/scrapeArtistData.py
 ./data-api/__pycache__
 ./data-api/artistSoundCloudScrape.py
 ./data-api/flush_db.py
+./data-api/similar_artists.py
 ./data-api/wait-for-it.sh
 ./data-api/insert_artist_from_json.py
 ./data-api/app.py
@@ -189,113 +200,12 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
```
