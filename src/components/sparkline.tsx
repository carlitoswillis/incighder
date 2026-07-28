import type { DayPoint } from "@/lib/series";
import type { CSSProperties } from "react";

// Compact trend mark for rows and the printed one-sheets. Same reading as the
// full GrowthChart — real time on the x axis, a dot per scrape day — at a size
// that fits a table row. Static: the row's numbers carry the values, and in
// print there is nothing to hover.
export function Sparkline({
  series,
  color,
  printColor,
  width = 96,
  height = 28,
  className,
}: {
  series: DayPoint[];
  /** Series hue for the line and dots; omit to colour by trend direction. */
  color?: string;
  /** Hue to use on light/printed surfaces, when the brand one is too pale. */
  printColor?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (series.length < 2) return null;

  const pad = 3;
  const xs = series.map((d) => Date.parse(`${d.day}T12:00:00Z`));
  const xSpan = xs[xs.length - 1] - xs[0] || 1;
  const vs = series.map((d) => d.v);
  const min = Math.min(...vs);
  const span = Math.max(...vs) - min || 1;
  const pts = series.map((d, i) => ({
    day: d.day,
    x: pad + ((xs[i] - xs[0]) / xSpan) * (width - 2 * pad),
    y: height - pad - ((d.v - min) / span) * (height - 2 * pad),
  }));

  const up = vs[vs.length - 1] >= vs[0];
  const trend = up ? "stroke-emerald-400" : "stroke-rose-400";
  const trendFill = up ? "fill-emerald-400" : "fill-rose-400";
  // Below ~4px apart the dots merge into a smear and stop meaning anything.
  const showDots = (width - 2 * pad) / (pts.length - 1) >= 4;

  return (
    <svg
      width={width}
      height={height}
      className={color ? `mark ${className ?? ""}` : className}
      style={
        color
          ? ({ "--mark": color, "--mark-print": printColor ?? color } as CSSProperties)
          : undefined
      }
      aria-hidden
    >
      <polyline
        points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        stroke={color ? "currentColor" : undefined}
        className={color ? undefined : trend}
      />
      {showDots &&
        pts.map((p) => (
          <circle
            key={p.day}
            cx={p.x}
            cy={p.y}
            r={1.6}
            fill={color ? "currentColor" : undefined}
            className={color ? undefined : trendFill}
          />
        ))}
    </svg>
  );
}
