"use client";

import { use, useEffect, useState } from "react";
import { ArtistImage } from "@/components/artist-image";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import type { Artist } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { calculateArtistScore } from "@/utils/score";
import { formatCompact, formatFull } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type HistoryEntry = {
  points: { t: string; v: number }[];
  current: number;
  first: number;
  change: number;
  since: string;
};

// Print/PDF-ready one-sheet: the whole traction story on a single page.
// Screen keeps the site's dark identity; @media print flips to the light
// tokens (globals.css) so it reads like a document, not a screenshot.
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

  if (error) return <p className="text-sm text-destructive">Not available.</p>;
  if (!artist)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );

  const image = artist.images?.[0]?.url ?? null;
  const genres = (artist.genres ?? "").replace(/[[\]"']/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  const { score } = calculateArtistScore(artist);
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
    <div className="mx-auto max-w-3xl">
      {/* Screen-only chrome */}
      <div className="mb-6 flex items-center justify-between print:hidden">
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

      <div className="report-sheet rounded-xl bg-card p-8 ring-1 ring-foreground/10 print:rounded-none print:p-0 print:ring-0">
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
            {today}
          </span>
        </div>

        {/* Identity */}
        <div className="mt-8 flex items-start gap-6">
          {image && (
            <ArtistImage
              src={image}
              alt={artist.name}
              size={112}
              className="size-28 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-4xl font-semibold tracking-tight">{artist.name}</h1>
            {genres.length > 0 && (
              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {genres.join(" · ")}
              </p>
            )}
            {artist.external_urls?.spotify && (
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
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

        {/* Bio */}
        {artist.bio && (
          <p className="mt-6 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {artist.bio.length > 420 ? artist.bio.slice(0, 420).trimEnd() + "…" : artist.bio}
          </p>
        )}

        {/* Traction ledger */}
        <div className="mt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Traction
          </h2>
          <div className="mt-2 border-t border-border">
            {tracked.map((p) => {
              const e = history[p.key];
              const current =
                e?.current ?? (artist[p.metric.field as keyof Artist] as number | null);
              if (current == null) return null;
              const pct = e && e.first ? (e.change / e.first) * 100 : null;
              const Icon = p.Icon;
              return (
                <div
                  key={p.key}
                  className="flex items-center gap-4 border-b border-border py-3"
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
                  <div className="min-w-0 flex-1 text-sm">
                    {e && e.change !== 0 ? (
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          e.change > 0 ? "text-emerald-500" : "text-rose-500",
                        )}
                      >
                        {e.change > 0 ? "+" : ""}
                        {formatCompact(e.change)}
                        {pct != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({pct > 0 ? "+" : ""}
                            {pct.toFixed(1)}%) since{" "}
                            {new Date(e.since).toLocaleDateString("en-US", {
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
                  {e && e.points.length > 1 && (
                    <ReportSparkline values={e.points.map((pt) => pt.v)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footprint */}
        {footprint.length > 0 && (
          <div className="mt-8">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Footprint
            </h2>
            <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-6 print:grid-cols-6">
              {footprint.map((f) => (
                <div key={f.label} className="bg-card p-3 print:bg-transparent">
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
        <div className="mt-10 flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-mono text-[10px] text-muted-foreground">
            incighder.vercel.app/artists/{id}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Cross-platform traction · live data
          </span>
        </div>
      </div>
    </div>
  );
}

// Wider sparkline than the card version — the ledger rows give it room.
function ReportSparkline({ values }: { values: number[] }) {
  const w = 140;
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
    <svg width={w} height={h} className="hidden shrink-0 sm:block print:block" aria-hidden>
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
