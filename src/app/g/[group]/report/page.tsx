"use client";

import { use, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArtistImage } from "@/components/artist-image";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import type { Artist } from "@/lib/types";
import { PLATFORMS, platformInk } from "@/lib/platforms";
import { calculateArtistScore } from "@/utils/score";
import { formatCompact, formatFull } from "@/lib/format";
import { dayEnd, rewindArtist } from "@/lib/rewind";
import { DateRangePicker, useDateRange, type DateRange } from "@/components/date-range";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportPaper, ROSTER_PAGE_SIZE, chunk } from "@/components/report-paper";
import { cn } from "@/lib/utils";

type HistoryEntry = {
  points: { t: string; v: number }[];
  current: number;
  first: number;
  change: number;
};
type HistoryMap = Record<string, HistoryEntry>;
type SeriesMap = Record<string, DayPoint[]>;

// Roster report in two shapes:
//   compact  — the printable one-sheet, a ledger row per person, paginated at
//              ROSTER_PAGE_SIZE members per page.
//   detailed — a flowing document with a per-platform breakdown and a trend
//              line per person; runs to as many pages as the roster needs.
// Both read over the window picked above them: values as of its end, growth
// measured from its start.
export default function GroupReportPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group } = use(params);
  const name = decodeURIComponent(group);
  const [members, setMembers] = useState<Artist[] | null>(null);
  const [histories, setHistories] = useState<Record<string, HistoryMap>>({});
  const [detailed, setDetailed] = useState(false);

  useEffect(() => {
    setDetailed(new URLSearchParams(window.location.search).get("view") === "detailed");
  }, []);

  const selectView = (next: boolean) => {
    setDetailed(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("view", "detailed");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url.toString());
  };

  useEffect(() => {
    fetch(`/api/artists?group=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(async (rows: Artist[]) => {
        setMembers(rows);
        const entries = await Promise.all(
          rows.map(async (a) => {
            const h = await fetch(`/api/history?artist_id=${encodeURIComponent(a.id)}`)
              .then((r) => r.json())
              .catch(() => ({}));
            return [a.id, h] as const;
          }),
        );
        setHistories(Object.fromEntries(entries));
      })
      .catch(() => setMembers([]));
  }, [name]);

  const series = useMemo(() => {
    const out: Record<string, SeriesMap> = {};
    for (const [id, h] of Object.entries(histories)) {
      const m: SeriesMap = {};
      for (const [key, e] of Object.entries(h)) m[key] = dailySeries(e.points ?? []);
      out[id] = m;
    }
    return out;
  }, [histories]);

  const days = useMemo(
    () =>
      allDays(
        Object.values(histories).flatMap((h) =>
          Object.values(h).map((e) => e.points ?? []),
        ),
      ),
    [histories],
  );
  const range = useDateRange(days);
  const asOfDay = range.isLive ? null : range.toDay;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  if (members === null)
    return (
      <div className="mx-auto w-full max-w-[696px] space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );

  const sheets =
    members.length > 0 ? chunk(members, ROSTER_PAGE_SIZE) : [[] as Artist[]];

  const chrome = (
    <div className="mb-6 space-y-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/g/${encodeURIComponent(name)}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to {name}
        </Link>
        <div className="flex items-center gap-2">
          <div
            className="flex rounded-md border border-border/60 p-0.5"
            role="group"
            aria-label="Report detail"
          >
            {[
              { on: false, label: "Compact" },
              { on: true, label: "Detailed" },
            ].map((v) => (
              <button
                key={v.label}
                onClick={() => selectView(v.on)}
                aria-pressed={detailed === v.on}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  detailed === v.on
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="size-4" /> Print / save PDF
          </Button>
        </div>
      </div>
      <DateRangePicker range={range} />
    </div>
  );

  const masthead = (
    <div className="flex items-baseline justify-between border-b-2 border-primary pb-3">
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-primary">◐</span> Incighder
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {detailed ? "Roster breakdown" : "Roster one-sheet"}
        </span>
      </div>
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {asOfDay ? formatDay(asOfDay) : today}
      </span>
    </div>
  );

  const heading = (
    <div className="mt-6 flex items-baseline justify-between gap-4">
      <h1 className="truncate text-3xl font-semibold tracking-tight">{name}</h1>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {members.length} {members.length === 1 ? "member" : "members"}
      </span>
    </div>
  );

  const windowNote = range.isFull ? null : (
    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
      {range.fromDay && range.toDay
        ? `${formatDayShort(range.fromDay)} → ${formatDayShort(range.toDay)}`
        : null}
    </p>
  );

  if (detailed) {
    // Free of the one-page constraint: a flowing document that runs to as many
    // pages as the roster needs, with each member kept whole on a page.
    return (
      <div className="mx-auto w-full max-w-[860px]">
        {chrome}
        <div className="report-doc rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          {masthead}
          {heading}
          {windowNote}
          {members.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <div className="mt-6 space-y-6">
              {members.map((a) => (
                <MemberBreakdown
                  key={a.id}
                  artist={a}
                  series={series[a.id] ?? {}}
                  history={histories[a.id] ?? {}}
                  range={range}
                />
              ))}
            </div>
          )}
          <Footer name={name} range={range} asOfDay={asOfDay} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[696px]">
      {chrome}
      {sheets.map((sheet, i) => (
        <ReportPaper key={i}>
          {masthead}
          {heading}
          {windowNote}

          {sheet.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <div className="mt-5">
              {/* Platform icons ride in a header row rather than in every cell —
                  one column per platform keeps a member to a single row, and the
                  columns are too narrow to carry an icon each. */}
              <div className="flex items-end gap-3 border-b border-border pb-1.5">
                <div className="w-44 shrink-0" />
                <div className="grid min-w-0 flex-1 grid-cols-7 gap-x-1">
                  {PLATFORMS.map((p) => (
                    <p.Icon
                      key={p.key}
                      className="mark size-3.5"
                      style={
                        {
                          "--mark": p.color,
                          "--mark-print": platformInk(p, true),
                        } as CSSProperties
                      }
                      title={p.label}
                    />
                  ))}
                </div>
              </div>
              {sheet.map((a) => (
                <MemberRow
                  key={a.id}
                  artist={a}
                  series={series[a.id] ?? {}}
                  history={histories[a.id] ?? {}}
                  range={range}
                />
              ))}
            </div>
          )}

          <Footer
            name={name}
            range={range}
            asOfDay={asOfDay}
            page={sheets.length > 1 ? { i: i + 1, of: sheets.length } : undefined}
          />
        </ReportPaper>
      ))}
    </div>
  );
}

function Footer({
  name,
  range,
  asOfDay,
  page,
}: {
  name: string;
  range: DateRange;
  asOfDay: string | null;
  page?: { i: number; of: number };
}) {
  return (
    <div className="mt-auto flex items-baseline justify-between gap-4 border-t border-border pt-3">
      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
        incighder.vercel.app/g/{encodeURIComponent(name)}
      </span>
      {page && (
        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Page {page.i} of {page.of}
        </span>
      )}
      <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {asOfDay
          ? `Cross-platform traction · as of ${formatDay(asOfDay)}`
          : "Cross-platform traction · live data"}
        {!range.isFull && range.fromDay && ` · from ${formatDayShort(range.fromDay)}`}
      </span>
    </div>
  );
}

/** Score as of the window's end, or "—" when nothing was tracked by then. */
function windowScore(artist: Artist, history: HistoryMap, asOfDay: string | null) {
  const end = asOfDay ? dayEnd(asOfDay) : null;
  const tracked =
    !end ||
    PLATFORMS.some((p) => {
      const pts = history[p.key]?.points ?? [];
      return pts.some((pt) => pt.t <= end);
    });
  const { score } = calculateArtistScore(end ? rewindArtist(artist, history, end) : artist);
  return tracked ? score : null;
}

function MemberRow({
  artist,
  series,
  history,
  range,
}: {
  artist: Artist;
  series: SeriesMap;
  history: HistoryMap;
  range: DateRange;
}) {
  const score = windowScore(artist, history, range.isLive ? null : range.toDay);
  return (
    <div className="flex items-center gap-3 border-b border-border py-1.5">
      <div className="flex w-44 shrink-0 items-center gap-3">
        {artist.images?.[0]?.url && (
          <ArtistImage
            src={artist.images[0].url}
            alt={artist.name}
            size={32}
            className="size-8 rounded-md object-cover"
          />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium leading-tight">{artist.name}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            score {score ?? "—"}
          </div>
        </div>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-x-1">
        {PLATFORMS.map((p) => {
          const d = deltaOver(series[p.key] ?? [], range.fromDay, range.toDay);
          const current =
            d.to ?? (artist[p.metric.field as keyof Artist] as number | null);
          if (current == null) return <div key={p.key} />;
          return (
            <div key={p.key} className="min-w-0">
              <div className="font-mono text-sm font-semibold tabular-nums">
                {formatCompact(current)}
              </div>
              {d.pct != null && d.pct !== 0 && (
                <div
                  className={cn(
                    "font-mono text-[10px] tabular-nums",
                    d.pct > 0 ? "text-emerald-500" : "text-rose-500",
                  )}
                >
                  {d.pct > 0 ? "+" : ""}
                  {d.pct.toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Detailed view: a person's platforms broken out, each with the window's
// numbers and its own trend line.
function MemberBreakdown({
  artist,
  series,
  history,
  range,
}: {
  artist: Artist;
  series: SeriesMap;
  history: HistoryMap;
  range: DateRange;
}) {
  const score = windowScore(artist, history, range.isLive ? null : range.toDay);
  const rows = PLATFORMS.map((p) => {
    const full = series[p.key] ?? [];
    const d = deltaOver(full, range.fromDay, range.toDay);
    const current = d.to ?? (artist[p.metric.field as keyof Artist] as number | null);
    return { p, d, current, windowed: sliceDays(full, range.fromDay, range.toDay) };
  }).filter((r) => r.current != null);

  return (
    <section className="report-block border-t border-border pt-4">
      <div className="flex items-center gap-3">
        {artist.images?.[0]?.url && (
          <ArtistImage
            src={artist.images[0].url}
            alt={artist.name}
            size={44}
            className="size-11 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{artist.name}</h2>
          {artist.external_urls?.spotify && (
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {artist.external_urls.spotify.replace("https://", "")}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-2xl font-bold tabular-nums text-primary">
            {score ?? "—"}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Traction score
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No tracked platforms.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-6">
          {rows.map(({ p, d, current, windowed }) => {
            const Icon = p.Icon;
            return (
              <div
                key={p.key}
                className="flex items-center gap-3 border-b border-border/60 py-2"
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
                <div className="min-w-0 flex-1">
                  <div
                    className="font-mono text-lg font-semibold tabular-nums leading-none"
                    title={formatFull(current)}
                  >
                    {formatCompact(current)}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">
                    {p.label}
                    {d.change != null && d.change !== 0 && (
                      <span
                        className={cn(
                          "ml-1.5 font-mono tabular-nums",
                          d.change > 0 ? "text-emerald-500" : "text-rose-500",
                        )}
                      >
                        {d.change > 0 ? "+" : ""}
                        {formatCompact(d.change)}
                        {d.pct != null &&
                          ` (${d.pct > 0 ? "+" : ""}${d.pct.toFixed(1)}%)`}
                      </span>
                    )}
                  </div>
                </div>
                <Sparkline
                  series={windowed}
                  color={p.color}
                  printColor={platformInk(p, true)}
                  width={104}
                  height={30}
                  className="shrink-0"
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
