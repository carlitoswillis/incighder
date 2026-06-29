import type { PlatformMeta } from "@/lib/platforms";
import type { Artist } from "@/lib/types";
import { formatCompact, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A single platform's metric: brand icon + label + compact value (+ optional sub/extra). */
export function StatTile({
  platform,
  artist,
  className,
}: {
  platform: PlatformMeta;
  artist: Artist;
  className?: string;
}) {
  const Icon = platform.Icon;
  const value = artist[platform.metric.field] as number | null | undefined;
  const extra = platform.extra
    ? (artist[platform.extra.field] as number | null | undefined)
    : null;
  const subTitle = platform.sub
    ? (artist[platform.sub.titleField] as string | null | undefined)
    : null;
  const subValue = platform.sub
    ? (artist[platform.sub.valueField] as number | null | undefined)
    : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg bg-secondary/40 p-3 ring-1 ring-inset ring-border/60",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" style={{ color: platform.color }} aria-hidden />
        {platform.label}
      </div>
      <div className="text-lg font-semibold tabular-nums" title={formatFull(value)}>
        {formatCompact(value)}
        {extra != null && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {formatCompact(extra)} {platform.extra!.label}
          </span>
        )}
      </div>
      {subTitle && (
        <div className="truncate text-xs text-muted-foreground" title={subTitle}>
          {subTitle}
          {subValue != null
            ? ` · ${formatCompact(subValue)} ${platform.sub!.valueLabel}`
            : ""}
        </div>
      )}
    </div>
  );
}
