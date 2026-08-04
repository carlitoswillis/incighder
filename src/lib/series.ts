import type { HistoryPoint } from "@/lib/rewind";

// Day-granularity series and window maths, shared by the growth charts, the
// reports and the range picker.
//
// Snapshots are per-scrape, and a scrape can run several times a day. Growth is
// read per DAY, so a day is one data point carrying that day's last recorded
// value — which is also what the rewind replay has always used (value as of
// 23:59:59 on the day).

export type DayPoint = { day: string; t: string; v: number };

/** One point per snapshot day (last value recorded that day), oldest→newest. */
export function dailySeries(points: HistoryPoint[]): DayPoint[] {
  const byDay = new Map<string, DayPoint>();
  for (const pt of points) {
    const day = pt.t.slice(0, 10);
    byDay.set(day, { day, t: pt.t, v: pt.v }); // later point on the day wins
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** The days of a window, inclusive of both ends. */
export function sliceDays(series: DayPoint[], from: string | null, to: string | null): DayPoint[] {
  return series.filter((d) => (!from || d.day >= from) && (!to || d.day <= to));
}

/**
 * Value on `day`, or the last one recorded before it — a platform keeps its
 * value on days it wasn't scraped, rather than reading as missing. Null only
 * when the series hadn't started yet.
 */
export function valueOnDay(series: DayPoint[], day: string): number | null {
  let v: number | null = null;
  for (const d of series) {
    if (d.day <= day) v = d.v;
    else break;
  }
  return v;
}

export type Delta = {
  from: number | null;
  to: number | null;
  change: number | null;
  pct: number | null;
};

/** Change across the window. Null `from` means the series started inside it. */
export function deltaOver(
  series: DayPoint[],
  fromDay: string | null,
  toDay: string | null,
): Delta {
  const window = sliceDays(series, fromDay, toDay);
  // Anchor on the value carried INTO the window where there is one, so a window
  // that opens between scrapes still measures from where the count actually was.
  const start = fromDay ? valueOnDay(series, fromDay) : (window[0]?.v ?? null);
  const end = window.length ? window[window.length - 1].v : (toDay ? valueOnDay(series, toDay) : null);
  if (start == null || end == null) return { from: start, to: end, change: null, pct: null };
  const change = end - start;
  return { from: start, to: end, change, pct: start ? (change / start) * 100 : null };
}

/** Every day carrying a snapshot across the given series, oldest→newest. */
export function allDays(pointLists: HistoryPoint[][]): string[] {
  const days = new Set<string>();
  for (const points of pointLists) for (const pt of points) days.add(pt.t.slice(0, 10));
  return [...days].sort();
}

export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDayShort(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Whole days between two YYYY-MM-DD days. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}
