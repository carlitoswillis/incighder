# Incighder Architecture

PURPOSE: Technical system design and data flow of the Incighder application.

## Overview
Incighder is a multi-service data application designed to aggregate and visualize artist audience metrics from various music and social platforms.

## System Components

### 1. Frontend (Next.js)
- **Role**: User interface and primary application logic.
- **Framework**: Next.js with TypeScript and Tailwind CSS.
- **API Routes**: Next.js API routes act as a proxy/orchestrator, calling the specialized `data-api`.

### 2. Data API (Python)
- **Role**: Specialized service for data ingestion, search, and transformation.
- **Framework**: Python with Flask/FastAPI (or similar) using `spotipy` for Spotify and `psycopg2` for PostgreSQL.
- **Isolation**: Handles heavy data lifting and external API interactions to keep the frontend lean.

### 3. Database (PostgreSQL)
- **Role**: The source of truth for all artist metrics and historical data.
- **Master Schema**: Located at `data-api/schema.sql`. This is the **single source of truth**. 
- **Application**: Schema changes must be applied via `data-api/apply_schema.py` inside the Docker container.

### 4. Infrastructure (Docker)
- **Role**: Service orchestration and environment parity.
- **Services**: `db`, `data-api`, and `incighder-dev` (Next.js).

## Data Flow
1. **Search**: User triggers search in Next.js -> API Route -> `data-api` (Python) -> Spotify/YouTube APIs.
2. **Ingestion**: `data-api` transforms raw API data and inserts it into PostgreSQL.
3. **Display**: Next.js fetches structured data from the `db` via API routes and renders the dashboard.

## AI Workspace Substrate
This repository uses an AI-assisted engineering substrate located in `.ai/` and `scripts/`.
- **Cognition Layer**: State and tasks are tracked in `.ai/`.
- **Rules**: Agent constraints are defined in `AGENTS.md`.
- **Flow**: Human Pilot -> AI Implementation -> Deterministic Verification (`scripts/verify.sh`).
