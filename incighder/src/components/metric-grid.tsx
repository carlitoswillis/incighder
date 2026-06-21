import type { Artist } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { StatTile } from "@/components/stat-tile";

export function MetricGrid({ artist }: { artist: Artist }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PLATFORMS.map((p) => (
        <StatTile key={p.key} platform={p} artist={artist} />
      ))}
    </div>
  );
}
