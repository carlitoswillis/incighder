"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Table2, TrendingDown, TrendingUp } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { formatCompact, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GrowthChart } from "@/components/growth-chart";
import { DateRangePicker, useDateRange } from "@/components/date-range";
import { useAdmin } from "@/components/admin-context";
import {
  allDays,
  dailySeries,
  deltaOver,
  formatDay,
  sliceDays,
  type DayPoint,
} from "@/lib/series";

type Entry = {
  account_key: string;
  points: { t: string; v: number }[];
  current: number;
  first: number;
  change: number;
  since: string;
};

export function GrowthSection({
  artistId,
  refreshSignal,
}: {
  artistId: string;
  refreshSignal?: string;
}) {
  const { admin } = useAdmin();
  const [history, setHistory] = useState<Record<string, Entry> | null>(null);

  useEffect(() => {
    fetch(`/api/history?artist_id=${encodeURIComponent(artistId)}`)
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory({}));
  }, [artistId, refreshSignal]);

  // One day-granularity series per platform: a day is a data point carrying
  // that day's last reading.
  const series = useMemo(() => {
    const out: Record<string, DayPoint[]> = {};
    for (const [key, e] of Object.entries(history ?? {}))
      out[key] = dailySeries(e.points);
    return out;
  }, [history]);

  const days = useMemo(
    () => allDays(Object.values(history ?? {}).map((e) => e.points)),
    [history],
  );
  const range = useDateRange(days);
  const [table, setTable] = useState(false);

  if (!history) return null;
  const platforms = PLATFORMS.filter((p) => series[p.key]?.length);

  return (
    <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Growth</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Follower change over the window below — every scrape day is a point on
            the line. Each linked account is tracked on its own timeline, so
            re-linking a different account doesn&apos;t count as growth.
          </p>
        </div>
        {platforms.length > 0 && (
          <button
            onClick={() => setTable((t) => !t)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              table
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            aria-pressed={table}
          >
            <Table2 className="size-3.5" /> Table
          </button>
        )}
      </div>

      {/* One range control scoping every chart below it, so the numbers agree.
          Kept admin-only, as the scrubber it replaces was. */}
      {admin && days.length > 1 && <DateRangePicker range={range} className="mt-4" />}

      {platforms.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No history yet — scrape this artist again over the coming days to start
          tracking.
        </p>
      ) : table ? (
        <GrowthTable
          platforms={platforms.map((p) => ({
            key: p.key,
            label: p.label,
            series: sliceDays(series[p.key], range.fromDay, range.toDay),
          }))}
        />
      ) : (
        <div className="mt-4 divide-y divide-border/60">
          {platforms.map((p) => {
            const windowed = sliceDays(series[p.key], range.fromDay, range.toDay);
            const d = deltaOver(series[p.key], range.fromDay, range.toDay);
            const dir = (d.change ?? 0) > 0 ? "up" : (d.change ?? 0) < 0 ? "down" : "flat";
            const TrendIcon =
              dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
            const Icon = p.Icon;
            return (
              <div key={p.key} className="py-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <Icon
                    className="size-4 shrink-0 self-center"
                    style={{ color: p.color }}
                    aria-hidden
                  />
                  <span className="text-sm text-muted-foreground">{p.label}</span>
                  <span
                    className="text-xl font-semibold tabular-nums"
                    title={formatFull(d.to)}
                  >
                    {formatCompact(d.to)}
                  </span>
                  {d.change != null && d.change !== 0 ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-sm tabular-nums",
                        dir === "up" ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      <TrendIcon className="size-3.5" />
                      {d.change > 0 ? "+" : ""}
                      {formatCompact(d.change)}
                      {d.pct != null &&
                        ` (${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}%)`}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {windowed.length < 2 ? "one scrape in this window" : "no change"}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {windowed.length} {windowed.length === 1 ? "scrape day" : "scrape days"}
                  </span>
                </div>
                <GrowthChart
                  series={windowed}
                  color={p.color}
                  label={`${p.label} ${p.metric.label.toLowerCase()}`}
                  className="mt-2"
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// The chart's WCAG-clean twin: every recorded day and value, reachable without
// hovering anything.
function GrowthTable({
  platforms,
}: {
  platforms: { key: string; label: string; series: DayPoint[] }[];
}) {
  const days = [...new Set(platforms.flatMap((p) => p.series.map((d) => d.day)))].sort();
  const byDay = new Map(
    platforms.map((p) => [p.key, new Map(p.series.map((d) => [d.day, d.v]))]),
  );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">
          Recorded follower counts per platform, by scrape day
        </caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-2 pr-4 font-medium">
              Day
            </th>
            {platforms.map((p) => (
              <th key={p.key} scope="col" className="py-2 pr-4 text-right font-medium">
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day} className="border-b border-border/60">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal text-muted-foreground">
                {formatDay(day)}
              </th>
              {platforms.map((p) => (
                <td key={p.key} className="py-1.5 pr-4 text-right tabular-nums">
                  {byDay.get(p.key)?.has(day)
                    ? formatFull(byDay.get(p.key)!.get(day)!)
                    : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
