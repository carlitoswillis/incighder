# AI Context Bundle
Generated: Sat Jun 20 15:27:37 PDT 2026

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

### 3. Database (PostgreSQL)
- **Role**: The source of truth for all artist metrics and historical data.
- **Master Schema**: Located at `data-api/schema.sql`. This is the **single source of truth**. 
- **Application**: Schema changes must be applied via `data-api/apply_schema.py` inside the Docker container.

### 4. Infrastructure (Docker)
- **Role**: Service orchestration and environment parity.
- **Services**: `db`, `data-api`, and `incighder-dev` (Next.js).

## Data Flow
1. **Search**: User triggers search in Next.js -> API Route -> `data-api` (Python) -> Spotify/YouTube APIs.
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

## Last Updated: 2026-06-20
## Current Focus: Cross-Platform Scraping (see `SCRAPING_PLAN.md`)

## Project Goal
Build a data application that provides a holistic view of an artist's online traction and potential, starting with Spotify and expanding to YouTube, SoundCloud, and social media.

## Recent Changes
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

## Active (Phase D: Scraping) — detailed in `SCRAPING_PLAN.md`
- [ ] Phase 0: scraper framework, Playwright in Docker, schema columns
- [ ] Phase 1: Spotify monthly listeners + YouTube (API) + SoundCloud scrapers, `/scrape` endpoint, UI panel

## Backlog
- [ ] Phase 2: Instagram + TikTok (best-effort), X manual entry
- [ ] Phase 3: DuckDuckGo auto-discovery of profile links
- [ ] Phase 4: display metrics across card/table/detail; freshness indicators
- [ ] Implement historical data tracking for followers

## Completed
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
./incighder/tsconfig.json
./incighder/eslint.config.mjs
./incighder/next.config.ts
./incighder/src
./data-api
./data-api/apply_schema.py
./data-api/migrations
./data-api/spotify_search.py
./data-api/requirements.txt
./data-api/schema.sql
./data-api/Dockerfile
./data-api/followerCounts.py
./data-api/scrapeArtistData.py
./data-api/__pycache__
./data-api/artistSoundCloudScrape.py
./data-api/flush_db.py
./data-api/wait-for-it.sh
./data-api/insert_artist_from_json.py
./data-api/app.py
./data-api/scrapers
./data-api/brezzo.json
./README.md
./package-lock.json
./ai
./ai/ai-context.sh
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
5239346 docs: add cross-platform scraping plan
714f66d fix: clean up flagged drift, dead code, and PATCH injection
ce94169 rm tech debt
6327c4b update context and agent paradigm
b2ccc87 add edit flag
```

## 6. Active Diff
```diff
diff --git a/ai/CONTEXT_BUNDLE.md b/ai/CONTEXT_BUNDLE.md
index e1fc4fb..43231c9 100644
--- a/ai/CONTEXT_BUNDLE.md
+++ b/ai/CONTEXT_BUNDLE.md
@@ -1,5 +1,5 @@
 # AI Context Bundle
-Generated: Sat Jun 20 15:09:56 PDT 2026
+Generated: Sat Jun 20 15:27:37 PDT 2026
 
 ## ⚠️ Agent Navigation Guide
 1. Start with the **Current State** below to understand the focus.
@@ -156,6 +156,7 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 ./incighder/src
 ./data-api
 ./data-api/apply_schema.py
+./data-api/migrations
 ./data-api/spotify_search.py
 ./data-api/requirements.txt
 ./data-api/schema.sql
@@ -168,6 +169,7 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 ./data-api/wait-for-it.sh
 ./data-api/insert_artist_from_json.py
 ./data-api/app.py
+./data-api/scrapers
 ./data-api/brezzo.json
 ./README.md
 ./package-lock.json
@@ -184,113 +186,12 @@ PURPOSE: Tracks active work and backlog. AI agents should update this after comp
 
 ## 5. Recent Git Changes (Summary)
 ```text
+5239346 docs: add cross-platform scraping plan
 714f66d fix: clean up flagged drift, dead code, and PATCH injection
 ce94169 rm tech debt
 6327c4b update context and agent paradigm
 b2ccc87 add edit flag
-383f307 allow nav to new artist page
 ```
 
 ## 6. Active Diff
 ```diff
-diff --git a/ai/CONTEXT_BUNDLE.md b/ai/CONTEXT_BUNDLE.md
-index 9e5f4ee..0950e23 100644
---- a/ai/CONTEXT_BUNDLE.md
-+++ b/ai/CONTEXT_BUNDLE.md
-@@ -1,5 +1,5 @@
- # AI Context Bundle
--Generated: Fri Jun 19 23:01:11 PDT 2026
-+Generated: Sat Jun 20 15:09:56 PDT 2026
- 
- ## ⚠️ Agent Navigation Guide
- 1. Start with the **Current State** below to understand the focus.
-@@ -82,13 +82,15 @@ This repository uses an AI-assisted engineering substrate located in `ai/`.
- 
- PURPOSE: High-level summary of the system's current focus and recent changes to prevent agent drift.
- 
--## Last Updated: 2026-06-19
--## Current Focus: Polish Artist Management & Editing
-+## Last Updated: 2026-06-20
-+## Current Focus: Cross-Platform Scraping (see `SCRAPING_PLAN.md`)
- 
- ## Project Goal
- Build a data application that provides a holistic view of an artist's online traction and potential, starting with Spotify and expanding to YouTube, SoundCloud, and social media.
- 
- ## Recent Changes
-+- **Scraping Plan**: Authored `SCRAPING_PLAN.md` for cross-platform metric scraping.
-+- **Cleanup**: Fixed substrate drift, removed dead endpoints, guarded PATCH against column-name injection (branch `fix/substrate-and-api-cleanup`).
- - **Artist Editing**: Implemented PATCH request handling for artist info updates.
- - **Form UI**: Updated `src/app/artists/[id]/page.tsx` for full field editing.
- - **Navigation**: Enabled direct navigation to the new artist page.
-@@ -100,21 +102,23 @@ Build a data application that provides a holistic view of an artist's online tra
- - **Blockers**: None
- 
- ## Next Steps
--1. Perform QA/UX testing on the new artist editing workflow.
--2. Refine error handling for artist update submissions.
--3. Plan integration for YouTube data fetching (Future Phase).
-+1. Obtain a free YouTube Data API key (`YOUTUBE_API_KEY` in `.env`).
-+2. Execute `SCRAPING_PLAN.md` Phase 0 (foundations) then Phase 1 (Spotify ML, YouTube, SoundCloud).
-+3. Layer in best-effort socials (IG/TikTok), X manual, then DuckDuckGo discovery.
- 
- 
- # Tasks
- 
- PURPOSE: Tracks active work and backlog. AI agents should update this after completing tasks.
- 
--## Active (Phase C: Frontend)
--- [ ] Integrate YouTube search into the frontend (Future Phase)
-+## Active (Phase D: Scraping) — detailed in `SCRAPING_PLAN.md`
-+- [ ] Phase 0: scraper framework, Playwright in Docker, schema columns
-+- [ ] Phase 1: Spotify monthly listeners + YouTube (API) + SoundCloud scrapers, `/scrape` endpoint, UI panel
- 
- ## Backlog
--- [ ] Implement YouTube data fetching in Python `data-api`
--- [ ] Add SoundCloud integration
-+- [ ] Phase 2: Instagram + TikTok (best-effort), X manual entry
-+- [ ] Phase 3: DuckDuckGo auto-discovery of profile links
-+- [ ] Phase 4: display metrics across card/table/detail; freshness indicators
- - [ ] Implement historical data tracking for followers
- 
```
