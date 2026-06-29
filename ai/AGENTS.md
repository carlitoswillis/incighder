# Agent Guidelines (AGENTS.md)

PURPOSE: This is the authoritative rulebook for AI assistants. It defines the 'how' and 'what' of the Incighder codebase.

## Project Context
- **Objective**: Build a data application for A&Rs/Labels to track artist audience traction.
- **Stack**: Next.js (TypeScript, Tailwind) flat at the repo root, Python `data-api`, MySQL 8.4. **No Docker** — runs natively. Targets a flat Vercel deploy.

## Architecture Constraints
- **Flat app, native run**: The Next.js app lives at the repo root (run `npm` there, not a subdir). Bring up the full stack with **`./start_dev.sh`** (MySQL + venv gunicorn data-api on :5050 + `npm run dev` on :3000). No Docker.
- **Two halves, collapsing**: Native TS routes own DB access (`mysql2`) and Spotify search; the rest still proxy to the Python `data-api` via `DATA_API_URL` (`src/lib/data-api.ts`). Direction: keep porting API-call endpoints into TS so the app stays flat/Vercel-deployable. See `ARCHITECTURE.md` for the route map.
- **Database**: MySQL 8.4 is the source of truth. `data-api/schema.sql` (MySQL DDL) is the master schema; apply it via `./.venv/bin/python apply_schema.py` from `data-api/` (drop-and-recreate). `mysql2` (Node) / `PyMySQL` (Python); `?` placeholders, no `RETURNING`.
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
