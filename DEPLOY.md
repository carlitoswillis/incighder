# Deploying Incighder

Architecture for a free deploy:

- **Vercel** — hosts the Next.js app (repo root). Already connected via the
  GitHub integration; pushes to `main` deploy automatically.
- **Free hosted MySQL** — the shared source of truth, e.g. **TiDB Cloud
  Serverless** (5 GiB free, MySQL-compatible, no card) or **Aiven free MySQL**.
  Because it lives outside your machine, no local restart/reset can ever wipe it.
- **data-api (Flask)** — runs on your Mac, writing to the same hosted DB.
  (Residential IP also scrapes more reliably than a datacenter host.)

## Making the deployed site's live features work: `./go_live.sh`

The deployed site reads/edits artists via the DB on its own. Scrape / refresh /
discover need the data-api, which lives on your Mac. One command turns them on:

```bash
./go_live.sh     # Ctrl-C to go offline cleanly
```

It starts the data-api (if not already running), opens a cloudflared quick
tunnel, and **publishes the tunnel URL into `app_config.data_api_url` in the
shared DB** — the deployed frontend looks it up there (30s cache), so a new
tunnel URL needs **no Vercel redeploy**. On Ctrl-C it clears the URL and stops
both processes. While offline, the site shows an amber "live scraping is
offline" banner (driven by `/api/data-api-status` → data-api `/health`) but
browsing/editing keeps working.

## One-time setup

1. **Create the database** — sign up at tidbcloud.com (or aiven.io), create a
   free MySQL-compatible cluster/service, create a database named `incighder`,
   and copy the connection details.

2. **Set `DATABASE_URL` in `.env`** (see `.env.example`):

   ```
   DATABASE_URL=mysql://USER:PASSWORD@HOST:4000/incighder?sslmode=require
   ```

3. **Create the schema + seed it** from the committed snapshot:

   ```bash
   cd data-api && ./.venv/bin/python apply_schema.py && cd ..
   node scripts/import-artists.mjs
   ```

   `apply_schema.py` is idempotent (CREATE TABLE IF NOT EXISTS) — safe to run
   any time. A destructive rebuild requires an explicit
   `python apply_schema.py --reset` and a typed confirmation.

4. **Set Vercel env vars** (Project → Settings → Environment Variables):
   - `DATABASE_URL` — same value as above (required for live data)
   - (`DATA_API_URL` is NOT needed — the deployed site discovers the data-api
     through the DB; see `./go_live.sh` above. Setting it would pin a stale URL.)

5. **Push `main`** — Vercel builds and deploys.

Without `DATABASE_URL` set in Vercel, the deployed site still works read-only
from `src/data/artists-fallback.json` (refresh it with `npm run artists:export`).

## Ports (local)

Everything is env-driven — no hardcoded ports:

```bash
DATA_API_PORT=8080 WEB_PORT=4000 ./start_dev.sh
```
