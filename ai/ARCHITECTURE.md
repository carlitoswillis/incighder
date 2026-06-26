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
- **Auto-discovery of links (`scrapers/discovery.py`)**: finds official profiles for an artist name. YouTube/SoundCloud use their native search APIs. IG/TikTok use a free **web search** (`web_search.py` → Google Programmable Search, `GOOGLE_CSE_KEY`/`GOOGLE_CSE_ID`): it queries `{name} site:<platform>`, normalizes hits to profile roots (rejecting `/p/`, `/reel/`, `/video/`, reserved paths), AI-verifies each candidate, and returns the best match plus ranked `alternates`. This recovers accounts whose handle differs from the artist's name. The old name-slug guess remains a fallback candidate, so discovery still works with no search key configured.
- **AI verification (`ai_verify.py`, optional)**: cross-checks discovered IG/TikTok profiles against the artist with a **local LLM via Ollama** (`OLLAMA_URL`, default `host.docker.internal:11434`; `OLLAMA_MODEL`, default `qwen2.5-coder:14b`). Returns `{match, confidence, reason}`. Free, private, best-effort — **no paid AI APIs**; if Ollama is unreachable the guess is kept as unverified. Reaches the host's Ollama via `extra_hosts: host.docker.internal:host-gateway` in `docker-compose.yml`.

### 3. Database (PostgreSQL)
- **Role**: Source of truth for all artist metrics and history.
- **Master schema**: `data-api/schema.sql` — the **single source of truth**. Tables: `artists` (Spotify + per-platform metric columns, `social_links`, `scrape_meta`), `albums`, `tracks`, and `metric_snapshots`.
- **Growth tracking**: `metric_snapshots` stores `(artist_id, platform, account_key, value, captured_at)`. `account_key` ties a data point to the specific linked profile, so switching accounts starts a fresh timeline instead of registering a fake jump. Big counts are `BIGINT` (views/plays exceed `INTEGER`'s 2.1B cap).
- **Incremental migrations**: `data-api/migrations/*.sql` (`0001_social_columns`, `0002_more_metrics`, `0003_growth_snapshots`) record schema evolution; `schema.sql` is the consolidated truth.
- **Applying schema**: `docker compose run --rm data-api python apply_schema.py` (first run / reset).

### 4. Infrastructure (Docker)
- **Services** (`docker-compose.yml`): `db`, `data-api`, `incighder-dev` (Next.js), and `scheduler`. `extra_hosts` bridges the data-api/scheduler to the host's Ollama.
- **Run**: `docker compose up --build` → frontend at `http://localhost:3000`.

### 5. Scheduler (auto-scrape worker — `data-api/scheduler.py`)
- **Role**: recurring metric pulls so growth history accrues without manual scraping.
- **How**: reuses the `data-api` image but runs `python scheduler.py` instead of Flask — a sleep/sweep loop that every `AUTO_SCRAPE_INTERVAL_HOURS` (default 24) calls `scrape_service.scrape_all(force=False)`. The 24h cache TTL means only stale platforms actually refetch; each sweep appends `metric_snapshots` through the normal scrape path. One artist failing never aborts the sweep. `AUTO_SCRAPE_STARTUP_DELAY` (default 60s) delays the first sweep on boot.

## Data Flow
1. **Search**: Next.js → `/api/spotify-search` → `data-api /spotify_search` → Spotify.
2. **Discover**: seed name → `/api/discover|similar` → `data-api` → Last.fm `getSimilar` + Spotify/Last.fm enrichment → grid; "Track" feeds ingestion.
3. **Ingestion**: `data-api` transforms API data → inserts into PostgreSQL.
4. **Scrape**: `/api/scrape` → `scrape_service` → per-platform scrapers (TTL-cached) → updates `artists` + appends `metric_snapshots`.
5. **Display**: Next.js reads structured data (via API routes / `pg`) and renders dashboard, table, detail, sparklines, and history.
6. **Scheduled sweep**: the `scheduler` worker periodically runs `scrape_all` over every artist (TTL-respected), feeding the same update + snapshot path as a manual scrape.

## AI Workspace Substrate
This repo uses an AI-assisted engineering substrate in `ai/`.
- **State & vision**: `ai/PROJECT_STATE.md` (read first; absorbs the former `GOALS.md`).
- **Rules**: `ai/AGENTS.md` defines agent constraints.
- **Plans**: `ai/SCRAPING_PLAN.md` (live scraping plan), `ai/DESIGN_OVERHAUL_PLAN.md` (UI system).
- **Context bundle**: `ai/CONTEXT_BUNDLE.md` is generated by `ai/ai-context.sh` — regenerate it after editing the docs above; don't hand-edit.
- **Flow**: Human Pilot → AI Implementation → Verification (`docker compose up` + manual QA).
