import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

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
