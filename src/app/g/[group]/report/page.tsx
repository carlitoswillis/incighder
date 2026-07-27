"use client";

import { use, useEffect, useMemo, useState } from "react";
import { ArtistImage } from "@/components/artist-image";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import type { Artist } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { calculateArtistScore } from "@/utils/score";
import { formatCompact } from "@/lib/format";
import { dayEnd, rewindArtist, snapshotDays, valueAsOf } from "@/lib/rewind";
import {
  RewindScrubber,
  formatDay,
  useRewindDay,
} from "@/components/rewind-scrubber";
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

// Roster one-sheet: the group on a printable page — a ledger row per person,
// per-platform numbers with growth deltas. A roster too long for one sheet
// continues onto further sheets, ROSTER_PAGE_SIZE members at a time. The
// rewind scrubber (and ?date=) replays the report as of any snapshot day.
export default function GroupReportPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group } = use(params);
  const name = decodeURIComponent(group);
  const [members, setMembers] = useState<Artist[] | null>(null);
  const [histories, setHistories] = useState<Record<string, HistoryMap>>({});

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

  const days = useMemo(
    () =>
      snapshotDays(
        Object.values(histories).flatMap((h) =>
          Object.values(h).map((e) => e.points ?? []),
        ),
      ),
    [histories],
  );
  const { ticks, dayIdx, select, asOfDay } = useRewindDay(days);
  const asOfEnd = asOfDay ? dayEnd(asOfDay) : null;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  // A roster longer than one sheet runs onto more sheets rather than being
  // squeezed onto one — each sheet prints as its own page.
  const sheets =
    members && members.length > 0 ? chunk(members, ROSTER_PAGE_SIZE) : [[]];

  if (members === null)
    return (
      <div className="mx-auto w-full max-w-[696px] space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-[696px]">
      <div className="mb-6 space-y-3 print:hidden">
        <div className="flex items-center justify-between">
          <Link
            href={`/g/${encodeURIComponent(name)}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to {name}
          </Link>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="size-4" /> Print / save PDF
          </Button>
        </div>
        <RewindScrubber ticks={ticks} dayIdx={dayIdx} onSelect={select} />
      </div>

      {sheets.map((sheet, i) => (
        <ReportPaper key={i}>
          {/* Masthead */}
          <div className="flex items-baseline justify-between border-b-2 border-primary pb-3">
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight">
                <span className="text-primary">◐</span> Incighder
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Roster one-sheet
              </span>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {asOfDay ? formatDay(asOfDay) : today}
            </span>
          </div>

          <div className="mt-6 flex items-baseline justify-between">
            <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
            <span className="font-mono text-xs text-muted-foreground">
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>

          {sheet.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <div className="mt-6">
              {/* Platform icons ride in a header row rather than in every cell —
                  one column per platform keeps a member to a single row, and the
                  columns are too narrow to carry an icon each. */}
              <div className="flex items-end gap-3 border-b border-border pb-1.5">
                <div className="w-44 shrink-0" />
                <div className="grid min-w-0 flex-1 grid-cols-7 gap-x-1">
                  {PLATFORMS.map((p) => (
                    <p.Icon
                      key={p.key}
                      className="size-3.5"
                      style={{ color: p.color }}
                      title={p.label}
                    />
                  ))}
                </div>
              </div>
              {sheet.map((a) => (
                <MemberRow
                  key={a.id}
                  artist={a}
                  history={histories[a.id] ?? {}}
                  asOfEnd={asOfEnd}
                />
              ))}
            </div>
          )}

          <div className="mt-auto flex items-baseline justify-between gap-4 border-t border-border pt-3">
            <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
              incighder.vercel.app/g/{encodeURIComponent(name)}
            </span>
            {sheets.length > 1 && (
              <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Page {i + 1} of {sheets.length}
              </span>
            )}
            <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {asOfDay
                ? `Cross-platform traction · as of ${formatDay(asOfDay)}`
                : "Cross-platform traction · live data"}
            </span>
          </div>
        </ReportPaper>
      ))}
    </div>
  );
}

function MemberRow({
  artist,
  history,
  asOfEnd,
}: {
  artist: Artist;
  history: HistoryMap;
  asOfEnd: string | null;
}) {
  // A rewound row only shows what was recorded by that day; the score is
  // recomputed from those as-of values (— if the person wasn't tracked yet).
  const hasAsOf =
    !asOfEnd ||
    PLATFORMS.some(
      (p) => history[p.key] && valueAsOf(history[p.key].points, asOfEnd) != null,
    );
  const { score } = calculateArtistScore(
    asOfEnd ? rewindArtist(artist, history, asOfEnd) : artist,
  );

  return (
    <div className="flex items-center gap-3 border-b border-border py-2">
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
          <div className="truncate font-medium">{artist.name}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            score {hasAsOf ? score : "—"}
          </div>
        </div>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-x-1">
        {PLATFORMS.map((p) => {
          const e = history[p.key];
          let current: number | null;
          let pct: number | null;
          if (asOfEnd) {
            current = e ? valueAsOf(e.points, asOfEnd) : null;
            const first =
              e && e.points[0] && e.points[0].t <= asOfEnd ? e.points[0].v : null;
            pct = current != null && first ? ((current - first) / first) * 100 : null;
          } else {
            current =
              e?.current ?? (artist[p.metric.field as keyof Artist] as number | null);
            pct = e && e.first ? (e.change / e.first) * 100 : null;
          }
          if (current == null) return <div key={p.key} />;
          return (
            <div key={p.key} className="min-w-0">
              <div className="font-mono text-sm font-semibold tabular-nums">
                {formatCompact(current)}
              </div>
              {pct != null && pct !== 0 && (
                <div
                  className={cn(
                    "font-mono text-[10px] tabular-nums",
                    pct > 0 ? "text-emerald-500" : "text-rose-500",
                  )}
                >
                  {pct > 0 ? "+" : ""}
                  {pct.toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
