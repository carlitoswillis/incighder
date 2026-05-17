# Agent Guidelines (AGENTS.md)

PURPOSE: This is the authoritative rulebook for AI assistants. It defines the 'how' and 'what' of the Incighder codebase.

## Project Context
- **Objective**: Build a data application for A&Rs/Labels to track artist audience traction.
- **Stack**: Next.js (TypeScript, Tailwind), Python (Data API), PostgreSQL, Docker.

## Architecture Constraints
- **Dual-API Structure**: The Next.js frontend calls Next.js API routes, which in turn communicate with the Python `data-api` service.
- **Docker-First**: All services run in Docker. Use the provided `./start_*.sh` scripts for development.
- **Database**: PostgreSQL is the source of truth. Schema changes must be applied via `data-api/apply_schema.py`.
- **Local-First**: Prioritize local inference and development.
- **Markdown Persistence**: All state must be tracked in `ai/*.md`.

## Coding Conventions
- **Explicit over Implicit**: Avoid hidden logic, reflection, or complex inheritance.
- **Verification First**: All changes must be verified via tests ideally
- **Compact Context**: Keep context files task-scoped and minimal.
- **TypeScript**: Ensure strict typing in the Next.js frontend.
- **Python**: Use idiomatic Python for the `data-api`.

## How to Navigate This Workspace (Priority Flow)
To minimize token waste and maximize focus, follow this priority sequence:
1. **START HERE**: Read `ai/PROJECT_STATE.md`. It defines the current high-level objective
2. **Operational Rules**: Read `AGENTS.md` (this file). Adhere strictly to these constraints.
3. **Task Details**: Read tasks in`PROJECT_STATE` to see the specific backlog and active items.
4. **Self-Correction**: If you feel your understanding of the project state is out of sync, you may run `./ai-context.sh` to refresh your local context bundle.
