"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysBetween, formatDay, formatDayShort } from "@/lib/series";

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
  const [custom, setCustom] = useState(false);
  if (days.length < 2) return null;
  const last = days.length - 1;

  // The start index a "last N days" preset resolves to (end pinned to newest).
  const presetFrom = (n: number) => {
    let from = 0;
    days.forEach((d, i) => {
      if (daysBetween(d, days[last]) >= n) from = i;
    });
    return from;
  };
  // Which chip is lit: a preset only when the end is pinned to "now" and the
  // start matches; otherwise All, otherwise the window is Custom.
  const activePreset =
    toIdx === last ? PRESETS.find((n) => presetFrom(n) === fromIdx) : undefined;
  const spanDays = fromDay && toDay ? daysBetween(fromDay, toDay) : 0;

  const chip = (active: boolean) =>
    cn(
      "rounded-md px-2 py-1 text-xs transition-colors",
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
    );

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 px-3 py-2.5 print:hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <CalendarRange className="mr-0.5 size-4 shrink-0 text-muted-foreground" />
        {PRESETS.map((n) => (
          <button
            key={n}
            onClick={() => {
              setRange(presetFrom(n), last);
              setCustom(false);
            }}
            className={chip(activePreset === n)}
            aria-pressed={activePreset === n}
          >
            {n}d
          </button>
        ))}
        <button
          onClick={() => {
            range.reset();
            setCustom(false);
          }}
          className={chip(isFull)}
          aria-pressed={isFull}
        >
          All
        </button>
        <button
          onClick={() => setCustom((c) => !c)}
          className={cn(
            chip(!activePreset && !isFull),
            "inline-flex items-center gap-1",
          )}
          aria-expanded={custom}
        >
          Custom
          <ChevronDown
            className={cn("size-3.5 transition-transform", custom && "rotate-180")}
            aria-hidden
          />
        </button>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          {fromDay ? formatDayShort(fromDay) : "—"}
          <span className="px-1">→</span>
          {toDay ? formatDayShort(toDay) : "—"}
          <span className="ml-1.5 text-muted-foreground/70">
            {spanDays > 0 ? `${spanDays}d` : "same day"}
          </span>
        </span>
      </div>

      {/* Custom window: two day pickers. Native selects so keyboard and touch
          both work, and the list only holds days that were actually recorded. */}
      {custom && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-2.5">
          <DaySelect
            label="From"
            days={days}
            value={fromIdx}
            onChange={(i) => setRange(i, toIdx)}
          />
          <DaySelect
            label="To"
            days={days}
            value={toIdx}
            onChange={(i) => setRange(fromIdx, i)}
          />
        </div>
      )}
    </div>
  );
}

function DaySelect({
  label,
  days,
  value,
  onChange,
}: {
  label: string;
  days: string[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-border/60 bg-transparent px-1.5 py-1 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
        aria-label={`${label} day`}
      >
        {days.map((d, i) => (
          <option key={d} value={i}>
            {formatDay(d)}
          </option>
        ))}
      </select>
    </label>
  );
}
