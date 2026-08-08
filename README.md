# Incighder

Incighder is a roster-intelligence platform for artist managers, A&Rs, and labels: it aggregates public metrics from the key music and social platforms, tracks how they move over time, and turns them into growth analytics, traction scores, and shareable reports. Live at **[incighder.vercel.app](https://incighder.vercel.app)**.

Visitors browse the public roster read-only. The advanced surface — the GLO assistant, the knowledgebase, scraping controls, and the MCP endpoint — is admin-only and documented separately in **[`ADMIN.md`](ADMIN.md)**.

---

## Key Features

- **Multi-Platform Metric Harvesting**:
  - **Spotify**: followers, popularity, genres, top tracks (Web API), plus monthly listeners (via the scrape.do render API — the one JS-gated metric).
  - **YouTube**: subscribers, lifetime views, video counts, top video (YouTube Data API v3), plus recent uploads with per-video views/likes/comments.
  - **Instagram**: followers, post counts, verified status, and recent-post engagement — with an exact-count fallback for schema-broken business profiles.
  - **TikTok**: followers, total likes, video counts.
  - **SoundCloud**: followers, track counts, top track plays.
  - **Twitch**: followers (keyless web GQL).
  - **X (Twitter)**: manual follower entry (login wall).
- **Anti-Ban Scraping Architecture**: strict 24h per-platform cache TTL, per-host throttling with jitter, realistic headers, automatic backoffs, HTTP-only (no headless browser), and graceful per-platform degradation — one platform failing never blocks the rest. Partial scrapes are retried instead of losing a day.
- **Artist Discovery** (`/discover`): seed an artist, get similar artists (Last.fm `getSimilar`) enriched with Spotify/Last.fm metrics; one-click "Track" ingests any of them.
- **Auto-Discovery & AI Verification**: finds official YouTube/SoundCloud/Instagram/TikTok profiles by search (Google Programmable Search), then AI-verifies each candidate (Gemini) before auto-filling — with one-click alternates.
- **Historical Growth Analytics**:
  - Account-keyed metric snapshots on every scrape; a background scheduler sweeps the roster nightly (concurrent, TTL-respecting).
  - **Windowed growth**: pick a From/To range and every chart, delta, and sparkline scopes to it; prior-window comparison shows acceleration vs deceleration.
  - **Cross-platform traction score** (0–100) with weekly momentum.
  - Post-level analytics: per-platform engagement medians and outlier detection (posts performing at a multiple of the artist's median).
- **Events & Attribution**: track releases, shows, videos, and posts (attachable to multiple artists) with before/after audience impact in a 14-day window — framed honestly as correlation.
- **Reports**: print/PDF-ready per-artist and per-group traction reports (masthead, ledger with deltas + sparklines, footprint), viewable as of any snapshot day and shareable by URL.
- **Roster Groups**: artists can be grouped (e.g. a label's sub-roster) with their own `/g/<group>` pages and group-scoped reports; grouped artists stay off the main list.
- **Public/Private Curation**: each artist is individually toggleable; visitors only ever see public artists.

---

## Technical Stack

- **Frontend**: Next.js 15 (App Router, React 19, TypeScript, Tailwind CSS, shadcn-style components) — a **flat app at the repo root**, deployed on **Vercel**.
- **Backend Orchestrator**: Next.js API routes. DB access, Spotify search, history, and the agent/knowledge surfaces are **native TypeScript** (`mysql2`); scraping/discovery endpoints proxy to the Python service.
- **Data API Service**: Python (Flask + gunicorn on :5050) — scraping, discovery, AI verification, and local voice/LLM bridges. Runs on a home Mac (residential IP scrapes more reliably); reached from the deployed site through a self-healing cloudflared tunnel (`./go_live.sh`).
- **Database**: **TiDB Cloud Serverless** (MySQL-compatible) in production via a single `DATABASE_URL`; local MySQL 8.4 works for offline dev. Tables: `artists`, `metric_snapshots`, `artist_posts`, `events`, `kb_items`, `app_config`.
- **AI**: Google Gemini (`gemini-2.5-flash`) verifies discovered profiles. The GLO assistant and knowledge extraction run Claude-first — see `ADMIN.md`.
- **Run**: native, **no Docker** (`./start_dev.sh`).

---

## System Architecture

```mermaid
graph TD
    Browser[Client Browser] -->|HTTP / JSON| NextJS[Next.js App - Vercel, repo root]
    NextJS -->|mysql2| DB[(TiDB Serverless / MySQL)]
    NextJS -->|Spotify Web API| SpotifySearch[Spotify search - native TS]
    NextJS -->|tunnel URL from app_config| Flask[Flask data-api on the home Mac :5050]
    Flask -->|PyMySQL| DB

    subgraph Scrapers [Python Scrapers - HTTP only]
        Flask --> Spotipy[Spotify Web API]
        Flask --> ScrapeDo[scrape.do render - monthly listeners]
        Flask --> YouTubeAPI[YouTube Data API v3]
        Flask --> Requests[SoundCloud / IG / TikTok / Twitch HTTP]
    end

    Flask -->|Verify profile| Gemini[Google Gemini 2.5 Flash]
```

The deployed site reads and edits the shared DB on its own; scrape/refresh/discover need the home data-api, discovered dynamically through the DB (`./go_live.sh` publishes the tunnel URL — no redeploy needed). When the Mac is offline the site shows an amber banner and keeps working read/write.

---

## Setup and Running

### Prerequisites (macOS, native — no Docker)

- Node 18+ and Python 3.12 (`brew install python@3.12`)
- Optional for offline dev: local MySQL (`brew install mysql@8.4`) — skipped when `DATABASE_URL` points at a hosted DB

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and fill in what you have. The core public-feature vars:

```env
# Database — hosted MySQL (TiDB Serverless) or local
DATABASE_URL=mysql://USER:PASSWORD@HOST:4000/incighder?sslmode=require

# Spotify API (search & metadata)
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# YouTube Data API (YouTube scraping & discovery)
YOUTUBE_API_KEY=...

# Last.fm (discover / similar artists / bios)
LAST_FM_API_KEY=...

# Google Gemini (AI-verified discovery)
GOOGLE_AI_API_KEY=...

# scrape.do render API (Spotify monthly listeners)
SCRAPE_DO_TOKEN=...

# Optional: IG_SESSIONID, GOOGLE_CSE_KEY/GOOGLE_CSE_ID (search-backed discovery),
# SCRAPE_THROTTLE_MIN/MAX, AUTO_SCRAPE_INTERVAL_HOURS, DATA_API_PORT, WEB_PORT
```

Auth, GLO, and MCP env vars are covered in [`ADMIN.md`](ADMIN.md).

### 2. Run

```bash
./start_dev.sh    # data-api (:5050) + frontend (:3000); local MySQL only if no DATABASE_URL
```

First run creates the Python venv, installs deps, and applies the schema (idempotent — `apply_schema.py` never drops data; destructive resets require `--reset` plus typed confirmation).

Pieces individually: `npm run dev` (frontend), venv gunicorn in `data-api/` (API), `./.venv/bin/python scheduler.py` (nightly sweep). For serving the live site's scraping from your Mac: `./go_live.sh` (see `DEPLOY.md`).

---

## Usage Guide

- **Home (`/`)**: cards for all tracked (ungrouped) artists — key metrics, traction score, sparklines.
- **Table (`/table`)**: sortable spreadsheet view of every platform metric side by side.
- **Groups (`/g/<group>`)**: a group's own roster page and report.
- **Discover (`/discover`)**: similar-artist scouting with one-click tracking.
- **Artist Detail (`/artists/[id]`)**: stat grids, windowed growth charts with accessible table view, events with impact, post-level outliers, bio, and (admin) the sources/scraping control panel.
- **Reports (`/artists/[id]/report`, `/g/<group>/report`)**: print-ready traction one-sheets, rewindable to any snapshot date.

Everything mutating — adding, editing, scraping, events, exports — is behind the admin gate: see **[`ADMIN.md`](ADMIN.md)**.

---

## Roadmap

- Change/threshold alerts (notify when a metric jumps or stalls)
- Playlist and chart tracking
- Discovery seeded from a tracked artist's audience graph
- Manager mode: real multi-user auth replacing the passphrase gate
