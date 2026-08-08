# Incighder Architecture

PURPOSE: Technical system design and data flow of the Incighder application.

## Overview
Incighder aggregates and visualizes artist audience metrics from music and social platforms. It is a **flat Next.js app** (repo root) backed by **TiDB Cloud Serverless in production** (MySQL-compatible, via `DATABASE_URL`; local MySQL 8.4 for offline dev), with a Python `data-api` on the home Mac for the heavy scraping/discovery work plus local LLM/voice bridges. **No Docker** — everything runs natively (`./start_dev.sh`), and the frontend deploys to **Vercel** (live at incighder.vercel.app). Three attached subsystems ride on the same DB and repo: the **GLO agent** (in-app chat/voice analyst), the **knowledgebase** (org memory GLO reads and writes), and the **MCP endpoint** (the same tool registry exposed to external Claude clients) — see components 6–8.

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

### 3. Database (TiDB Serverless prod / MySQL 8.4 local)
- **Role**: Source of truth for all artist metrics, history, events, posts, and knowledge. Production: TiDB Cloud Serverless via `DATABASE_URL`; local dev fallback: Homebrew `mysql@8.4`, DB/user `incighder`.
- **Master schema**: `data-api/schema.sql` (MySQL DDL — `JSON` columns, `AUTO_INCREMENT`, `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, table-level `FOREIGN KEY`s). Tables: `artists`, `albums`, `tracks`, `metric_snapshots`, `events` (+ `event_artists`), `artist_posts` (per-post engagement; collation pinned utf8mb4_unicode_ci for the FK), `kb_items` (knowledgebase), `app_config` (published tunnel URL). TiDB quirk: no FULLTEXT — kb search is LIKE-based.
- **Growth tracking**: `metric_snapshots(artist_id, platform, account_key, value, captured_at)`. `account_key` ties a point to the specific linked profile so account switches start a fresh timeline. Big counts are `BIGINT`.
- **Applying schema**: `./.venv/bin/python apply_schema.py` from `data-api/` — **idempotent** (`CREATE TABLE IF NOT EXISTS`; existing data untouched), so `start_dev.sh` safely runs it on every boot. Destructive rebuild: `apply_schema.py --reset` (interactive confirmation, or `APPLY_SCHEMA_RESET_CONFIRM=yes`). History: the old drop-and-recreate default silently wiped all data on every dev start — that was the recurring "DB lost everything" bug. There is no incremental-migration framework yet (see tech-debt backlog).
- **Connection config (all three runtimes)**: `DATABASE_URL` (`mysql://user:pass@host:port/db?sslmode=require`) wins; `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_SSL` fill gaps; defaults target local MySQL. Implemented once per runtime: `src/lib/db.ts` (`getPool()` — single shared mysql2 pool), `scripts/db-config.mjs`, `_db_config()` in `data-api/scrapeArtistData.py` (PyMySQL, TLS via certifi). Point `DATABASE_URL` at a hosted MySQL (TiDB Serverless/Aiven) and the whole stack follows — see `DEPLOY.md`.

### 4. Running it (native, no Docker)
- **`./start_dev.sh`** (repo root): starts MySQL 8.4 (skipped when `DATABASE_URL` is set), sets up the Python venv + installs deps on first run, ensures the schema, launches the data-api (gunicorn `:$DATA_API_PORT`, default 5050, with `OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES` for macOS thread-fork safety), then `npm run dev` (frontend `:$WEB_PORT`, default 3000). Ports are env-overridable: `DATA_API_PORT=8080 WEB_PORT=4000 ./start_dev.sh`.
- Frontend alone: `npm run dev` at the repo root. Data-api alone: venv gunicorn in `data-api/`.

### 5. Scheduler (auto-scrape worker — `data-api/scheduler.py`)
- Optional recurring metric pulls. Runs `python scheduler.py` (its own process) — a sleep/sweep loop that every `AUTO_SCRAPE_INTERVAL_HOURS` (default 24) calls `scrape_service.scrape_all(force=False)`. TTL means only stale platforms refetch; each sweep appends `metric_snapshots`.

### 6. GLO agent (in-app analyst — `src/lib/agent/`, `src/components/glo/`)
- **Surface**: floating widget on every page (full-screen sheet on mobile, card on sm+), admin-only. Chat + hands-free voice.
- **Loop**: `POST /api/agent` (SSE) → `runAgentTurn` (`providers.ts`) over the tool registry `tools.ts` — 17 tools ({name, description, inputSchema, label, run}); all arithmetic (deltas, medians, rankings) happens in TS so the model never does math. Visitor/admin scoping enforced inside each tool via `ctx.admin`.
- **Providers, in order** (`GLO_PROVIDER` forces): local Claude Code CLI (`cli-provider.ts`, enforced-JSON ReAct loop, `--resume` sessions) → home-Mac CLI via data-api `/agent_turn` (subscription auth — production's normal path; **no metered keys by policy**) → `ANTHROPIC_API_KEY` → Gemini. Remote health check is TTL-cached (5 min); route memoizes groups/page-artist lookups.
- **Voice**: `/api/agent/transcribe` (faster-whisper on the Mac → Gemini fallback), `/api/agent/speak` (Kokoro/edge-tts → Gemini). Claude has no speech APIs — Gemini is ears/mouth only.

### 7. Knowledgebase (`src/lib/knowledge/`, `/knowledge` UI)
- `kb_items`: facts / documents / images / links, attachable to an artist or roster group; files ≤24 MB (≤4 MB inline in TiDB, bigger originals on the Mac via `file_path`); AI text extraction (CLI → data-api bridge → API fallbacks) makes uploads searchable.
- **Search** (`db.ts:searchKb`): LIKE-based, terms ANDed, hand-rolled relevance (title×3, tags×2, summary/body×1).
- **The loop**: `recall.ts` auto-injects relevant items into every GLO turn's system prompt (stopword term extraction + progressive relaxation); `save_fact` has a near-duplicate gate; `update_knowledge_item` refines instead of duplicating. Prompt rules: proactive saving, update-over-duplicate, cite by title.

### 8. MCP endpoint (`src/app/api/mcp/route.ts`)
- The same `agentTools` registry served to external MCP clients (Claude Code, Claude Desktop, claude.ai connectors incl. mobile) over streamable HTTP (`mcp-handler` v2 + a JSON-Schema→Zod converter in `src/lib/mcp/schema.ts`). Register a tool once in `tools.ts` → it exists in GLO and MCP.
- **Auth**: bearer `MCP_TOKEN` (also `?token=` for header-less clients) — an admin credential; fail-closed when unset. `maxDuration = 120` for `refresh_artist`.

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
- **Admin/product split**: `README.md` is public/product-facing; admin-only features (auth gate, GLO, knowledgebase, MCP) live in `ADMIN.md`.
- **Flow**: Human Pilot → AI Implementation → Verification (`./start_dev.sh` + manual QA). The old generated `CONTEXT_BUNDLE.md` was deleted 2026-08-08 — read the source `ai/*.md` files directly.
