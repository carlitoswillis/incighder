import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

// Server-side metadata reads (generateMetadata runs outside the request route
// handlers). Shares the app-wide pool from lib/db.
const pool = getPool();

export interface ArtistMeta {
  name: string;
  image: string | null;
  genres: string[];
}

/** Minimal artist fields for link-preview / tab metadata. null if not found. */
export async function getArtistMeta(id: string): Promise<ArtistMeta | null> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT name, images, genres FROM artists WHERE id = ?",
      [id],
    );
    if (!rows.length) return null;
    const row = rows[0];

    // images is a json column → already an array of { url } (or occasionally a
    // bare string). Pull the first usable URL.
    let image: string | null = null;
    const imgs = row.images;
    const first = Array.isArray(imgs) ? imgs[0] : imgs;
    if (typeof first === "string") image = first;
    else if (first && typeof first.url === "string") image = first.url;

    const genres = (row.genres ?? "")
      .replace(/[[\]"']/g, "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    return { name: row.name, image, genres };
  } catch (e) {
    console.error("getArtistMeta failed:", e);
    return null;
  }
}
