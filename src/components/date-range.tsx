"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysBetween, formatDay } from "@/lib/series";

// Growth is read over a window, so both ends are pickable: a start date to
// measure FROM and an end date to measure TO. Ticks are the real snapshot days,
// so a handle can only land on a day that was actually scraped.
//
// The window round-trips through ?from=&to= — a shared or printed URL restores
// it. ?date= from the single-date rewind this replaces still works and means
// "as of", i.e. the window's end.

export type DateRange = {
  /** Snapshot days, oldest→newest. */
  days: string[];
  fromIdx: number;
  toIdx: number;
  fromDay: string | null;
  toDay: string | null;
  /** True when the window is the whole recorded history. */
  isFull: boolean;
  /** True when the end is pinned to the newest snapshot ("now"). */
  isLive: boolean;
  setRange: (from: number, to: number) => void;
  reset: () => void;
};

export function useDateRange(days: string[]): DateRange {
  const [idx, setIdx] = useState<[number, number] | null>(null);
  const applied = useRef(false);

  // Apply ?from/?to (or legacy ?date=) once the snapshot days are known. Each
  // is snapped to the nearest recorded day at or before it, so a URL naming a
  // day we never scraped still resolves.
  useEffect(() => {
    if (applied.current || days.length === 0) return;
    applied.current = true;
    const q = new URLSearchParams(window.location.search);
    const want = { from: q.get("from"), to: q.get("to") ?? q.get("date") };
    if (!want.from && !want.to) return;
    const snap = (day: string, fallback: number) => {
      let best = -1;
      days.forEach((d, i) => {
        if (d <= day) best = i;
      });
      return best < 0 ? fallback : best;
    };
    const from = want.from ? snap(want.from, 0) : 0;
    const to = want.to ? snap(want.to, days.length - 1) : days.length - 1;
    setIdx([Math.min(from, to), Math.max(from, to)]);
  }, [days]);

  const last = Math.max(0, days.length - 1);
  const fromIdx = Math.min(idx?.[0] ?? 0, last);
  const toIdx = Math.min(idx?.[1] ?? last, last);

  const write = useCallback(
    (from: number, to: number) => {
      setIdx([from, to]);
      const url = new URL(window.location.href);
      url.searchParams.delete("date"); // superseded by from/to
      if (from === 0) url.searchParams.delete("from");
      else url.searchParams.set("from", days[from]);
      if (to === days.length - 1) url.searchParams.delete("to");
      else url.searchParams.set("to", days[to]);
      window.history.replaceState(null, "", url.toString());
    },
    [days],
  );

  return {
    days,
    fromIdx,
    toIdx,
    fromDay: days.length ? days[fromIdx] : null,
    toDay: days.length ? days[toIdx] : null,
    isFull: fromIdx === 0 && toIdx === last,
    isLive: toIdx === last,
    setRange: (from, to) => write(Math.min(from, to), Math.max(from, to)),
    reset: () => write(0, last),
  };
}

const PRESETS = [7, 30, 90];

export function DateRangePicker({
  range,
  className,
}: {
  range: DateRange;
  className?: string;
}) {
  const { days, fromIdx, toIdx, fromDay, toDay, isFull, setRange } = range;
  if (days.length < 2) return null;
  const last = days.length - 1;

  // A preset is the last N days of recorded history — it moves the start and
  // pins the end to the newest snapshot.
  const applyPreset = (n: number) => {
    const cutoff = days[last];
    let from = 0;
    days.forEach((d, i) => {
      if (daysBetween(d, cutoff) >= n) from = i;
    });
    setRange(from, last);
  };
  const spanDays = fromDay && toDay ? daysBetween(fromDay, toDay) : 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 px-3 py-2.5 print:hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs tabular-nums">
          {fromDay ? formatDay(fromDay) : "—"}
          <span className="px-1.5 text-muted-foreground">→</span>
          {toDay ? formatDay(toDay) : "—"}
        </span>
        <span className="text-xs text-muted-foreground">
          {spanDays > 0 ? `${spanDays} days` : "same day"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => applyPreset(n)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {n}d
            </button>
          ))}
          <button
            onClick={range.reset}
            disabled={isFull}
            className={cn(
              "rounded-md px-2 py-1 text-xs transition-colors",
              isFull
                ? "text-muted-foreground/40"
                : "text-primary hover:bg-secondary",
            )}
          >
            All
          </button>
        </div>
      </div>

      {/* Two handles over the same track: start on top, end below, each snapping
          to a recorded day. Native inputs so keyboard and screen readers work. */}
      <div className="mt-2 space-y-1">
        <label className="flex items-center gap-2">
          <span className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            From
          </span>
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={fromIdx}
            onChange={(e) => setRange(Number(e.target.value), toIdx)}
            className="w-full accent-primary"
            aria-label="Start of the comparison window"
            aria-valuetext={fromDay ? formatDay(fromDay) : undefined}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            To
          </span>
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={toIdx}
            onChange={(e) => setRange(fromIdx, Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="End of the comparison window"
            aria-valuetext={toDay ? formatDay(toDay) : undefined}
          />
        </label>
      </div>
    </div>
  );
}
