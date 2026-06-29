import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { cn } from "@/lib/utils";

const META = new Map(PLATFORMS.map((p) => [p.key, p]));

export function PlatformIcon({
  platform,
  className,
  brand = true,
}: {
  platform: PlatformKey;
  className?: string;
  brand?: boolean;
}) {
  const meta = META.get(platform);
  if (!meta) return null;
  const Icon = meta.Icon;
  return (
    <Icon
      className={cn("size-4", className)}
      style={brand ? { color: meta.color } : undefined}
      aria-hidden
    />
  );
}
