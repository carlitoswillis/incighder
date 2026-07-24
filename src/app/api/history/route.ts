import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { linkedPlatforms } from "@/lib/linked";

// Per-platform follower time series for the CURRENTLY-linked account only.
// Native port of the data-api's metric_history — reads metric_snapshots
// straight from the DB, so growth renders even when the data-api is offline.
// Public: growth charts appear on visitor-facing artist pages.

const pool = getPool();

interface Point {
  t: string;
  v: number;
}

export async function GET(request: Request) {
  const artistId = new URL(request.url).searchParams.get("artist_id");
  if (!artistId) return NextResponse.json({}, { status: 200 });

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT platform, account_key, captured_at, value FROM metric_snapshots
       WHERE artist_id = ? ORDER BY captured_at`,
      [artistId],
    );

    // Snapshots outlive the link they came from — clearing a source removes the
    // link but keeps its history, so an unlinked platform would otherwise go on
    // rendering a Growth tile. Only report platforms the artist is still on.
    const [artistRows] = await pool.query<RowDataPacket[]>(
      "SELECT social_links, spotify_id FROM artists WHERE id = ?",
      [artistId],
    );
    const linked = artistRows.length
      ? linkedPlatforms(artistRows[0] as { social_links?: unknown; spotify_id?: unknown })
      : null;

    const byPlatform = new Map<string, { key: string | null; t: string; v: number }[]>();
    for (const r of rows) {
      const list = byPlatform.get(r.platform) ?? [];
      list.push({
        key: r.account_key,
        t: new Date(r.captured_at).toISOString(),
        v: Number(r.value),
      });
      byPlatform.set(r.platform, list);
    }

    const out: Record<string, unknown> = {};
    for (const [platform, series] of byPlatform) {
      if (linked && !linked.has(platform)) continue;
      const currentKey = series[series.length - 1].key; // most recent account wins
      const points: Point[] = series
        .filter((s) => s.key === currentKey)
        .map((s) => ({ t: s.t, v: s.v }));
      if (points.length) {
        out[platform] = {
          account_key: currentKey,
          points,
          current: points[points.length - 1].v,
          first: points[0].v,
          change: points[points.length - 1].v - points[0].v,
          since: points[0].t,
        };
      }
    }
    return NextResponse.json(out);
  } catch (e) {
    console.error("History query failed:", e);
    return NextResponse.json({}, { status: 200 });
  }
}
