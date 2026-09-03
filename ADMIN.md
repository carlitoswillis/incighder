# Incighder — Admin Features

Everything in this document sits behind the admin gate and is invisible to visitors. Public/product features are in [`README.md`](README.md); deploy mechanics in [`DEPLOY.md`](DEPLOY.md).

---

## The Admin Gate

Deliberately **not a user system**: anyone presenting one of the comma-separated passphrases in `ADMIN_PASSWORDS` (one per person) at `/login` gets a signed, expiring 30-day cookie (`src/lib/auth.ts`, HMAC via `AUTH_SECRET`). All mutating routes and data-api proxies 401 without it; visitors see only `is_public = 1` artists.

- **Grant access**: add `name-<random>` to `ADMIN_PASSWORDS` in `.env` and in Vercel → redeploy.
- **Revoke**: remove the entry, redeploy. All passphrases carry identical full-admin rights.
- When real multi-user auth is needed (Manager mode), swap `passwordOk()` for a provider and keep the `isAdmin()` guards.

Admin-only UI: Discover/Manual/Bulk nav, add/edit/delete artists, sources & scraping panel, events editing, ordering arrows, CSV export, public/private toggles, group chips on home, the Knowledge page, and the GLO widget.

---

## GLO — the In-App Assistant

A floating chat/voice agent on every page (`src/components/glo/`, full-screen sheet on mobile, card on desktop). Persona: senior roster analyst — evidence → reasoning → recommendation, every number from a tool result.

- **Backend**: `POST /api/agent` (SSE stream of tool progress + text) → tool loop in `src/lib/agent/providers.ts` over the registry in `src/lib/agent/tools.ts` (17 tools: roster metrics, growth, rankings, events, posts, comparisons, knowledge, web).
- **LLM providers, in order** (`GLO_PROVIDER` forces one): local Claude Code CLI → **home Mac's CLI via the data-api tunnel** (subscription auth — the deployed site uses this; no metered API keys) → `ANTHROPIC_API_KEY` → Gemini. The remote-bridge health check is TTL-cached; per-turn context queries are memoized.
- **Voice**: mic capture with silence auto-stop → `POST /api/agent/transcribe` (faster-whisper on the Mac, Gemini fallback); replies spoken via `POST /api/agent/speak` (Kokoro/edge-tts on the Mac, Gemini fallback). Headphones toggle = hands-free loop.
- **Page context**: the widget passes the current artist/group so "how are they doing" resolves.

## The Knowledgebase

Org memory for facts, documents, links, and images (`kb_items`; UI at `/knowledge`), searchable by GLO and attachable to an artist or a roster group. Files up to 24 MB (big originals stored on the Mac, ≤4 MB inline in TiDB); PDFs/images get AI text extraction so their contents are searchable; the GLO paperclip uploads straight into it.

**The knowledge loop** (what makes GLO compound):

- **Auto-recall**: every GLO turn searches the kb for the message's distinctive terms (`src/lib/knowledge/recall.ts`) and injects the top matches into the system prompt — common recall costs zero tool round-trips.
- **Saving**: GLO saves on "remember this" *and* proactively when a durable fact surfaces; `save_link` ingests URLs with full page text.
- **No duplicate pileup**: `save_fact` detects near-duplicates and pauses; `update_knowledge_item` refines existing items (append/correct/retitle) instead of inserting again.

## MCP Server — Incighder in Claude

`POST /api/mcp` exposes the full 17-tool registry to any MCP client over streamable HTTP (`src/app/api/mcp/route.ts` — a thin wrapper over the same `tools.ts`; new tools appear in both GLO and MCP automatically). This makes the Claude apps a second, frontier-grade interface to incighder: ask Claude on your phone to rank the roster, save facts, or pull growth numbers.

**Auth**: bearer `MCP_TOKEN` (env, both local and Vercel) — an **admin-level credential** (all tools run in admin context, including writes and `refresh_artist`). Also accepted as `?token=` in the URL for clients that can't send headers (claude.ai connectors); treat such URLs as passwords and rotate the token if one leaks.

**Never inline the token in a client config.** A `?token=` URL lands in Vercel's request logs, and an inlined bearer string lands in whatever file the client stores — for Claude Code that is `~/.claude*/.claude.json`, which is backed up and synced. Keep the value in one `0600` file and reference it:

```bash
# ~/.config/incighder/mcp.env  (chmod 600) — same value as Vercel's MCP_TOKEN
MCP_TOKEN=...
INCIGHDER_TOKEN=...
```

Source that from `~/.zshenv` (not `.zshrc`, so non-interactive shells get it too), then let configs use `${INCIGHDER_TOKEN}` — both Claude Code's `.claude.json` and `workspace/assistant/mcp.json` expand it at load.

**To rotate**: generate a new value into that file, set `MCP_TOKEN` in the Vercel project (Settings → Environment Variables, Production) and **redeploy** — it is read at request time by `src/app/api/mcp/route.ts`, but a redeploy is what picks up the new value. Update the repo-root `.env` for local dev, and re-add any claude.ai custom connector, whose `?token=` URL embeds the old value.

**Connect**:

```bash
# Claude Code (any machine)
claude mcp add --transport http --scope user incighder \
  https://incighder.vercel.app/api/mcp \
  --header "Authorization: Bearer $MCP_TOKEN"
```

- **claude.ai / Claude mobile & desktop chat apps**: Settings → Connectors → Add custom connector with `https://incighder.vercel.app/api/mcp?token=<MCP_TOKEN>` — syncs to all chat surfaces including the phone.
- `refresh_artist` can run ~2 min; the route sets `maxDuration = 120`, and Claude Code clients may want `MCP_TOOL_TIMEOUT=180000`.

---

## Ops Notes

- **Live scraping from the Mac**: `./go_live.sh` — self-healing (sleep/wake tunnel recovery, watchdog, pm2-aware); publishes the tunnel URL to `app_config` so no redeploy is needed.
- **Deploys**: Vercel CLI (`npx vercel deploy --prod`). Env vars live in Vercel project settings: `DATABASE_URL`, `ADMIN_PASSWORDS`, `AUTH_SECRET`, `MCP_TOKEN`, `DATA_API_SECRET`, plus the scraper keys.
- **Secrets hygiene**: `.env` is gitignored and has never been committed; source only references `process.env.*`. `MCP_TOKEN` lives in `~/.config/incighder/mcp.env` (0600) and is referenced, never inlined, by MCP client configs. The data-api requires `X-Data-Api-Secret` on everything but `/health`.
- **Scheduler/data-api don't hot-reload scrape code** — restart after editing (gunicorn runs `--reload` for app code in dev).
