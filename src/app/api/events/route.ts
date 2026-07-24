import { NextResponse } from "next/server";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

// Campaign/event tracking. GET returns an artist's events with per-platform
// impact computed against metric_snapshots: baseline = last snapshot at or
// before the event, after = last snapshot within the attribution window.
// "This release drove +12% IG, +8% Spotify" — the story no single platform
// dashboard can tell.

const pool = getPool();

const ATTRIBUTION_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

const EVENT_TYPES = ["release", "video", "reel", "post", "show", "announcement", "press", "other"];

interface Impact {
  platform: string;
  before: number;
  after: number;
  change: number;
  pct: number | null;
  window_open: boolean;
}

function computeImpact(
  snaps: { platform: string; key: string | null; v: number; t: number }[],
  eventMs: number,
): Impact[] {
  const byPlatform = new Map<string, typeof snaps>();
  for (const s of snaps) {
    const list = byPlatform.get(s.platform) ?? [];
    list.push(s);
    byPlatform.set(s.platform, list);
  }
  const windowEnd = eventMs + ATTRIBUTION_DAYS * DAY_MS;
  const out: Impact[] = [];
  for (const [platform, series] of byPlatform) {
    const currentKey = series[series.length - 1].key;
    const pts = series.filter((s) => s.key === currentKey);
    // Baseline: last reading up to a day after the event (a scrape the next
    // morning is still effectively "at" the event).
    const baseline = [...pts].reverse().find((p) => p.t <= eventMs + DAY_MS);
    const after = [...pts].reverse().find((p) => p.t <= windowEnd);
    if (!baseline || !after || after.t <= baseline.t) continue;
    out.push({
      platform,
      before: baseline.v,
      after: after.v,
      change: after.v - baseline.v,
      pct: baseline.v > 0 ? ((after.v - baseline.v) / baseline.v) * 100 : null,
      window_open: Date.now() < windowEnd,
    });
  }
  return out.sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));
}

export async function GET(request: Request) {
  const artistId = new URL(request.url).searchParams.get("artist_id");
  if (!artistId) return NextResponse.json([], { status: 200 });

  try {
    if (!(await isAdmin())) {
      const [vis] = await pool.query<RowDataPacket[]>(
        "SELECT is_public FROM artists WHERE id = ?",
        [artistId],
      );
      if (!vis.length || !vis[0].is_public) return NextResponse.json([]);
    }

    const [events] = await pool.query<RowDataPacket[]>(
      `SELECT e.*,
              (SELECT COUNT(*) - 1 FROM event_artists x WHERE x.event_id = e.id) AS shared_with,
              (SELECT GROUP_CONCAT(a.name ORDER BY a.name SEPARATOR ', ')
                 FROM event_artists x JOIN artists a ON a.id = x.artist_id
                WHERE x.event_id = e.id AND x.artist_id <> ?) AS shared_names
         FROM events e
         JOIN event_artists ea ON ea.event_id = e.id
        WHERE ea.artist_id = ?
        ORDER BY e.happened_at DESC, e.id DESC`,
      [artistId, artistId],
    );
    if (!events.length) return NextResponse.json([]);

    const [snapRows] = await pool.query<RowDataPacket[]>(
      `SELECT platform, account_key, value, captured_at FROM metric_snapshots
       WHERE artist_id = ? ORDER BY captured_at`,
      [artistId],
    );
    const snaps = snapRows.map((s) => ({
      platform: s.platform as string,
      key: s.account_key as string | null,
      v: Number(s.value),
      t: new Date(s.captured_at).getTime(),
    }));

    return NextResponse.json(
      events.map((e) => ({
        ...e,
        impact: computeImpact(snaps, new Date(e.happened_at).getTime()),
      })),
    );
  } catch (e) {
    console.error("Events fetch failed:", e);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { artist_id, artist_ids, title, event_type, url, happened_at, notes } =
      await request.json();
    // One event, any number of people (a group video tags the whole crew).
    const ids: string[] = [
      ...new Set([...(Array.isArray(artist_ids) ? artist_ids : []), artist_id].filter(Boolean)),
    ];
    if (!ids.length || !title || !happened_at) {
      return NextResponse.json(
        { error: "artist_id(s), title and happened_at are required" },
        { status: 400 },
      );
    }
    const type = EVENT_TYPES.includes(event_type) ? event_type : "other";
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO events (artist_id, title, event_type, url, happened_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ids[0], title, type, url || null, happened_at, notes || null],
    );
    await pool.query(
      `INSERT IGNORE INTO event_artists (event_id, artist_id) VALUES ${ids
        .map(() => "(?, ?)")
        .join(", ")}`,
      ids.flatMap((a) => [res.insertId, a]),
    );
    const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM events WHERE id = ?", [
      res.insertId,
    ]);
    return NextResponse.json(rows[0]);
  } catch (e) {
    console.error("Event create failed:", e);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}
