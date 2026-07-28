import type { Artist } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";

// Time-travel helpers for the report pages: a rewound report is a pure replay
// of recorded metric_snapshots points. Day-granularity series and window maths
// live in lib/series.ts; this is the artist-level replay on top of them.

export type HistoryPoint = { t: string; v: number };

export const dayEnd = (day: string) => `${day}T23:59:59Z`;

// Last recorded value at or before `end`; null if the series hadn't started.
export function valueAsOf(points: HistoryPoint[], end: string): number | null {
  let v: number | null = null;
  for (const pt of points) {
    if (pt.t <= end) v = pt.v;
    else break;
  }
  return v;
}

// Artist overlaid with each platform's as-of value so the traction score can
// be recomputed for that day. Momentum is stripped (not reconstructable), and
// fields without snapshots (Spotify followers/popularity, manual X) stay
// current — the rewound score is a close approximation, not an exact replay.
export function rewindArtist(
  artist: Artist,
  history: Record<string, { points: HistoryPoint[] } | undefined>,
  end: string,
): Artist {
  const copy: Record<string, unknown> = { ...artist, momentum_wk_pct: null };
  for (const p of PLATFORMS) {
    const e = history[p.key];
    if (e) copy[p.metric.field] = valueAsOf(e.points, end);
  }
  return copy as unknown as Artist;
}
