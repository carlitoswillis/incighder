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
- [ ] Phase 3: DuckDuckGo auto-discovery of profile links

## Backlog
- [ ] Phase 4: display metrics across card/table/detail; freshness indicators
- [ ] Implement historical data tracking for followers

## Completed
- [x] Scraping Phase 0-2: framework + Spotify/YouTube/SoundCloud/Instagram/TikTok scrapers, `/scrape`, UI panel, manual X (verified live)
- [x] Implement artist editing functionality (PATCH requests)
- [x] Enable navigation to new artist page
- [x] Add navigation bar
- [x] QA/UX testing for artist editing workflow
- [x] Refine error handling for PATCH submissions
- [x] Codebase cleanup (linting fixes in API routes)
- [x] Decouple database schema (spotify_id made nullable)
- [x] Implement `POST /insert_artist_manual` backend endpoint
- [x] Consolidate `schema.sql` to `data-api/`
