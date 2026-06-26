# Agent Guidelines (AGENTS.md)

PURPOSE: This is the authoritative rulebook for AI assistants. It defines the 'how' and 'what' of the Incighder codebase.

## Project Context
- **Objective**: Build a data application for A&Rs/Labels to track artist audience traction.
- **Stack**: Next.js (TypeScript, Tailwind), Python (Data API), PostgreSQL, Docker.

## Architecture Constraints
- **Dual-API Structure**: The Next.js frontend calls Next.js API routes, which in turn communicate with the Python `data-api` service. See `ARCHITECTURE.md` for the route map.
- **Docker-First**: All services run in Docker. Prefer `docker compose up --build`; the root `./start_*.sh` scripts are convenience wrappers.
- **Database**: PostgreSQL is the source of truth. `data-api/schema.sql` is the master schema; apply it via `docker compose run --rm data-api python apply_schema.py`.
- **Local-First & Free AI**: Prioritize local inference and development. AI verification uses local Ollama only — no paid AI APIs.
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
