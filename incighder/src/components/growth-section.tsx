"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { formatCompact, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";

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
  const [history, setHistory] = useState<Record<string, Entry> | null>(null);

  useEffect(() => {
    fetch(`/api/history?artist_id=${encodeURIComponent(artistId)}`)
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => setHistory({}));
  }, [artistId, refreshSignal]);

  if (!history) return null;
  const platforms = PLATFORMS.filter((p) => history[p.key]);

  return (
    <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <h2 className="text-lg font-semibold tracking-tight">Growth</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Follower change over time. Each linked account is tracked on its own
        timeline, so re-linking a different account doesn&apos;t count as growth.
      </p>

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
            return (
              <div key={p.key} className="flex items-center gap-4 py-3">
                <Icon
                  className="size-4 shrink-0"
                  style={{ color: p.color }}
                  aria-hidden
                />
                <div className="w-28 shrink-0">
                  <div
                    className="text-sm font-medium tabular-nums"
                    title={formatFull(e.current)}
                  >
                    {formatCompact(e.current)}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.label}</div>
                </div>
                <div className="flex-1">
                  {e.points.length < 2 ? (
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
                <Sparkline values={e.points.map((pt) => pt.v)} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
