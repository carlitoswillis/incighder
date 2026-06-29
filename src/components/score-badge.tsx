"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Visualizes the 0–200 artist score (utils/score.ts) as a cyan progress ring. */
export function ScoreBadge({
  score,
  breakdown,
  size = "default",
}: {
  score: number;
  breakdown?: string;
  size?: "default" | "lg";
}) {
  const pct = Math.max(0, Math.min(1, score / 200));
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
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
            score
          </span>
        )}
      </div>
    </div>
  );

  if (!breakdown) return ring;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-help" />}>
        {ring}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-line text-left">
        {breakdown}
      </TooltipContent>
    </Tooltip>
  );
}
