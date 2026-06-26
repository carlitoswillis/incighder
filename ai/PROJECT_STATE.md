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
- [ ] Change/threshold alerts (notify when a metric jumps X%) — `metric_snapshots` is the foundation; pairs with scheduled auto-scrape. Closes a gap vs competitors (see `COMPETITORS.md`)
- [ ] Playlist / chart-placement tracking — competitor table-stakes we lack (see `COMPETITORS.md`)

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
