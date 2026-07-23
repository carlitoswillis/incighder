import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

// Fetch an artist's biography from Last.fm (artist.getInfo) and store it.
// Native TS — works on Vercel with no data-api. Manual edits go through the
// normal PATCH route; this only handles the "pull from Last.fm" button.

const pool = getPool();

function cleanBio(html: string): string {
  return html
    .replace(/<a href="[^"]*">Read more on Last\.fm<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/User-contributed text is available under[\s\S]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { artist_id } = await request.json().catch(() => ({}));
  if (!artist_id) return NextResponse.json({ error: "artist_id is required" }, { status: 400 });

  const key = process.env.LAST_FM_API_KEY;
  if (!key) return NextResponse.json({ error: "LAST_FM_API_KEY not configured" }, { status: 500 });

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT name FROM artists WHERE id = ?",
      [artist_id],
    );
    if (!rows.length) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    const name = rows[0].name as string;

    const url =
      "https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&autocorrect=1&format=json" +
      `&api_key=${key}&artist=${encodeURIComponent(name)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await r.json();

    const raw: string | undefined = data?.artist?.bio?.content || data?.artist?.bio?.summary;
    const bio = raw ? cleanBio(raw) : "";
    if (!bio) {
      return NextResponse.json(
        { error: `Last.fm has no bio for "${name}" — write one in the editor instead` },
        { status: 404 },
      );
    }

    await pool.query("UPDATE artists SET bio = ?, bio_source = 'lastfm' WHERE id = ?", [
      bio,
      artist_id,
    ]);
    const [updated] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM artists WHERE id = ?",
      [artist_id],
    );
    return NextResponse.json(updated[0]);
  } catch (e) {
    console.error("Bio fetch failed:", e);
    return NextResponse.json({ error: "Failed to fetch bio" }, { status: 500 });
  }
}
