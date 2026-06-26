import { Pool } from "pg";

// Standalone pool for server-side metadata reads (generateMetadata runs outside
// the request route handlers). Mirrors the config in the artist API routes.
// Reused across hot-reloads via a global so we don't leak connections in dev.
const globalForPool = globalThis as unknown as { _metaPool?: Pool };
const pool =
  globalForPool._metaPool ??
  new Pool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "db",
    database: process.env.DB_NAME || "incighder",
    password: process.env.DB_PASSWORD || "password",
    port: parseInt(process.env.DB_PORT || "5432", 10),
  });
if (process.env.NODE_ENV !== "production") globalForPool._metaPool = pool;

export interface ArtistMeta {
  name: string;
  image: string | null;
  genres: string[];
}

/** Minimal artist fields for link-preview / tab metadata. null if not found. */
export async function getArtistMeta(id: string): Promise<ArtistMeta | null> {
  try {
    const { rows } = await pool.query(
      "SELECT name, images, genres FROM artists WHERE id = $1",
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
