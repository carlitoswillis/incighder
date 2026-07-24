import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { linkedPlatforms } from "@/lib/linked";

// Server-side momentum: median weekly audience growth % across each artist's
// tracked platforms (currently-linked account only), from metric_snapshots.
// Attached to artist rows as momentum_wk_pct; null = no usable history yet.

interface Snap {
  platform: string;
  key: string | null;
  v: number;
  t: number;
}

const DAY_MS = 24 * 3600 * 1000;

function weeklyPct(series: Snap[]): number | null {
  const currentKey = series[series.length - 1].key;
  const pts = series.filter((s) => s.key === currentKey);
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const spanMs = last.t - first.t;
  // Sub-day spans produce absurd annualized-style numbers; wait for real data.
  if (spanMs < DAY_MS || first.v <= 0) return null;
  const weeks = spanMs / (7 * DAY_MS);
  return ((last.v - first.v) / first.v) * 100 / weeks;
}

export async function attachMomentum<
  T extends { id: string; social_links?: unknown; spotify_id?: unknown },
>(rows: T[]): Promise<(T & { momentum_wk_pct: number | null })[]> {
  if (!rows.length) return rows as (T & { momentum_wk_pct: number | null })[];
  const ids = rows.map((r) => r.id);
  const [snaps] = await getPool().query<RowDataPacket[]>(
    `SELECT artist_id, platform, account_key, value, captured_at FROM metric_snapshots
     WHERE artist_id IN (${ids.map(() => "?").join(",")}) ORDER BY captured_at`,
    ids,
  );

  const byArtist = new Map<string, Map<string, Snap[]>>();
  for (const s of snaps) {
    const platforms = byArtist.get(s.artist_id) ?? new Map<string, Snap[]>();
    const list = platforms.get(s.platform) ?? [];
    list.push({
      platform: s.platform,
      key: s.account_key,
      v: Number(s.value),
      t: new Date(s.captured_at).getTime(),
    });
    platforms.set(s.platform, list);
    byArtist.set(s.artist_id, platforms);
  }

  return rows.map((row) => {
    const platforms = byArtist.get(row.id);
    const pcts: number[] = [];
    if (platforms) {
      // Snapshots from a since-cleared source must not move momentum.
      const linked = linkedPlatforms(row);
      for (const [platform, series] of platforms) {
        if (!linked.has(platform)) continue;
        const p = weeklyPct(series);
        if (p !== null) pcts.push(p);
      }
    }
    let momentum: number | null = null;
    if (pcts.length) {
      pcts.sort((a, b) => a - b);
      const mid = Math.floor(pcts.length / 2);
      momentum =
        pcts.length % 2 ? pcts[mid] : (pcts[mid - 1] + pcts[mid]) / 2;
    }
    return { ...row, momentum_wk_pct: momentum };
  });
}
