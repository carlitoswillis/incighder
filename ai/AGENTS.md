# Agent Guidelines (AGENTS.md)

PURPOSE: This is the authoritative rulebook for AI assistants. It defines the 'how' and 'what' of the Incighder codebase.

## Project Context
- **Objective**: Build a data application for A&Rs/Labels to track artist audience traction — plus GLO, the in-app agent that analyzes it and remembers things (knowledgebase).
- **Stack**: Next.js (TypeScript, Tailwind) flat at the repo root, Python `data-api` on the home Mac, **TiDB Serverless in prod** (`DATABASE_URL`; local MySQL 8.4 for offline dev). **No Docker** — runs natively. Live on Vercel (incighder.vercel.app), deployed via the Vercel CLI.

## Architecture Constraints
- **Flat app, native run**: The Next.js app lives at the repo root (run `npm` there, not a subdir). Bring up the full stack with **`./start_dev.sh`** (MySQL + venv gunicorn data-api on :5050 + `npm run dev` on :3000). No Docker.
- **Two halves, collapsing**: Native TS routes own DB access (`mysql2`) and Spotify search; the rest still proxy to the Python `data-api` via `DATA_API_URL` (`src/lib/data-api.ts`). Direction: keep porting API-call endpoints into TS so the app stays flat/Vercel-deployable. See `ARCHITECTURE.md` for the route map.
- **Database**: MySQL is the source of truth (local 8.4 or a hosted MySQL via `DATABASE_URL` — see `DEPLOY.md`). `data-api/schema.sql` (MySQL DDL) is the master schema; apply it via `./.venv/bin/python apply_schema.py` from `data-api/` — **idempotent** (`CREATE TABLE IF NOT EXISTS`), safe on every boot. A destructive rebuild requires `--reset` + typed confirmation; NEVER call `--reset` from scripts. `mysql2` (Node) / `PyMySQL` (Python); `?` placeholders, no `RETURNING`. DB config is centralized: `src/lib/db.ts` (`getPool()`), `scripts/db-config.mjs`, and `_db_config()` in `data-api/scrapeArtistData.py` — never hand-roll a new pool/connection config.
- **Browser-free scraping**: No Playwright/Chromium. All scrapers are HTTP. Spotify monthly listeners renders via the **scrape.do** API (`SCRAPE_DO_TOKEN`); Instagram uses the `IG_SESSIONID` cookie. AI verification uses **Google Gemini** (`gemini-2.5-flash`, `GOOGLE_AI_API_KEY`).
- **Best-Effort Scraping**: Scrapers are isolated and partial-by-design; one platform failing must never block the others. Respect the 24h cache TTL.
- **LLM policy — subscription CLI first, never metered keys**: GLO and knowledge extraction run on the owner's logged-in Claude Code CLI (locally, or the home Mac's via the data-api `/agent_turn` bridge). There are no paid API keys; do not add flows that require them. Gemini (free tier) is fallback + voice only.
- **One tool registry**: agent capabilities live in `src/lib/agent/tools.ts` ({name, description, inputSchema, label, run(args, {admin})}). Register there and the tool exists in BOTH GLO and the MCP endpoint (`/api/mcp`). Enforce admin gating inside `run()` via `ctx.admin`; all arithmetic happens in the tool, never in the model.
- **Admin/visitor split**: advanced features (GLO, knowledge, mutations, MCP) are passphrase-gated (`src/lib/auth.ts` `isAdmin()`); visitors see only `is_public = 1` artists — private artists must behave as nonexistent. Document admin-only features in `ADMIN.md`, not `README.md`.
- **Secrets**: `.env` is gitignored — never commit secret values or echo them into tracked files. `MCP_TOKEN` and `ADMIN_PASSWORDS` entries are admin credentials.
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
5. **Feature docs**: `README.md` (public/product), `ADMIN.md` (admin-only: auth, GLO, knowledgebase, MCP), `DEPLOY.md` (go-live mechanics). Update the relevant `ai/*.md` and feature docs after completing work.
