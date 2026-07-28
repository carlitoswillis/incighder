"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DayPoint } from "@/lib/series";
import { formatCompact, formatFull } from "@/lib/format";
import { formatDay, formatDayShort } from "@/lib/series";
import { cn } from "@/lib/utils";

// Follower count over time for ONE platform — a single series, so no legend:
// the row's icon and label already name what is plotted.
//
// The x axis is real time, not point index: two scrapes a day apart sit a day
// apart, and a gap in scraping reads as a gap. Every scrape day carries a dot,
// which is the point of the chart — you can see the cadence, not just the trend.
//
// Geometry is in real pixels off a measured width rather than a stretched
// viewBox, so dots stay round and strokes stay even at any container width.

const H = 96; // plot height
const PAD = { top: 10, right: 8, bottom: 16, left: 8 };
const DOT_R = 2.5;

export function GrowthChart({
  series,
  color,
  label,
  className,
}: {
  series: DayPoint[];
  /** Brand hue for the line and dots. Marks only — never the text. */
  color: string;
  /** Names the series for assistive tech, in place of a legend. */
  label: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    if (!w || series.length === 0) return null;
    const xs = series.map((d) => Date.parse(`${d.day}T12:00:00Z`));
    const vs = series.map((d) => d.v);
    const xSpan = xs[xs.length - 1] - xs[0] || 1;
    let min = Math.min(...vs);
    let max = Math.max(...vs);
    if (min === max) {
      // A flat series would otherwise divide by zero and sit on the floor.
      const nudge = Math.max(1, Math.abs(min) * 0.02);
      min -= nudge;
      max += nudge;
    }
    const inner = w - PAD.left - PAD.right;
    const px = (t: number) =>
      series.length === 1 ? PAD.left + inner / 2 : PAD.left + ((t - xs[0]) / xSpan) * inner;
    const py = (v: number) =>
      H - PAD.bottom - ((v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
    return {
      pts: series.map((d, i) => ({ ...d, x: px(xs[i]), y: py(d.v) })),
      min,
      max,
      py,
    };
  }, [series, w]);

  const pts = geom?.pts ?? [];
  const active = cursor != null && pts[cursor] ? pts[cursor] : null;
  // Dots crowd once there are more days than room; past that the crosshair is
  // how you read a single day, and drawing them all would be a smear. Measured
  // on the CLOSEST pair, not the average — uneven cadence is the whole point,
  // so a dense week must not be judged by a sparse month.
  const tightest = pts.slice(1).reduce((min, p, i) => Math.min(min, p.x - pts[i].x), Infinity);
  const showDots = tightest >= DOT_R * 2;

  const moveTo = (clientX: number) => {
    const el = host.current;
    if (!el || pts.length === 0) return;
    const x = clientX - el.getBoundingClientRect().left;
    // Snap to the nearest day: the reader aims at a date, not at the line.
    let best = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setCursor(best);
  };

  const first = series[0];
  const lastPt = series[series.length - 1];

  return (
    <div ref={host} className={cn("relative", className)} style={{ height: H }}>
      {geom && pts.length > 0 && (
        <svg
          width={w}
          height={H}
          className="touch-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-growth-chart=""
          role="img"
          aria-label={`${label} over time, ${formatDay(first.day)} to ${formatDay(
            lastPt.day,
          )}, ${formatFull(first.v)} to ${formatFull(lastPt.v)}`}
          tabIndex={0}
          onPointerMove={(e) => moveTo(e.clientX)}
          onPointerLeave={() => setCursor(null)}
          onFocus={() => setCursor(pts.length - 1)}
          onBlur={() => setCursor(null)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const at = cursor ?? pts.length - 1;
            setCursor(Math.max(0, Math.min(pts.length - 1, at + (e.key === "ArrowRight" ? 1 : -1))));
          }}
        >
          {/* Hairline bounds — recessive, solid, never dashed. */}
          {[geom.min, geom.max].map((v) => (
            <line
              key={v}
              x1={PAD.left}
              x2={w - PAD.right}
              y1={geom.py(v)}
              y2={geom.py(v)}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}

          {pts.length > 1 && (
            <polyline
              points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {(showDots || pts.length === 1) &&
            pts.map((p) => (
              <circle
                key={p.day}
                cx={p.x}
                cy={p.y}
                r={DOT_R}
                fill={color}
                // No surface ring: a ring separates marks of DIFFERENT series,
                // and punching one through a line of the same hue just chews the
                // line into a dashed rule. The hover dot below keeps its ring —
                // there it has to lift off the line.
              />
            ))}

          {active && (
            <>
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD.top - 6}
                y2={H - PAD.bottom}
                className="stroke-muted-foreground"
                strokeWidth={1}
              />
              <circle
                cx={active.x}
                cy={active.y}
                r={DOT_R + 1.5}
                fill={color}
                className="stroke-card"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      )}

      {/* Axis ends — values a reader gets without hovering, so the tooltip only
          ever enhances. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>{formatDayShort(first.day)}</span>
        <span>{series.length > 1 ? formatDayShort(lastPt.day) : ""}</span>
      </div>

      {active && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-center shadow-sm"
          style={{ left: Math.min(w - 44, Math.max(44, active.x)) }}
        >
          <div className="font-mono text-xs font-semibold tabular-nums">
            {formatFull(active.v)}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {formatDayShort(active.day)}
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {active ? `${formatDay(active.day)}: ${formatFull(active.v)}` : ""}
      </span>
    </div>
  );
}

/** Peak of a window, for the row header to label without crowding the plot. */
export function seriesPeak(series: DayPoint[]): string {
  return series.length ? formatCompact(Math.max(...series.map((d) => d.v))) : "—";
}
