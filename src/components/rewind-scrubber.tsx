"use client";

import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";

// Rewind control for the report pages: slider ticks are the REAL snapshot
// days (the newest day is "today"), and the chosen day round-trips through
// ?date= so a rewound report URL is shareable/bookmarkable.

export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function useRewindDay(days: string[]) {
  const ticks = days.slice(0, -1);
  const [dayIdx, setDayIdx] = useState<number | null>(null); // null = today
  const applied = useRef(false);

  // Apply ?date= once the snapshot days are known. A date at or past the
  // newest snapshot day means "today"; anything earlier snaps to the nearest
  // snapshot day at or before it (clamped to the earliest).
  useEffect(() => {
    if (applied.current || days.length === 0) return;
    applied.current = true;
    const want = new URLSearchParams(window.location.search).get("date");
    if (!want || want >= days[days.length - 1]) return;
    const ts = days.slice(0, -1);
    if (!ts.length) return;
    let best = 0;
    ts.forEach((d, i) => {
      if (d <= want) best = i;
    });
    setDayIdx(best);
  }, [days]);

  const select = (i: number | null) => {
    setDayIdx(i);
    const url = new URL(window.location.href);
    if (i === null) url.searchParams.delete("date");
    else url.searchParams.set("date", ticks[i]);
    window.history.replaceState(null, "", url.toString());
  };

  return {
    ticks,
    dayIdx,
    select,
    asOfDay: dayIdx === null ? null : ticks[dayIdx],
  };
}

export function RewindScrubber({
  ticks,
  dayIdx,
  onSelect,
}: {
  ticks: string[];
  dayIdx: number | null;
  onSelect: (i: number | null) => void;
}) {
  if (ticks.length === 0) return null;
  const asOfDay = dayIdx === null ? null : ticks[dayIdx];
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 px-3 py-2 print:hidden">
      <History className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="range"
        min={0}
        max={ticks.length}
        step={1}
        value={dayIdx === null ? ticks.length : dayIdx}
        onChange={(e) => {
          const v = Number(e.target.value);
          onSelect(v >= ticks.length ? null : v);
        }}
        className="min-w-32 flex-1 accent-primary"
        aria-label="View the report as of an earlier snapshot date"
      />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {asOfDay ? formatDay(asOfDay) : "Today"}
      </span>
      {asOfDay && (
        <button
          className="text-xs text-primary underline-offset-4 hover:underline"
          onClick={() => onSelect(null)}
        >
          Back to today
        </button>
      )}
    </div>
  );
}
