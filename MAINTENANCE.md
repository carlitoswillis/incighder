# Maintenance

Known-but-unfixed issues, and a dated log of housekeeping passes. What each pass
*changed* is in the commit log; this file records what it deliberately left
alone, so the next pass doesn't rediscover the same things.

## Open items

**`go_live.sh` runs gunicorn with `--reload` in production** (`go_live.sh:80`).
The comment there explains the intent — this process serves the deployed site
for hours while code is still being edited, and a worker running yesterday's
code fails silently. But it is a development flag on a process reachable from
the public internet through the tunnel, and gunicorn says so on every boot
("Reloader is on. Use in development only!"). Either drop it and `kill -HUP` the
master when code changes, or split a prod path in `start_api`.

**The quick tunnel is the only network boundary.** `cloudflared tunnel --url`
publishes a fresh `trycloudflare.com` hostname on every restart, so the URL is
unguessable but the endpoint is otherwise open to the internet, gated only by
the `X-Data-Api-Secret` header. A named tunnel with Cloudflare Access, or an IP
allowlist for Vercel's egress, would put an actual boundary in front of it.

**`MCP_TOKEN` is all-or-nothing.** `/api/mcp` runs every one of the 17 tools with
`{ admin: true }`, including `save_fact`, `save_link`, `update_knowledge_item`
and `refresh_artist`. The registry already threads `ctx.admin` per tool, so a
second read-only token — or a per-token tool allowlist — is a small change, and
would mean the phone connector could not write. See ADMIN.md for how the token
itself should be stored.

**`/search_spotify` is snake_case** and everything else routes kebab-case.
Renaming it to `/spotify-search` means updating three link sites:
`src/components/app-shell.tsx:124`, `src/components/artist-grid.tsx:143`,
`src/app/artists/add/page.tsx:60`.

**`ai/` is agent-state prose in a public tree** — 100 KB across 6 files, of which
`PROJECT_STATE.md` is 37 KB and `DESIGN_OVERHAUL_PLAN.md` (June) is 19 KB.
`ARCHITECTURE.md` and `SCRAPING_PLAN.md` are referenced from code comments and
earn their place; the rest is scratch. Worth trimming or moving out of the repo.

**There is no test suite** — no test script in `package.json`, no test files.
`npx tsc --noEmit` and `npx next lint` are the only automated checks, and both
pass. The scrapers and `src/lib/agent/tools.ts` are where this hurts most.

**Local remote-tracking refs go stale.** `git branch -a` has repeatedly shown
branches that no longer exist on GitHub. Check against the remote itself
(`gh api repos/<owner>/<repo>/branches --jq '.[].name'`) or run
`git fetch --prune` before concluding anything about branch state.

## 2026-09-02 — hygiene pass

Commits `3edad6c`…`3f8e824`. Fixed: the repo-local placeholder git identity that
authored 117 commits (plus a `.mailmap`); `MCP_TOKEN` rotation and storage;
fail-closed auth, rate limiting and CLI tool restrictions on the three data-api
routes that spawn Claude Code; per-platform partial/failure reporting in the
nightly sweep summary; two stale tracked scratch files. Each commit message has
the detail.

Two things checked and deliberately not changed: a scheduled OpenWiki GitHub
Action was drafted but never committed and was deleted rather than adopted (it
would have put a `CLAUDE_CLI_SESSION` credential and two LangSmith keys in a
public repo's Actions secrets, and OpenWiki runs locally here); and the eleven
"stale branches" flagged for deletion turned out to already be gone from the
remote — only `main` and `claude/one-page-report-feature-3tge9z` exist, and the
latter's one commit is content main already carries.
