"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, Search, Check, X, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { BulkTabs } from "@/components/bulk-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCompact } from "@/lib/format";

interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
  popularity: number;
  followers: { total: number };
  external_urls: { spotify: string };
}

type RowStatus = "matched" | "nomatch" | "tracked";

interface ReviewRow {
  /** The raw name the user pasted. */
  query: string;
  candidates: SpotifyArtist[];
  selected: number;
  status: RowStatus;
  /** Excluded from the batch insert. Defaults true for tracked/nomatch rows. */
  skip: boolean;
  /** Set once the row has been inserted. */
  added: boolean;
}

function parseNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const name = line.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Spotify-API-backed steps; a handful of in-flight requests is plenty and avoids
// hammering the data-api. Insert is lighter than search, so it gets a smaller pool.
const RESOLVE_CONCURRENCY = 5;
const ADD_CONCURRENCY = 4;

/** Run `fn` over `items` with at most `limit` in flight; results stay in order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export default function BulkImportPage() {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [adding, setAdding] = useState(false);

  const names = useMemo(() => parseNames(raw), [raw]);

  const confirmable = rows.filter(
    (r) => r.status === "matched" && !r.skip && !r.added,
  ).length;

  async function handleResolve() {
    if (!names.length) return;
    setResolving(true);
    setRows([]);
    setProgress({ done: 0, total: names.length });

    // Pull the current dataset once so we can flag already-tracked matches.
    let trackedIds = new Set<string>();
    try {
      const r = await fetch("/api/artists");
      if (r.ok) {
        const data = await r.json();
        trackedIds = new Set(
          (data as { spotify_id: string | null }[])
            .map((a) => a.spotify_id)
            .filter((id): id is string => Boolean(id)),
        );
      }
    } catch {
      // Non-fatal: worst case we don't pre-flag tracked artists.
    }

    // These hit the Spotify Web API (not the throttled scrapers), so resolve them
    // with bounded concurrency rather than one-at-a-time. Results stay positionally
    // ordered; progress ticks as each finishes.
    async function resolveOne(query: string): Promise<ReviewRow> {
      let candidates: SpotifyArtist[] = [];
      try {
        const r = await fetch(`/api/spotify-search?q=${encodeURIComponent(query)}`);
        if (r.ok) {
          const d = await r.json();
          candidates = (d.artists?.items ?? []).slice(0, 6);
        }
      } catch {
        // Leave candidates empty → row flagged as no-match.
      }
      const top = candidates[0];
      const status: RowStatus = !top
        ? "nomatch"
        : trackedIds.has(top.id)
          ? "tracked"
          : "matched";
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      return { query, candidates, selected: 0, status, skip: status !== "matched", added: false };
    }

    const resolved = await mapWithConcurrency(names, RESOLVE_CONCURRENCY, resolveOne);
    setRows(resolved);
    setResolving(false);
  }

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }

  function selectCandidate(idx: number, candIdx: number) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, selected: candIdx } : r)),
    );
  }

  async function handleAddAll() {
    const targets = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.status === "matched" && !r.skip && !r.added);
    if (!targets.length) return;
    setAdding(true);
    let ok = 0;
    let failed = 0;
    await mapWithConcurrency(targets, ADD_CONCURRENCY, async ({ r, i }) => {
      const artist = r.candidates[r.selected];
      try {
        const res = await fetch("/api/artists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(artist),
        });
        if (!res.ok) throw new Error(await res.text());
        updateRow(i, { added: true });
        ok += 1;
      } catch {
        failed += 1;
      }
    });
    setAdding(false);
    if (ok) toast.success(`Added ${ok} artist${ok === 1 ? "" : "s"}.`);
    if (failed) toast.error(`${failed} failed to add.`);
  }

  return (
    <div>
      <PageHeader title="Bulk tools" />
      <BulkTabs />

      <div className="space-y-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <label htmlFor="names" className="text-sm font-medium">
          Paste artist names — one per line
        </label>
        <textarea
          id="names"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder={"BKTHERULA\nKenny Mason\nRedveil"}
          className="w-full resize-y rounded-lg bg-background px-3 py-2 text-sm ring-1 ring-foreground/15 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {names.length
              ? `${names.length} unique name${names.length === 1 ? "" : "s"}`
              : "Each line becomes one artist to verify."}
          </span>
          <Button onClick={handleResolve} disabled={!names.length || resolving}>
            <Search />
            {resolving
              ? `Resolving ${progress.done}/${progress.total}…`
              : "Resolve"}
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Review matches
            </h2>
            <Button onClick={handleAddAll} disabled={!confirmable || adding}>
              <Plus />
              {adding ? "Adding…" : `Add ${confirmable} confirmed`}
            </Button>
          </div>

          <div className="space-y-2">
            {rows.map((row, idx) => (
              <ReviewRowCard
                key={row.query}
                row={row}
                onToggleSkip={() => updateRow(idx, { skip: !row.skip })}
                onSelect={(c) => selectCandidate(idx, c)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRowCard({
  row,
  onToggleSkip,
  onSelect,
}: {
  row: ReviewRow;
  onToggleSkip: () => void;
  onSelect: (candIdx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const cand = row.candidates[row.selected];
  const dimmed = row.skip || row.status !== "matched";

  return (
    <div
      className={`rounded-xl bg-card p-3 ring-1 ring-foreground/10 ${dimmed ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3">
        {cand?.images?.[0]?.url ? (
          <Image
            src={cand.images[0].url}
            alt={cand.name}
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="size-12 shrink-0 rounded-lg bg-secondary" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {cand?.name ?? row.query}
            </span>
            {row.added ? (
              <Badge variant="secondary">Added ✓</Badge>
            ) : row.status === "nomatch" ? (
              <Badge variant="secondary">No match</Badge>
            ) : row.status === "tracked" ? (
              <Badge variant="secondary">Already tracked</Badge>
            ) : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {cand ? (
              <>
                {formatCompact(cand.followers.total)} followers · pop{" "}
                {cand.popularity}
                {cand.genres?.length ? ` · ${cand.genres.slice(0, 2).join(", ")}` : ""}
              </>
            ) : (
              <>queried “{row.query}”</>
            )}
          </div>
        </div>

        {row.status === "matched" && !row.added && (
          <div className="flex items-center gap-1">
            {row.candidates.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen((o) => !o)}
              >
                <ChevronRight
                  className={`transition-transform ${open ? "rotate-90" : ""}`}
                />
                Change
              </Button>
            )}
            <Button
              variant={row.skip ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={row.skip ? "Include" : "Skip"}
              onClick={onToggleSkip}
            >
              {row.skip ? <Check /> : <X />}
            </Button>
          </div>
        )}
      </div>

      {open && row.candidates.length > 1 && (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
          {row.candidates.map((c, ci) => (
            <button
              key={c.id}
              onClick={() => {
                onSelect(ci);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary/50 ${
                ci === row.selected ? "bg-secondary/40" : ""
              }`}
            >
              {c.images?.[0]?.url ? (
                <Image
                  src={c.images[0].url}
                  alt={c.name}
                  width={28}
                  height={28}
                  className="size-7 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="size-7 shrink-0 rounded bg-secondary" />
              )}
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatCompact(c.followers.total)}
              </span>
              {ci === row.selected && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
