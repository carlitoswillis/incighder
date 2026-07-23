import type { Artist } from "@/lib/types";
import { PLATFORMS, platformHasPresence } from "@/lib/platforms";
import { StatTile } from "@/components/stat-tile";

export function MetricGrid({ artist }: { artist: Artist }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PLATFORMS.filter((p) => platformHasPresence(artist, p)).map((p) => (
        <StatTile key={p.key} platform={p} artist={artist} />
      ))}
    </div>
  );
}
