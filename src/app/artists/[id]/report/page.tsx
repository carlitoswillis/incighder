"use client";

import { use, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArtistImage } from "@/components/artist-image";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import type { Artist } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { calculateArtistScore } from "@/utils/score";
import { formatCompact, formatFull } from "@/lib/format";
import { dayEnd, rewindArtist } from "@/lib/rewind";
import { DateRangePicker, useDateRange } from "@/components/date-range";
import { Sparkline } from "@/components/sparkline";
import {
  allDays,
  dailySeries,
  deltaOver,
  formatDay,
  formatDayShort,
  sliceDays,
  type DayPoint,
} from "@/lib/series";
import { platformInk } from "@/lib/platforms";
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
// The date range (?from=&to=) sets what the sheet reads as of, and what its
// growth is measured from.
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

  const series = useMemo(() => {
    const out: Record<string, DayPoint[]> = {};
    for (const [key, e] of Object.entries(history)) out[key] = dailySeries(e.points ?? []);
    return out;
  }, [history]);
  const days = useMemo(
    () => allDays(Object.values(history).map((e) => e.points ?? [])),
    [history],
  );
  const range = useDateRange(days);
  // The sheet reads AS OF the window's end; deltas are measured from its start.
  const asOfDay = range.isLive ? null : range.toDay;
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
        <DateRangePicker range={range} />
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
              const full = series[p.key] ?? [];
              const windowed = sliceDays(full, range.fromDay, range.toDay);
              const d = deltaOver(full, range.fromDay, range.toDay);
              // Platforms with no snapshots still show their stored count.
              const current =
                d.to ?? (artist[p.metric.field as keyof Artist] as number | null);
              if (current == null) return null;
              const Icon = p.Icon;
              return (
                <div
                  key={p.key}
                  className="flex items-center gap-4 border-b border-border py-1.5"
                >
                  <Icon
                    className="mark size-4 shrink-0"
                    style={
                      {
                        "--mark": p.color,
                        "--mark-print": platformInk(p, true),
                      } as CSSProperties
                    }
                  />
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
                    {d.change != null && d.change !== 0 ? (
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          d.change > 0 ? "text-emerald-500" : "text-rose-500",
                        )}
                      >
                        {d.change > 0 ? "+" : ""}
                        {formatCompact(d.change)}
                        {d.pct != null && range.fromDay && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({d.pct > 0 ? "+" : ""}
                            {d.pct.toFixed(1)}%) since {formatDayShort(range.fromDay)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </div>
                  <Sparkline
                    series={windowed}
                    color={p.color}
                    printColor={platformInk(p, true)}
                    width={120}
                    height={32}
                    className="shrink-0"
                  />
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

