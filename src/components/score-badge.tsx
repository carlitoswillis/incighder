"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Traction dial (0–max, default 100) with an optional Trajectory chip beneath it.
 * Pass `trajectoryLabel` (even as null) to opt into the two-signal display: the
 * chip shows growth direction; a null label reads as "—" (no history yet).
 */
export function ScoreBadge({
  score,
  breakdown,
  max = 100,
  trajectory,
  trajectoryLabel,
  trajectoryTitle,
  size = "default",
}: {
  score: number;
  breakdown?: string;
  max?: number;
  /** Signed weekly %; sets the chip color. */
  trajectory?: number | null;
  /** Chip text; pass (incl. null) to render the chip at all. */
  trajectoryLabel?: string | null;
  trajectoryTitle?: string;
  size?: "default" | "lg";
}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? score / max : 0));
  const dim = size === "lg" ? 64 : 48;
  const stroke = size === "lg" ? 6 : 5;
  const r = (dim - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const ring = (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: dim, height: dim }}
    >
      <svg width={dim} height={dim} className="-rotate-90">
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-secondary"
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          className="stroke-primary"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "font-semibold leading-none tabular-nums",
            size === "lg" ? "text-lg" : "text-sm",
          )}
        >
          {Math.round(score)}
        </span>
        {size === "lg" && (
          <span className="text-[8px] uppercase tracking-tight text-muted-foreground">
            traction
          </span>
        )}
      </div>
    </div>
  );

  const dial = !breakdown ? (
    ring
  ) : (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-help" />}>
        {ring}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-line text-left">
        {breakdown}
      </TooltipContent>
    </Tooltip>
  );

  // trajectoryLabel === undefined → caller opted out; render the dial alone
  // exactly as before (keeps every existing single-score call unchanged).
  if (trajectoryLabel === undefined) return dial;

  const up = trajectory != null && trajectory > 0.05;
  const down = trajectory != null && trajectory < -0.05;

  return (
    <div className="flex flex-col items-center gap-1">
      {dial}
      <span
        title={trajectoryTitle}
        className={cn(
          "inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums leading-none",
          up
            ? "bg-emerald-500/10 text-emerald-400"
            : down
              ? "bg-rose-500/10 text-rose-400"
              : "text-muted-foreground",
        )}
      >
        {up && <TrendingUp className="size-3" aria-hidden />}
        {down && <TrendingDown className="size-3" aria-hidden />}
        {trajectoryLabel ?? "—"}
      </span>
    </div>
  );
}
