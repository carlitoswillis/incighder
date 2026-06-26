"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Check, X, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { BulkTabs } from "@/components/bulk-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DISCOVERABLE = ["youtube", "soundcloud", "instagram", "tiktok"] as const;

interface Artist {
  id: string;
  name: string;
  social_links: Record<string, string> | null;
}

type RowState = "idle" | "running" | "done" | "error";

interface RowResult {
  state: RowState;
  /** Platforms newly auto-linked by discovery. */
  discovered: string[];
  /** Platforms scraped successfully this run (excludes cached/skipped). */
  scraped: string[];
  /** Platforms left untouched because their cached data is still fresh (<24h). */
  cached: string[];
  /** Per-platform failures with the reason the scraper reported. */
  failed: { platform: string; error: string }[];
  error?: string;
}

interface RefreshResponse {
  discovered?: Record<string, string>;
  results?: Record<string, { ok?: boolean; skipped?: string; error?: string }>;
  error?: string;
}

function summarize(d: RefreshResponse): Omit<RowResult, "state"> {
  const discovered = Object.keys(d.discovered ?? {});
  const scraped: string[] = [];
  const cached: string[] = [];
  const failed: { platform: string; error: string }[] = [];
  for (const [platform, r] of Object.entries(d.results ?? {})) {
    if (r.skipped) cached.push(platform);
    else if (r.ok) scraped.push(platform);
    else failed.push({ platform, error: r.error || "failed" });
  }
  return { discovered, scraped, cached, failed };
}

export default function RefreshPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then((data: Artist[]) => {
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        setArtists(sorted);
        setSelected(new Set(sorted.map((a) => a.id)));
      })
      .catch(() => toast.error("Failed to load artists."))
      .finally(() => setLoading(false));
  }, []);

  const allSelected = selected.size === artists.length && artists.length > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(artists.map((a) => a.id)));
  }

  function missingCount(a: Artist) {
    const links = a.social_links ?? {};
    return DISCOVERABLE.filter((p) => !links[p]).length;
  }

  async function handleRun() {
    const targets = artists.filter((a) => selected.has(a.id));
    if (!targets.length) return;
    setRunning(true);
    setDone(0);
    setResults(
      Object.fromEntries(
        targets.map((a) => [
          a.id,
          { state: "running" as RowState, discovered: [], scraped: [], cached: [], failed: [] },
        ]),
      ),
    );

    let okArtists = 0;
    for (const a of targets) {
      try {
        const res = await fetch("/api/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artist_id: a.id, force: false }),
        });
        const d: RefreshResponse = await res.json();
        if (!res.ok) throw new Error(d.error || "Refresh failed");
        setResults((p) => ({ ...p, [a.id]: { state: "done", ...summarize(d) } }));
        okArtists += 1;
      } catch (e) {
        setResults((p) => ({
          ...p,
          [a.id]: {
            state: "error",
            discovered: [],
            scraped: [],
            cached: [],
            failed: [],
            error: e instanceof Error ? e.message : String(e),
          },
        }));
      }
      setDone((n) => n + 1);
    }
    setRunning(false);
    toast.success(`Refreshed ${okArtists}/${targets.length} artist${targets.length === 1 ? "" : "s"}.`);
  }

  const total = artists.filter((a) => selected.has(a.id)).length;

  return (
    <div>
      <PageHeader title="Bulk tools" />
      <BulkTabs />

      <div className="mb-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">
          Auto-discovers socials for platforms an artist isn&apos;t linked on yet
          (confident matches only), then scrapes any linked platform whose cached
          data is stale (&gt;24h) to capture fresh metrics and growth snapshots.
          Platforms with fresh cache are skipped.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-4 accent-primary"
              disabled={running || !artists.length}
            />
            Select all ({artists.length})
          </label>
          <Button onClick={handleRun} disabled={running || !total}>
            {running ? (
              <>
                <Loader2 className="animate-spin" /> Refreshing {done}/{total}…
              </>
            ) : (
              <>
                <RefreshCw /> Refresh {total} selected
              </>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading artists…</p>
      ) : (
        <div className="space-y-1.5">
          {artists.map((a) => {
            const r = results[a.id];
            const missing = missingCount(a);
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10"
              >
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                  className="size-4 accent-primary"
                  disabled={running}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {a.name}
                </span>

                {r ? (
                  <RowSummary r={r} />
                ) : missing > 0 ? (
                  <Badge variant="secondary">{missing} to discover</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">all linked</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RowSummary({ r }: { r: RowResult }) {
  if (r.state === "running")
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (r.state === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <X className="size-4" /> {r.error}
      </span>
    );

  const empty =
    !r.discovered.length &&
    !r.scraped.length &&
    !r.failed.length &&
    !r.cached.length;

  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {r.discovered.map((p) => (
          <Badge key={`d-${p}`} variant="secondary">
            +{p}
          </Badge>
        ))}
        {r.scraped.length > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Check className="size-3.5 text-primary" />
            {r.scraped.length} scraped
          </span>
        )}
        {r.cached.length > 0 && (
          <span className="text-muted-foreground">
            · {r.cached.length} cached
          </span>
        )}
        {r.failed.length > 0 && (
          <span className="text-destructive">· {r.failed.length} failed</span>
        )}
        {empty && <span className="text-muted-foreground">no change</span>}
      </div>
      {r.failed.map((f) => (
        <span
          key={`f-${f.platform}`}
          className="flex items-center gap-1 text-destructive"
          title={f.error}
        >
          <X className="size-3 shrink-0" />
          <span className="max-w-[18rem] truncate">
            {f.platform}: {f.error}
          </span>
        </span>
      ))}
    </div>
  );
}
