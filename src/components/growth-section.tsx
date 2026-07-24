"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { formatCompact, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";
import { useAdmin } from "@/components/admin-context";

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

  // Rewind scrubber: ticks are the REAL snapshot dates (day granularity),
  // last tick = now. Time travel is a pure replay of the recorded points.
  const ticks = useMemo(() => {
    if (!history) return [];
    const days = new Set<string>();
    for (const e of Object.values(history)) {
      for (const pt of e.points) days.add(pt.t.slice(0, 10));
    }
    // The most recent snapshot day IS "Now" — offering it as a tick would just
    // show a zero-change view of the same day.
    return [...days].sort().slice(0, -1);
  }, [history]);
  const [tickIdx, setTickIdx] = useState<number | null>(null); // null = now

  if (!history) return null;
  const platforms = PLATFORMS.filter((p) => history[p.key]);
  const rewound = tickIdx !== null && tickIdx < ticks.length - 0 && ticks.length > 0 && tickIdx < ticks.length;
  const asOfDay = rewound ? ticks[Math.min(tickIdx!, ticks.length - 1)] : null;
  const asOfEnd = asOfDay ? `${asOfDay}T23:59:59Z` : null;

  const asOfValue = (key: string): number | null => {
    const e = history[key];
    if (!e || !asOfEnd) return null;
    let v: number | null = null;
    for (const pt of e.points) {
      if (pt.t <= asOfEnd) v = pt.v;
      else break;
    }
    return v;
  };

  return (
    <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <h2 className="text-lg font-semibold tracking-tight">Growth</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Follower change over time. Each linked account is tracked on its own
        timeline, so re-linking a different account doesn&apos;t count as growth.
      </p>

      {admin && ticks.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
          <History className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={ticks.length}
            step={1}
            value={tickIdx === null ? ticks.length : tickIdx}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTickIdx(v >= ticks.length ? null : v);
            }}
            className="min-w-32 flex-1 accent-primary"
            aria-label="Rewind to a snapshot date"
          />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {asOfDay
              ? new Date(`${asOfDay}T12:00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Now"}
          </span>
          {asOfDay && (
            <button
              className="text-xs text-primary underline-offset-4 hover:underline"
              onClick={() => setTickIdx(null)}
            >
              Back to now
            </button>
          )}
        </div>
      )}

      {platforms.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No history yet — scrape this artist again over the coming days to start
          tracking.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border/60">
          {platforms.map((p) => {
            const e = history[p.key];
            if (!e) return null;
            const Icon = p.Icon;
            const pct = e.first ? (e.change / e.first) * 100 : 0;
            const dir = e.change > 0 ? "up" : e.change < 0 ? "down" : "flat";
            const TrendIcon =
              dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
            const past = asOfDay ? asOfValue(p.key) : null;
            return (
              <div key={p.key} className="flex items-center gap-4 py-3">
                <Icon
                  className="size-4 shrink-0"
                  style={{ color: p.color }}
                  aria-hidden
                />
                <div className="w-28 shrink-0">
                  <div
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      asOfDay && "text-primary",
                    )}
                    title={asOfDay ? undefined : formatFull(e.current)}
                  >
                    {asOfDay
                      ? past !== null
                        ? formatCompact(past)
                        : "—"
                      : formatCompact(e.current)}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.label}</div>
                </div>
                <div className="flex-1">
                  {asOfDay ? (
                    past === null ? (
                      <span className="text-xs text-muted-foreground">
                        not yet tracked on this date
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                        since then:{" "}
                        <span
                          className={cn(
                            e.current - past > 0
                              ? "text-emerald-400"
                              : e.current - past < 0
                                ? "text-rose-400"
                                : "",
                          )}
                        >
                          {e.current - past > 0 ? "+" : ""}
                          {formatCompact(e.current - past)}
                          {past > 0 &&
                            ` (${e.current - past >= 0 ? "+" : ""}${(((e.current - past) / past) * 100).toFixed(1)}%)`}
                        </span>
                        {" "}→ {formatCompact(e.current)} now
                      </span>
                    )
                  ) : e.points.length < 2 ? (
                    <span className="text-xs text-muted-foreground">
                      tracking started — scrape again to see growth
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-sm tabular-nums",
                        dir === "up"
                          ? "text-emerald-400"
                          : dir === "down"
                            ? "text-rose-400"
                            : "text-muted-foreground",
                      )}
                    >
                      <TrendIcon className="size-3.5" />
                      {e.change > 0 ? "+" : ""}
                      {formatCompact(e.change)} ({pct >= 0 ? "+" : ""}
                      {pct.toFixed(1)}%)
                      <span className="ml-1 text-xs text-muted-foreground">
                        since {new Date(e.since).toLocaleDateString()}
                      </span>
                    </span>
                  )}
                </div>
                <Sparkline
                  values={(asOfEnd
                    ? e.points.filter((pt) => pt.t <= asOfEnd)
                    : e.points
                  ).map((pt) => pt.v)}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
