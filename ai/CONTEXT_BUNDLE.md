# AI Context Bundle
Generated: Thu Aug  6 16:04:20 PDT 2026

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

## Last Updated: 2026-08-06
## Current Focus: **Live; newest surface is "GLO" — the in-app voice/chat stats agent** (see Recent Changes 2026-08-06): a floating assistant on every page that answers roster questions from hard tool-computed numbers (deltas, rankings, event impact, per-post outliers) over the existing DB, runs on the owner's logged-in Claude Code CLI locally (API-key/Gemini fallback on Vercel), and speaks answers via Web Speech. Previously: **live, iterating on the analytics/reporting surface.** Site is live at incighder.vercel.app on TiDB Serverless (the data-wipe bug and the single-`DATABASE_URL` migration are done; DB config centralized in `src/lib/db.ts` / `scripts/db-config.mjs` / `_db_config()`). Most recent work is the growth/reporting surface: **windowed growth** (a From/To date range replacing the single-date rewind scrubber), **chart accessibility** (role/aria/keyboard + a Table view), **print-fidelity reports** (formerly "one-sheets" — renamed 2026-08-03), and a **concurrent scheduled sweep** (see Recent Changes). Backlog below: change/threshold alerts, playlist/chart tracking, discovery seeded from a tracked artist, robust history charts.

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
- **"GLO" in-app stats agent + per-post data (2026-08-06)**: a floating chat/voice assistant (bottom-right FAB on every page, `src/components/glo/`, mounted in `app-shell`) that answers manager questions — roster pulse, momentum/allocation, brand-pitch prep, spike attribution — with an evidence→reasoning→conclusion persona whose every number comes from a tool result (exact TS-computed deltas/medians, as-of dates; nulls = "not tracked"; event impact framed as correlation). Backend: `POST /api/agent` (SSE: tool/tool_result/text/done/error events, `src/app/api/agent/route.ts`) + a 10-tool registry (`src/lib/agent/tools.ts`: list_artists, get_artist, get_growth w/ prior-window acceleration, rank_roster batched cross-artist windowed growth, get_events impact, get_posts w/ per-platform medians+outliers, compare_artists, similar_artists, admin-only refresh_artist, data_status) — all direct-DB so it works with the home tunnel down, inheriting is_public/linked-platform/latest-account_key rules. LLM providers (`providers.ts`, raw fetch, no SDK): **Claude Code CLI first** (`cli-provider.ts`, autojob-style `claude -p --output-format json --json-schema` + `--resume` ReAct tool loop on the owner's subscription login, `GLO_CLI_MODEL` default `sonnet`) → `ANTHROPIC_API_KEY` (Messages API streaming, thinking-block echo handled) → Gemini (`GOOGLE_AI_API_KEY`, thinkingBudget 0); `GLO_PROVIDER` forces one. Routes (/api/agent + transcribe + speak) are passphrase-gated admin-only like all advanced features, with per-IP rate limiting + input caps; the widget renders only for admin sessions. Voice: Web Speech API — mic dictation auto-sends, answers optionally spoken (toggle persisted). Per-post data: new `artist_posts` table (PK artist_id+platform+post_id; lazily self-creating on first write) fed by IG recent-12 posts (web_profile_info timeline edges; hidden-like sentinel → NULL) and YT recent uploads (~2 extra quota units/artist) in `scrape_service.py`; posts never touch metric columns or snapshots. Built via ultracode: 5-subsystem map → 3 parallel worktree builders → 25-agent adversarial review (18 confirmed findings, all fixed — incl. Anthropic thinking-echo 400, cross-platform median blending, sparse-gap weekly-% overstatement) → live SSE curl verified through the CLI provider (anonymous request correctly scoped to public artists). Scheduler note: restart `scheduler.py`/gunicorn to pick up the posts pipeline. **Remote CLI bridge (same day)**: data-api `POST /agent_turn` runs one GLO model turn on the home Mac's logged-in CLI (subprocess `claude -p`, secret-guarded, 150s cap inside gunicorn's 180s timeout, `~/.local/bin` fallback for pm2's PATH), and `cli-provider.ts` gained a "remote" transport over the tunnel — provider order is now local CLI → **home-Mac CLI via tunnel** → `ANTHROPIC_API_KEY` → Gemini, so the deployed site uses the subscription too and only falls back to metered keys when the Mac is offline. Verified live against the pm2 data-api incl. `--resume` session continuity. **Voice rebuilt for phones + natural British TTS (same day)**: Web Speech recognition is Safari-only on iOS (Chrome-iOS always dies with service-not-allowed — the user's original "red dot flash"), so the mic now records via MediaRecorder with RMS silence auto-stop and transcribes through `POST /api/agent/transcribe` (Gemini; direct if the runtime has the key, else data-api `/transcribe` bridge). The voice stack is now fully local/open-source on the data-api host (Gemini free-tier daily quotas 429d under real use): STT = faster-whisper base.en int8 (offline, ~0.7s/utterance, `GLO_STT_MODEL`); TTS = Kokoro-82M ONNX (Apache-2.0, model files in gitignored data-api/models/, British female `bf_emma` default via `GLO_TTS_KOKORO_VOICE`, `GLO_TTS_SPEED`), fallbacks edge-tts (`GLO_TTS_VOICE` en-GB-SoniaNeural) then Gemini (`GLO_TTS_GEMINI_VOICE`); Vercel routes bridge to the Mac FIRST for both. Client speaks replies in sentence chunks pipelined with prefetch (first words ~2s behind text); silent-WAV unlock for iOS autoplay; Gemini keys moved to headers so logs stop capturing them. Headphones toggle = hands-free loop (listen → answer → speak → listen). Anthropic ships no speech APIs, so Gemini is ears/mouth only — the brain stays Claude-first. **Posts pipeline live**: first activation hit MySQL error 3780 — the lazily created `artist_posts` inherited TiDB's default `utf8mb4_bin` collation, incompatible with `artists.id` (`utf8mb4_unicode_ci`) for the FK; DDL now pins `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` in both schema.sql and `_POSTS_TABLE_DDL`. matt proxy's 10 recent YouTube uploads captured with likes/comments/views; GLO verified on prod citing specific videos vs per-platform medians ("DEATH BY BASS 3.0x median"). IG posts parse correctly (12 in a direct run) but repeated same-day hits soft-block `web_profile_info` onto the no-timeline fallback — rows will accrue via the spaced nightly sweep.
- **Self-healing go_live watchdog — sleep/wake tunnel recovery (2026-08-03)**: laptop sleep kills a cloudflared quick tunnel PERMANENTLY — after wake, cloudflared retries its dead edge registration forever without exiting ("control stream encountered a failure while serving" loop), so the old `wait`-based go_live.sh never noticed and the stale URL stayed in `app_config.data_api_url` (live site stuck on the offline banner until a manual restart). `go_live.sh` now ends in a supervision loop (every `GO_LIVE_CHECK_INTERVAL`s, default 20): probes the tunnel END-TO-END through the Cloudflare edge (`$TUNNEL_URL/health`), detects wake via wall-clock jump (fast-path restart, no 3-strike wait), restarts cloudflared + republishes on failure. Also from an ultracode adversarial review (8 confirmed findings): top-level `cd $ROOT` (publish_url was cwd-sensitive), initial publish is non-fatal (watchdog retries), `start_api` reports failure instead of silently "going LIVE" with a dead API, tunnel probes are gated on local-origin health (a dead gunicorn no longer churns healthy tunnels), startup reap-waits leftover cloudflareds before truncating tunnel.log (a half-dead one punches NUL holes → BSD grep sees "binary", never extracts the URL), pidfile single-instance guard, periodic DB read-back heals external overwrites of the published row, and the watchdog restarts a dead scheduler. `scheduler.py`: the 24h `time.sleep` didn't advance during macOS system sleep (a "daily" sweep drifted to ~34h wall-clock on a nightly-sleeping laptop) — now a wall-clock-anchored 60s-tick deadline loop. Runs under pm2 as `incighder-data-api` (kill_timeout 15s); traps are pm2-aware: interruptible sleep (`sleep & wait`), INT/TERM handler exits (no watchdog-resurrects-the-tunnel-after-cleanup), cleanup kills children before the slow DB clear. Verified live: kill -9 on cloudflared → new tunnel up + republished + deployed site back online, hands-off.
- **IG exact-count fallback for schema-broken profiles (2026-07-29)**: some business/creator profiles (brandon, daniel of glogang) permanently 400 on `web_profile_info` with an Instagram server-side schema error ("Asset asset://laser.provider/ig_business_category_subvertical has been deleted") — this was misdiagnosed at onboarding as an anonymous rate limit. The og-tag HTML fallback rounds counts for larger accounts ("26K"), and since `_maybe_snapshot` dedupes unchanged values, brandon sat at one growth point for a week. Fix in `scrapers/instagram.py`: the crawler-served profile HTML also embeds the numeric `profile_id`; the fallback now feeds it to the mobile `users/{id}/info/` endpoint (different schema, doesn't trip the bug) for exact follower/media counts + verified + HD avatar, with og tags demoted to last resort. Verified: brandon 26000 (rounded) → 25557 (exact). the Growth section's single-date rewind scrubber is replaced by a **date-range window** (`components/date-range.tsx` + `src/lib/series.ts`) — pick a From/To over real snapshot days and every chart, delta, and sparkline below scopes to it. Growth anchors on the value carried INTO the window (`deltaOver`), so a window that opens between scrapes still measures from where the count actually was. `?date=` still resolves (as the window's end); `?from=&to=` round-trips a shared/printed window. Charts gained accessibility (`role="img"`, `aria-label`, keyboard cursor, `aria-live`, a Table view so no value is hover-gated; two low-contrast platform inks — X, Spotify — darkened to clear 3:1). Print one-sheets are sized by aspect ratio at content height to stop a near-empty second page under Safari's scale-to-fit-width (verified 1.00–1.20 on Letter + A4). `components/rewind-scrubber.tsx` removed; `src/lib/rewind.ts` helpers stay.
- **Concurrent scheduled sweep (2026-07-28)**: `scrape_all` sweeps artists `SCRAPE_SWEEP_WORKERS` at a time (default 4) instead of one-at-a-time. Safe because `throttle()` locks per HOST, not per artist — concurrent artists hitting the same site still serialize on that host's lock, so we never burst a site; we only stop leaving hosts idle between artists. Each `scrape_artist` owns its own DB connection, so nothing is shared across sweep threads. Near-linear wall-clock win as the roster grows.
- **Partial scrapes retry + honest freshness label (2026-07-26)**: `ScrapeResult.partial` — a scrape that succeeds but misses a metric it owns (Spotify monthly listeners when the scrape.do render fails) gets `scrape_meta.status = "partial"`, which `_is_fresh` treats as stale, so the next refresh/sweep retries it instead of losing a day of snapshots; the render itself now retries 3× (non-200 or count missing from the rendered page). Bulk-refresh UI: "cached" → "N fresh (scraped Xh ago)" with a per-platform tooltip + copy explaining the nightly auto-sweep (the sweep is why manual refreshes usually find everything fresh); partial platforms surface as an amber chip. Note: `scheduler.py` doesn't hot-reload — restart it after editing scrape code.
- **Rewound reports (2026-07-24)**: the one-sheet report pages (`/artists/[id]/report`, `/g/[group]/report`) now have the rewind scrubber — view/print the report as of any recorded snapshot day, shareable via `?date=YYYY-MM-DD`. Shared helpers in `src/lib/rewind.ts` + `components/rewind-scrubber.tsx`; rewound score recomputed from as-of values (momentum stripped — approximation); footprint hidden when rewound (no history for those fields). _(2026-07-28: `rewind-scrubber.tsx` removed; the windowed date-range supersedes it and `?date=` still resolves as the window end.)_
- **Twitch + photos (2026-07-23)**: Twitch is a first-class tracked platform (web GQL, keyless). Manual adds get profile pictures automatically from their socials on scrape; admins can also upload a photo (data-URI storage, no file infra, ~60-150KB/person — negligible vs TiDB's 5GiB). Group chips on home are now admin-only: grouped members are visible ONLY via their /g/<group> URL.
- **Data export + one-sheets (2026-07-23)**: admin CSV export; print/PDF-ready per-person and per-group "traction one-sheet" pages (masthead, traction ledger with deltas + sparklines, footprint); `/api/history` now native TS. Glogang roster onboarded: 8 skaters + DJ Maino (IG links, Maino also YT + Twitch in `external_urls`; 7/9 scraped — IG anonymous rate limit blocked daniel/brandon, retry later or set `IG_SESSIONID`).
- **Artist groups (2026-07-23)**: `group_name` column + `/g/[group]` pages + `/api/groups`; main list = ungrouped only (roster separation à la glogang); shared `ArtistGrid` component behind home and group pages.
- **Artist bio (2026-07-23)**: `bio`/`bio_source` columns; admin "Fetch from Last.fm" (native TS route, works without the data-api) with graceful "no bio" handling; manual bios via the edit form for non-recording artists (skaters/clients). About card shows to visitors when a bio exists.
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
- [ ] log events to see if stats moved at that date. like new post, new thing, song, video, etc.

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
- [ ] Top youtube video embedded in the artist page like as a hero under or over the stats idk yet
- [ ] Discovery seeded from an already-tracked artist (in-app, not just the `/discover` search box)
- [ ] Robust history charts (currently sparse — often only 2 points until more scans accrue)
- [ ] Change/threshold alerts (notify when a metric jumps X%) — `metric_snapshots` is the foundation; pairs with scheduled auto-scrape. Closes a gap vs competitors (see `COMPETITORS.md`)
- [ ] Playlist / chart-placement tracking — competitor table-stakes we lack (see `COMPETITORS.md`)

## Completed
- [x] Rewound reports (2026-07-24): date scrubber + `?date=` param on both one-sheet report pages — replay any snapshot day, print historical reports (`lib/rewind.ts`, `components/rewind-scrubber.tsx`)
- [x] Rewind scrubber (2026-07-23): time-travel the Growth section — slider ticks are the real snapshot dates (workingmemory's "time travel = pure replay of recorded events" pattern); shows each platform's value on that day + "since then" delta; sparklines truncate. Pure client-side over `/api/history`. Pairs with events for reviewing what stats looked like on a given date. _(Superseded 2026-07-28 by the windowed date-range — `components/date-range.tsx` + `src/lib/series.ts`; `rewind-scrubber.tsx` removed.)_
- [x] Events/campaign tracking (2026-07-23): `events` + `event_artists` junction (one event spans many people — group-mate chips in the add form, '+N others' badge); `/api/events` computes per-person change vs `metric_snapshots` (baseline at event date → last reading in a 14-day window). Copy deliberately frames it as **observed correlation, not causation**. Event types incl. `post`. Scheduler runs inside `go_live.sh` (daily sweep) so snapshot density — and attribution sharpness — grows on its own.
- [x] Manual sort order (2026-07-23): `sort_order` column + admin **up/down arrows on cards** (grid persists 1-based order; edit-form Sort field = direct override). Glo Gang / Glo Gang Skate Team / Maino pinned atop glogang. Also added `@glogang` (291K IG) + `@glogangskateteam` (6.8K IG) as tracked members.
- [x] Weighted cross-platform traction score (2026-07-23): Reach (≤100, log total audience across all platforms) + Breadth (≤25) + **Momentum** (≤50, median weekly growth % from `metric_snapshots`, server-attached as `momentum_wk_pct` via `src/lib/momentum.ts`) + Spotify popularity (≤25). IG-only members score meaningfully; breakdown tooltip explains every point.
- [x] Hide unlinked platforms (2026-07-23): `platformHasPresence()` filters cards + metric grid (SourcesPanel still lists all for linking); Spotify presence requires a real identity, not manual-insert zeros.
- [x] Twitch platform (2026-07-23): `scrapers/twitch.py` via the twitch.tv web GQL Client-ID (no API keys), `twitch_followers` + growth snapshots + UI/CSV. Maino Da Plug tracked (6.9K followers).
- [x] Photos (2026-07-23): admin uploads (client-downscaled 512px JPEG → data-URI in `images`; `ArtistImage` renders both data: and CDN srcs) + **social-avatar fallback** — scrapers emit `profile_pic_url` (IG > TikTok > Twitch > YT > SC priority), scrape inlines it (≤400KB cap) when no image exists. Whole glogang roster has faces except daniel/brandon (IG anonymous-lookup blocks).
- [x] Data export (2026-07-23): `/api/export` CSV (roster/group/all/ids, admin) + printable traction one-sheets `/artists/[id]/report` and `/g/[group]/report` (print CSS flips dark tokens to the light palette); `/api/history` ported to native TS (metric_snapshots read directly — growth works without the data-api)
- [x] Artist groups (2026-07-23): `group_name` roster separation — grouped artists leave the main list and live at `/g/<name>` (public URL, is_public-respecting); group chips on home via `/api/groups`; `?all=1` keeps bulk tools whole-roster; Group field in edit form. Generalizes the "/glogang page" idea and pre-builds group export + Manager rosters.
- [x] Artist bio (2026-07-23): native TS `/api/bio` (Last.fm `artist.getInfo`, admin-only) + editable bio in the edit form (`bio_source` lastfm|manual) + About card on artist pages (visitor-visible). Later: AI-synthesized multi-source summary.
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
./data-api/models
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
./RUNNING.local.md
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
faa51d5 GLO voice: edge-tts neural British voice + chunked playback pipeline
78cc28f GLO: admin-gate the agent, blackout the CLI session, batch tool rounds
2e91901 artist_posts: pin utf8mb4_unicode_ci so the FK to artists.id creates on TiDB
6b3bef0 GLO speaks with a natural British female voice via Gemini TTS
c49f6d7 GLO voice rebuilt: works on phones, adds hands-free voice mode
```

## 6. Active Diff
```diff
diff --git a/.gitignore b/.gitignore
index cf41a40..386b08d 100644
--- a/.gitignore
+++ b/.gitignore
@@ -147,3 +147,4 @@ __pycache__/
 .aider*
 .vercel
 .env*
+data-api/models/
diff --git a/.env.example b/.env.example
index 3d6e22d..0f97ca3 100644
--- a/.env.example
+++ b/.env.example
@@ -50,9 +50,13 @@ ANTHROPIC_MODEL=
 # Code subscription — local only. GLO_CLI_MODEL defaults to 'sonnet'.
 GLO_PROVIDER=
 GLO_CLI_MODEL=
-# Spoken replies: edge-tts neural voice rendered on the data-api host
-# (default en-GB-SoniaNeural — a natural British woman). Gemini TTS is the
-# fallback path (its preview model has a tiny free-tier daily quota).
+# Spoken replies, rendered on the data-api host. Primary: Kokoro (open-source,
+# offline — model files in data-api/models/, see kokoro-onnx releases);
+# GLO_TTS_KOKORO_VOICE defaults to bf_emma (also: bf_isabella, bf_alice,
+# bf_lily), GLO_TTS_SPEED to 1.05. Fallbacks: edge-tts (GLO_TTS_VOICE, default
+# en-GB-SoniaNeural), then Gemini TTS (tiny free-tier daily quota).
+GLO_TTS_KOKORO_VOICE=
+GLO_TTS_SPEED=
 GLO_TTS_VOICE=
 GLO_TTS_GEMINI_VOICE=
 GLO_TTS_STYLE=
diff --git a/.gitignore b/.gitignore
index 386b08d..2097f3b 100644
--- a/.gitignore
+++ b/.gitignore
@@ -147,4 +147,7 @@ __pycache__/
 .aider*
 .vercel
 .env*
+
+# local-only run notes
+RUNNING.local.md
 data-api/models/
diff --git a/ai/CONTEXT_BUNDLE.md b/ai/CONTEXT_BUNDLE.md
index a50a439..c28e1ad 100644
--- a/ai/CONTEXT_BUNDLE.md
+++ b/ai/CONTEXT_BUNDLE.md
@@ -1,5 +1,5 @@
 # AI Context Bundle
-Generated: Thu Aug  6 15:40:02 PDT 2026
+Generated: Thu Aug  6 16:04:20 PDT 2026
 
 ## ⚠️ Agent Navigation Guide
 1. Start with the **Current State** below to understand the focus.
@@ -152,7 +152,7 @@ The long-term aim is a single dashboard that scores artist traction from many si
 ---
 
 ## Recent Changes
-- **"GLO" in-app stats agent + per-post data (2026-08-06)**: a floating chat/voice assistant (bottom-right FAB on every page, `src/components/glo/`, mounted in `app-shell`) that answers manager questions — roster pulse, momentum/allocation, brand-pitch prep, spike attribution — with an evidence→reasoning→conclusion persona whose every number comes from a tool result (exact TS-computed deltas/medians, as-of dates; nulls = "not tracked"; event impact framed as correlation). Backend: `POST /api/agent` (SSE: tool/tool_result/text/done/error events, `src/app/api/agent/route.ts`) + a 10-tool registry (`src/lib/agent/tools.ts`: list_artists, get_artist, get_growth w/ prior-window acceleration, rank_roster batched cross-artist windowed growth, get_events impact, get_posts w/ per-platform medians+outliers, compare_artists, similar_artists, admin-only refresh_artist, data_status) — all direct-DB so it works with the home tunnel down, inheriting is_public/linked-platform/latest-account_key rules. LLM providers (`providers.ts`, raw fetch, no SDK): **Claude Code CLI first** (`cli-provider.ts`, autojob-style `claude -p --output-format json --json-schema` + `--resume` ReAct tool loop on the owner's subscription login, `GLO_CLI_MODEL` default `sonnet`) → `ANTHROPIC_API_KEY` (Messages API streaming, thinking-block echo handled) → Gemini (`GOOGLE_AI_API_KEY`, thinkingBudget 0); `GLO_PROVIDER` forces one. Routes (/api/agent + transcribe + speak) are passphrase-gated admin-only like all advanced features, with per-IP rate limiting + input caps; the widget renders only for admin sessions. Voice: Web Speech API — mic dictation auto-sends, answers optionally spoken (toggle persisted). Per-post data: new `artist_posts` table (PK artist_id+platform+post_id; lazily self-creating on first write) fed by IG recent-12 posts (web_profile_info timeline edges; hidden-like sentinel → NULL) and YT recent uploads (~2 extra quota units/artist) in `scrape_service.py`; posts never touch metric columns or snapshots. Built via ultracode: 5-subsystem map → 3 parallel worktree builders → 25-agent adversarial review (18 confirmed findings, all fixed — incl. Anthropic thinking-echo 400, cross-platform median blending, sparse-gap weekly-% overstatement) → live SSE curl verified through the CLI provider (anonymous request correctly scoped to public artists). Scheduler note: restart `scheduler.py`/gunicorn to pick up the posts pipeline. **Remote CLI bridge (same day)**: data-api `POST /agent_turn` runs one GLO model turn on the home Mac's logged-in CLI (subprocess `claude -p`, secret-guarded, 150s cap inside gunicorn's 180s timeout, `~/.local/bin` fallback for pm2's PATH), and `cli-provider.ts` gained a "remote" transport over the tunnel — provider order is now local CLI → **home-Mac CLI via tunnel** → `ANTHROPIC_API_KEY` → Gemini, so the deployed site uses the subscription too and only falls back to metered keys when the Mac is offline. Verified live against the pm2 data-api incl. `--resume` session continuity. **Voice rebuilt for phones + natural British TTS (same day)**: Web Speech recognition is Safari-only on iOS (Chrome-iOS always dies with service-not-allowed — the user's original "red dot flash"), so the mic now records via MediaRecorder with RMS silence auto-stop and transcribes through `POST /api/agent/transcribe` (Gemini; direct if the runtime has the key, else data-api `/transcribe` bridge). Spoken replies render via `POST /api/agent/speak` → Gemini TTS (voice Despina, poised-British-woman style prompt; `GLO_TTS_VOICE/STYLE/MODEL` env overrides; raw PCM wrapped as WAV; data-api `/speak` bridge; British system voice as offline fallback; silent-WAV unlock for iOS autoplay). Headphones toggle = hands-free loop (listen → answer → speak → listen). Anthropic ships no speech APIs, so Gemini is ears/mouth only — the brain stays Claude-first. **Posts pipeline live**: first activation hit MySQL error 3780 — the lazily created `artist_posts` inherited TiDB's default `utf8mb4_bin` collation, incompatible with `artists.id` (`utf8mb4_unicode_ci`) for the FK; DDL now pins `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` in both schema.sql and `_POSTS_TABLE_DDL`. matt proxy's 10 recent YouTube uploads captured with likes/comments/views; GLO verified on prod citing specific videos vs per-platform medians ("DEATH BY BASS 3.0x median"). IG posts parse correctly (12 in a direct run) but repeated same-day hits soft-block `web_profile_info` onto the no-timeline fallback — rows will accrue via the spaced nightly sweep.
+- **"GLO" in-app stats agent + per-post data (2026-08-06)**: a floating chat/voice assistant (bottom-right FAB on every page, `src/components/glo/`, mounted in `app-shell`) that answers manager questions — roster pulse, momentum/allocation, brand-pitch prep, spike attribution — with an evidence→reasoning→conclusion persona whose every number comes from a tool result (exact TS-computed deltas/medians, as-of dates; nulls = "not tracked"; event impact framed as correlation). Backend: `POST /api/agent` (SSE: tool/tool_result/text/done/error events, `src/app/api/agent/route.ts`) + a 10-tool registry (`src/lib/agent/tools.ts`: list_artists, get_artist, get_growth w/ prior-window acceleration, rank_roster batched cross-artist windowed growth, get_events impact, get_posts w/ per-platform medians+outliers, compare_artists, similar_artists, admin-only refresh_artist, data_status) — all direct-DB so it works with the home tunnel down, inheriting is_public/linked-platform/latest-account_key rules. LLM providers (`providers.ts`, raw fetch, no SDK): **Claude Code CLI first** (`cli-provider.ts`, autojob-style `claude -p --output-format json --json-schema` + `--resume` ReAct tool loop on the owner's subscription login, `GLO_CLI_MODEL` default `sonnet`) → `ANTHROPIC_API_KEY` (Messages API streaming, thinking-block echo handled) → Gemini (`GOOGLE_AI_API_KEY`, thinkingBudget 0); `GLO_PROVIDER` forces one. Routes (/api/agent + transcribe + speak) are passphrase-gated admin-only like all advanced features, with per-IP rate limiting + input caps; the widget renders only for admin sessions. Voice: Web Speech API — mic dictation auto-sends, answers optionally spoken (toggle persisted). Per-post data: new `artist_posts` table (PK artist_id+platform+post_id; lazily self-creating on first write) fed by IG recent-12 posts (web_profile_info timeline edges; hidden-like sentinel → NULL) and YT recent uploads (~2 extra quota units/artist) in `scrape_service.py`; posts never touch metric columns or snapshots. Built via ultracode: 5-subsystem map → 3 parallel worktree builders → 25-agent adversarial review (18 confirmed findings, all fixed — incl. Anthropic thinking-echo 400, cross-platform median blending, sparse-gap weekly-% overstatement) → live SSE curl verified through the CLI provider (anonymous request correctly scoped to public artists). Scheduler note: restart `scheduler.py`/gunicorn to pick up the posts pipeline. **Remote CLI bridge (same day)**: data-api `POST /agent_turn` runs one GLO model turn on the home Mac's logged-in CLI (subprocess `claude -p`, secret-guarded, 150s cap inside gunicorn's 180s timeout, `~/.local/bin` fallback for pm2's PATH), and `cli-provider.ts` gained a "remote" transport over the tunnel — provider order is now local CLI → **home-Mac CLI via tunnel** → `ANTHROPIC_API_KEY` → Gemini, so the deployed site uses the subscription too and only falls back to metered keys when the Mac is offline. Verified live against the pm2 data-api incl. `--resume` session continuity. **Voice rebuilt for phones + natural British TTS (same day)**: Web Speech recognition is Safari-only on iOS (Chrome-iOS always dies with service-not-allowed — the user's original "red dot flash"), so the mic now records via MediaRecorder with RMS silence auto-stop and transcribes through `POST /api/agent/transcribe` (Gemini; direct if the runtime has the key, else data-api `/transcribe` bridge). The voice stack is now fully local/open-source on the data-api host (Gemini free-tier daily quotas 429d under real use): STT = faster-whisper base.en int8 (offline, ~0.7s/utterance, `GLO_STT_MODEL`); TTS = Kokoro-82M ONNX (Apache-2.0, model files in gitignored data-api/models/, British female `bf_emma` default via `GLO_TTS_KOKORO_VOICE`, `GLO_TTS_SPEED`), fallbacks edge-tts (`GLO_TTS_VOICE` en-GB-SoniaNeural) then Gemini (`GLO_TTS_GEMINI_VOICE`); Vercel routes bridge to the Mac FIRST for both. Client speaks replies in sentence chunks pipelined with prefetch (first words ~2s behind text); silent-WAV unlock for iOS autoplay; Gemini keys moved to headers so logs stop capturing them. Headphones toggle = hands-free loop (listen → answer → speak → listen). Anthropic ships no speech APIs, so Gemini is ears/mouth only — the brain stays Claude-first. **Posts pipeline live**: first activation hit MySQL error 3780 — the lazily created `artist_posts` inherited TiDB's default `utf8mb4_bin` collation, incompatible with `artists.id` (`utf8mb4_unicode_ci`) for the FK; DDL now pins `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` in both schema.sql and `_POSTS_TABLE_DDL`. matt proxy's 10 recent YouTube uploads captured with likes/comments/views; GLO verified on prod citing specific videos vs per-platform medians ("DEATH BY BASS 3.0x median"). IG posts parse correctly (12 in a direct run) but repeated same-day hits soft-block `web_profile_info` onto the no-timeline fallback — rows will accrue via the spaced nightly sweep.
 - **Self-healing go_live watchdog — sleep/wake tunnel recovery (2026-08-03)**: laptop sleep kills a cloudflared quick tunnel PERMANENTLY — after wake, cloudflared retries its dead edge registration forever without exiting ("control stream encountered a failure while serving" loop), so the old `wait`-based go_live.sh never noticed and the stale URL stayed in `app_config.data_api_url` (live site stuck on the offline banner until a manual restart). `go_live.sh` now ends in a supervision loop (every `GO_LIVE_CHECK_INTERVAL`s, default 20): probes the tunnel END-TO-END through the Cloudflare edge (`$TUNNEL_URL/health`), detects wake via wall-clock jump (fast-path restart, no 3-strike wait), restarts cloudflared + republishes on failure. Also from an ultracode adversarial review (8 confirmed findings): top-level `cd $ROOT` (publish_url was cwd-sensitive), initial publish is non-fatal (watchdog retries), `start_api` reports failure instead of silently "going LIVE" with a dead API, tunnel probes are gated on local-origin health (a dead gunicorn no longer churns healthy tunnels), startup reap-waits leftover cloudflareds before truncating tunnel.log (a half-dead one punches NUL holes → BSD grep sees "binary", never extracts the URL), pidfile single-instance guard, periodic DB read-back heals external overwrites of the published row, and the watchdog restarts a dead scheduler. `scheduler.py`: the 24h `time.sleep` didn't advance during macOS system sleep (a "daily" sweep drifted to ~34h wall-clock on a nightly-sleeping laptop) — now a wall-clock-anchored 60s-tick deadline loop. Runs under pm2 as `incighder-data-api` (kill_timeout 15s); traps are pm2-aware: interruptible sleep (`sleep & wait`), INT/TERM handler exits (no watchdog-resurrects-the-tunnel-after-cleanup), cleanup kills children before the slow DB clear. Verified live: kill -9 on cloudflared → new tunnel up + republished + deployed site back online, hands-off.
 - **IG exact-count fallback for schema-broken profiles (2026-07-29)**: some business/creator profiles (brandon, daniel of glogang) permanently 400 on `web_profile_info` with an Instagram server-side schema error ("Asset asset://laser.provider/ig_business_category_subvertical has been deleted") — this was misdiagnosed at onboarding as an anonymous rate limit. The og-tag HTML fallback rounds counts for larger accounts ("26K"), and since `_maybe_snapshot` dedupes unchanged values, brandon sat at one growth point for a week. Fix in `scrapers/instagram.py`: the crawler-served profile HTML also embeds the numeric `profile_id`; the fallback now feeds it to the mobile `users/{id}/info/` endpoint (different schema, doesn't trip the bug) for exact follower/media counts + verified + HD avatar, with og tags demoted to last resort. Verified: brandon 26000 (rounded) → 25557 (exact). the Growth section's single-date rewind scrubber is replaced by a **date-range window** (`components/date-range.tsx` + `src/lib/series.ts`) — pick a From/To over real snapshot days and every chart, delta, and sparkline below scopes to it. Growth anchors on the value carried INTO the window (`deltaOver`), so a window that opens between scrapes still measures from where the count actually was. `?date=` still resolves (as the window's end); `?from=&to=` round-trips a shared/printed window. Charts gained accessibility (`role="img"`, `aria-label`, keyboard cursor, `aria-live`, a Table view so no value is hover-gated; two low-contrast platform inks — X, Spotify — darkened to clear 3:1). Print one-sheets are sized by aspect ratio at content height to stop a near-empty second page under Safari's scale-to-fit-width (verified 1.00–1.20 on Letter + A4). `components/rewind-scrubber.tsx` removed; `src/lib/rewind.ts` helpers stay.
 - **Concurrent scheduled sweep (2026-07-28)**: `scrape_all` sweeps artists `SCRAPE_SWEEP_WORKERS` at a time (default 4) instead of one-at-a-time. Safe because `throttle()` locks per HOST, not per artist — concurrent artists hitting the same site still serialize on that host's lock, so we never burst a site; we only stop leaving hosts idle between artists. Each `scrape_artist` owns its own DB connection, so nothing is shared across sweep threads. Near-linear wall-clock win as the roster grows.
@@ -755,6 +755,7 @@ Strategic frame: two complementary products. **Incighder Discover** = today's ap
 ./data-api/schema.sql
 ./data-api/link_preview.py
 ./data-api/ai_verify.py
+./data-api/models
 ./data-api/scrapeArtistData.py
 ./data-api/__pycache__
 ./data-api/flush_db.py
@@ -803,113 +804,21 @@ Strategic frame: two complementary products. **Incighder Discover** = today's ap
 
 ## 5. Recent Git Changes (Summary)
 ```text
+faa51d5 GLO voice: edge-tts neural British voice + chunked playback pipeline
+78cc28f GLO: admin-gate the agent, blackout the CLI session, batch tool rounds
 2e91901 artist_posts: pin utf8mb4_unicode_ci so the FK to artists.id creates on TiDB
 6b3bef0 GLO speaks with a natural British female voice via Gemini TTS
 c49f6d7 GLO voice rebuilt: works on phones, adds hands-free voice mode
-f67dec8 GLO: in-app voice stats agent over the roster data
-6c9238d Defend the report title against Next 15.2 streamed metadata
 ```
 
 ## 6. Active Diff
 ```diff
 diff --git a/.gitignore b/.gitignore
-index cf41a40..7687f3d 100644
+index cf41a40..386b08d 100644
 --- a/.gitignore
 +++ b/.gitignore
-@@ -147,3 +147,6 @@ __pycache__/
+@@ -147,3 +147,4 @@ __pycache__/
  .aider*
  .vercel
  .env*
-+
-+# local-only run notes
-+RUNNING.local.md
-diff --git a/ai/CONTEXT_BUNDLE.md b/ai/CONTEXT_BUNDLE.md
-index 709ad0d..7ee95b6 100644
---- a/ai/CONTEXT_BUNDLE.md
-+++ b/ai/CONTEXT_BUNDLE.md
-@@ -1,5 +1,5 @@
- # AI Context Bundle
--Generated: Thu Aug  6 15:32:29 PDT 2026
-+Generated: Thu Aug  6 15:40:02 PDT 2026
- 
- ## ⚠️ Agent Navigation Guide
- 1. Start with the **Current State** below to understand the focus.
```
