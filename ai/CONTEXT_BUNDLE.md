# AI Context Bundle
Generated: Sat May 16 18:12:46 PDT 2026

## ⚠️ Agent Navigation Guide
1. Start with the **Current State** below to understand the focus.
2. Check **Active Tasks** for your specific assignment.
3. Only read files from the repository structure that are directly related to those tasks.
4. Do NOT perform full repository scans unless the task is an architectural audit.

## 1. Authoritative Rules (AGENTS.md)
Warning: AGENTS.md not found.

## 2. Architecture (ARCHITECTURE.md)
Warning: ARCHITECTURE.md not found.

## 3. Project State (PROJECT_STATE.md)
Warning: PROJECT_STATE.md not found.

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
./data-api/brezzo.json
./README.md
./package-lock.json
./CONTEXT_BUNDLE.md
./ai
./ai/ai-context.sh
./ai/ARCHITECTURE.md
./ai/CONTEXT_BUNDLE.md
./ai/PROJECT_STATE.md
./ai/AGENTS.md
./docker-compose.yml
./GOALS.md
```

## 5. Recent Git Changes (Summary)
```text
b2ccc87 add edit flag
383f307 allow nav to new artist page
e6a2c73 add nav bar
85814a3 allow editing of genre and image urls and add urls to profile
a2c20a7 feat: Add artist editing functionality with form submission and PATCH request handling
```

## 6. Active Diff
```diff
diff --git a/AGENTS.md b/AGENTS.md
deleted file mode 100644
index 9d49698..0000000
--- a/AGENTS.md
+++ /dev/null
@@ -1,29 +0,0 @@
-# Agent Guidelines (AGENTS.md)
-
-PURPOSE: This is the authoritative rulebook for AI assistants. It defines the 'how' and 'what' of the Incighder codebase.
-
-## Project Context
-- **Objective**: Build a data application for A&Rs/Labels to track artist audience traction.
-- **Stack**: Next.js (TypeScript, Tailwind), Python (Data API), PostgreSQL, Docker.
-
-## Architecture Constraints
-- **Dual-API Structure**: The Next.js frontend calls Next.js API routes, which in turn communicate with the Python `data-api` service.
-- **Docker-First**: All services run in Docker. Use the provided `./start_*.sh` scripts for development.
-- **Database**: PostgreSQL is the source of truth. Schema changes must be applied via `data-api/apply_schema.py`.
-- **Local-First**: Prioritize local inference and development.
-- **Markdown Persistence**: All state must be tracked in `.ai/*.md`.
-
-## Coding Conventions
-- **Explicit over Implicit**: Avoid hidden logic, reflection, or complex inheritance.
-- **Verification First**: All changes must be verified via `./scripts/verify.sh` and the project's own startup scripts.
-- **Compact Context**: Keep context files task-scoped and minimal.
-- **TypeScript**: Ensure strict typing in the Next.js frontend.
-- **Python**: Use idiomatic Python for the `data-api`.
-
-## How to Navigate This Workspace (Priority Flow)
-To minimize token waste and maximize focus, follow this priority sequence:
-1. **START HERE**: Read `.ai/CURRENT_STATE.md`. It defines the current high-level objective (currently Phase 1: YouTube Integration).
-2. **Operational Rules**: Read `AGENTS.md` (this file). Adhere strictly to these constraints.
-3. **Task Details**: Read `.ai/TASKS.md` to see the specific backlog and active items.
-4. **Implementation History**: Read `.ai/DECISIONS.md` only if you need to understand the 'why' behind an existing architectural choice.
-6. **Self-Correction**: If you feel your understanding of the project state is out of sync, you may run `./scripts/ai-context.sh` to refresh your local context bundle.
diff --git a/ARCHITECTURE.md b/ARCHITECTURE.md
deleted file mode 100644
index 9628bde..0000000
--- a/ARCHITECTURE.md
+++ /dev/null
@@ -1,38 +0,0 @@
-# Incighder Architecture
-
-PURPOSE: Technical system design and data flow of the Incighder application.
-
-## Overview
-Incighder is a multi-service data application designed to aggregate and visualize artist audience metrics from various music and social platforms.
-
-## System Components
-
-### 1. Frontend (Next.js)
-- **Role**: User interface and primary application logic.
-- **Framework**: Next.js with TypeScript and Tailwind CSS.
-- **API Routes**: Next.js API routes act as a proxy/orchestrator, calling the specialized `data-api`.
-
-### 2. Data API (Python)
-- **Role**: Specialized service for data ingestion, search, and transformation.
-- **Framework**: Python with Flask/FastAPI (or similar) using `spotipy` for Spotify and `psycopg2` for PostgreSQL.
-- **Isolation**: Handles heavy data lifting and external API interactions to keep the frontend lean.
-
-### 3. Database (PostgreSQL)
-- **Role**: The source of truth for all artist metrics and historical data.
-- **Master Schema**: Located at `data-api/schema.sql`. This is the **single source of truth**. 
-- **Application**: Schema changes must be applied via `data-api/apply_schema.py` inside the Docker container.
-
-### 4. Infrastructure (Docker)
-- **Role**: Service orchestration and environment parity.
-- **Services**: `db`, `data-api`, and `incighder-dev` (Next.js).
-
-## Data Flow
-1. **Search**: User triggers search in Next.js -> API Route -> `data-api` (Python) -> Spotify/YouTube APIs.
-2. **Ingestion**: `data-api` transforms raw API data and inserts it into PostgreSQL.
-3. **Display**: Next.js fetches structured data from the `db` via API routes and renders the dashboard.
-
-## AI Workspace Substrate
-This repository uses an AI-assisted engineering substrate located in `.ai/` and `scripts/`.
-- **Cognition Layer**: State and tasks are tracked in `.ai/`.
-- **Rules**: Agent constraints are defined in `AGENTS.md`.
-- **Flow**: Human Pilot -> AI Implementation -> Deterministic Verification (`scripts/verify.sh`).
diff --git a/PLAN.md b/PLAN.md
deleted file mode 100644
index b584dc8..0000000
--- a/PLAN.md
+++ /dev/null
@@ -1,5 +0,0 @@
-# Task C2: Update `src/app/artists/[id]/page.tsx`
-
-- [ ] Ensure that every field is editable so that it may act as a POST / PUT json body.
-- [ ] Handle form submission to send a PATCH request to update the artist info.
-- [ ] Verify that the PATCH endpoint in `incighder/src/app/api/artists/[id]/route.ts` can handle all fields.
diff --git a/PLAN_archive.md b/PLAN_archive.md
deleted file mode 100644
index 76a3748..0000000
--- a/PLAN_archive.md
+++ /dev/null
@@ -1,399 +0,0 @@
-Comprehensive Data Integration Plan for Artist Assessment (Revised)
-
-  Overall Goal: To build a data application that provides a holistic view
-  of an artist's online traction and potential, incorporating a wide array
```
