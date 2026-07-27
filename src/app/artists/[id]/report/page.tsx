"use client";

import { use, useEffect, useMemo, useState } from "react";
import { ArtistImage } from "@/components/artist-image";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import type { Artist } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { calculateArtistScore } from "@/utils/score";
import { formatCompact, formatFull } from "@/lib/format";
import { dayEnd, rewindArtist, snapshotDays, valueAsOf } from "@/lib/rewind";
import {
  RewindScrubber,
  formatDay,
  useRewindDay,
} from "@/components/rewind-scrubber";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportPaper } from "@/components/report-paper";
import { cn } from "@/lib/utils";

type HistoryEntry = {
  points: { t: string; v: number }[];
  current: number;
  first: number;
  change: number;
  since: string;
};

// Print/PDF-ready one-sheet: the whole traction story on a single page.
// ReportPaper is a fixed, page-sized box and nothing here is scaled to fit,
// so the sheet is laid out to stay inside it.
// Screen keeps the site's dark identity; @media print flips to the light
// tokens (globals.css) so it reads like a document, not a screenshot.
// The rewind scrubber (and ?date=) replays the sheet as of any snapshot day.
export default function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryEntry>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/artists/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setArtist)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    fetch(`/api/history?artist_id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory({}));
  }, [id]);

  const days = useMemo(
    () => snapshotDays(Object.values(history).map((e) => e.points ?? [])),
    [history],
  );
  const { ticks, dayIdx, select, asOfDay } = useRewindDay(days);
  const asOfEnd = asOfDay ? dayEnd(asOfDay) : null;

  if (error) return <p className="text-sm text-destructive">Not available.</p>;
  if (!artist)
    return (
      <div className="mx-auto w-full max-w-[696px] space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );

  const image = artist.images?.[0]?.url ?? null;
  const genres = (artist.genres ?? "").replace(/[[\]"']/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  const { score } = calculateArtistScore(
    asOfEnd ? rewindArtist(artist, history, asOfEnd) : artist,
  );
  const tracked = PLATFORMS.filter(
    (p) => history[p.key] || (artist[p.metric.field as keyof Artist] ?? null) !== null,
  );
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const footprint = [
    { label: "IG posts", v: artist.instagram_posts },
    { label: "TikTok videos", v: artist.tiktok_video_count },
    { label: "TikTok likes", v: artist.tiktok_likes },
    { label: "YT videos", v: artist.youtube_video_count },
    { label: "YT total views", v: artist.youtube_total_views },
    { label: "SC tracks", v: artist.soundcloud_track_count },
  ].filter((f) => f.v != null);

  return (
    <div className="mx-auto w-full max-w-[696px]">
      {/* Screen-only chrome */}
      <div className="mb-6 space-y-3 print:hidden">
        <div className="flex items-center justify-between">
          <Link
            href={`/artists/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to profile
          </Link>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="size-4" /> Print / save PDF
          </Button>
        </div>
        <RewindScrubber ticks={ticks} dayIdx={dayIdx} onSelect={select} />
      </div>

      <ReportPaper>
        {/* Masthead */}
        <div className="flex items-baseline justify-between border-b-2 border-primary pb-3">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight">
              <span className="text-primary">◐</span> Incighder
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Traction one-sheet
            </span>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {asOfDay ? formatDay(asOfDay) : today}
          </span>
        </div>

        {/* Identity */}
        <div className="mt-6 flex items-start gap-6">
          {image && (
            <ArtistImage
              src={image}
              alt={artist.name}
              size={96}
              className="size-24 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 text-4xl font-semibold tracking-tight">
              {artist.name}
            </h1>
            {genres.length > 0 && (
              <p className="mt-1.5 truncate font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {genres.join(" · ")}
              </p>
            )}
            {artist.external_urls?.spotify && (
              <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                {artist.external_urls.spotify.replace("https://", "")}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-4xl font-bold tabular-nums text-primary">
              {score}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Traction score
            </div>
          </div>
        </div>

        {/* The name, the genre list and the bio are the only parts of this
            sheet whose height depends on the data, so each gets a hard line
            budget — that is what keeps the sheet inside its page. */}
        {artist.bio && (
          <p className="mt-5 line-clamp-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {artist.bio}
          </p>
        )}

        {/* Traction ledger */}
        <div className="mt-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Traction
          </h2>
          <div className="mt-2 border-t border-border">
            {tracked.map((p) => {
              const e = history[p.key];
              let current: number | null;
              let change: number | null;
              let pct: number | null;
              let since: string | null;
              let sparkValues: number[];
              if (asOfEnd) {
                // Replay: last value recorded by that day, delta vs the
                // series start up to that day.
                current = e ? valueAsOf(e.points, asOfEnd) : null;
                if (current == null) return null;
                const pts = e.points.filter((pt) => pt.t <= asOfEnd);
                change = current - pts[0].v;
                since = pts[0].t;
                pct = pts[0].v ? (change / pts[0].v) * 100 : null;
                sparkValues = pts.map((pt) => pt.v);
              } else {
                current =
                  e?.current ?? (artist[p.metric.field as keyof Artist] as number | null);
                if (current == null) return null;
                change = e ? e.change : null;
                since = e ? e.since : null;
                pct = e && e.first ? (e.change / e.first) * 100 : null;
                sparkValues = e ? e.points.map((pt) => pt.v) : [];
              }
              const Icon = p.Icon;
              return (
                <div
                  key={p.key}
                  className="flex items-center gap-4 border-b border-border py-1.5"
                >
                  <Icon className="size-4 shrink-0" style={{ color: p.color }} />
                  <div className="w-24 shrink-0 text-sm text-muted-foreground">
                    {p.label}
                  </div>
                  <div
                    className="w-24 shrink-0 font-mono text-2xl font-semibold tabular-nums"
                    title={formatFull(current)}
                  >
                    {formatCompact(current)}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-sm">
                    {change != null && change !== 0 ? (
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          change > 0 ? "text-emerald-500" : "text-rose-500",
                        )}
                      >
                        {change > 0 ? "+" : ""}
                        {formatCompact(change)}
                        {pct != null && since != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({pct > 0 ? "+" : ""}
                            {pct.toFixed(1)}%) since{" "}
                            {new Date(since).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </div>
                  {sparkValues.length > 1 && <ReportSparkline values={sparkValues} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footprint — current-only fields with no snapshot history, so it
            comes off the sheet when the report is rewound. */}
        {footprint.length > 0 && !asOfDay && (
          <div className="mt-6">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Footprint
            </h2>
            {/* The paper is a fixed width, so the sheet never reflows —
                viewport breakpoints would only lie about it. */}
            <div className="mt-2 grid grid-cols-6 gap-px overflow-hidden rounded-lg bg-border">
              {footprint.map((f) => (
                <div key={f.label} className="bg-card p-3">
                  <div className="font-mono text-lg font-semibold tabular-nums">
                    {formatCompact(f.v)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
            incighder.vercel.app/artists/{id}
          </span>
          <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {asOfDay
              ? `Cross-platform traction · as of ${formatDay(asOfDay)}`
              : "Cross-platform traction · live data"}
          </span>
        </div>
      </ReportPaper>
    </div>
  );
}

// Wider sparkline than the card version — the ledger rows give it room.
function ReportSparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 32;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} className="block shrink-0" aria-hidden>
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={up ? "stroke-emerald-500" : "stroke-rose-500"}
      />
    </svg>
  );
}
