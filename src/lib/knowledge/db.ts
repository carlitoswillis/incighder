import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

// Knowledgebase data access. All list/search queries project explicit columns —
// `file` (the original upload blob) is only ever SELECTed by the download
// route. Search is LIKE-based over title/body/summary/tags/artist-name (TiDB
// Serverless has no FULLTEXT).

export interface KbItemMeta {
  id: number;
  kind: string;
  title: string;
  summary: string | null;
  tags: string | null;
  source_url: string | null;
  artist_id: string | null;
  artist_name: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbItem extends KbItemMeta {
  body: string | null;
}

export interface KbSearchHit extends KbItemMeta {
  snippet: string | null;
  score: number;
}

// Exact copy of the CREATE TABLE in data-api/schema.sql — used to lazily
// self-heal when the table doesn't exist yet (mirrors scrape_service.py).
export const KB_TABLE_DDL = `CREATE TABLE IF NOT EXISTS kb_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(16) NOT NULL,          -- 'fact' | 'document' | 'image' | 'link'
    title VARCHAR(512) NOT NULL,
    body LONGTEXT NULL,                 -- searchable text (fact text / extraction)
    summary TEXT NULL,
    tags VARCHAR(512) NULL,             -- comma-separated, lowercase
    source_url VARCHAR(1024) NULL,
    artist_id VARCHAR(255) NULL,
    file_name VARCHAR(255) NULL,
    file_mime VARCHAR(128) NULL,
    file_size INT NULL,
    file LONGBLOB NULL,                 -- original upload, capped ~4MB
    created_by VARCHAR(32) NULL,        -- 'chat' | 'upload' | 'link' | 'manual'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_kb_artist (artist_id, created_at),
    INDEX idx_kb_kind (kind, created_at),
    CONSTRAINT fk_kb_artist FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL
    -- Collation must match artists.id (utf8mb4_unicode_ci) or the FK is
    -- rejected on TiDB (database default utf8mb4_bin, error 3780).
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

// Every meta column except body/file, with the artist name joined in.
const META_COLUMNS = `k.id, k.kind, k.title, k.summary, k.tags, k.source_url,
       k.artist_id, a.name AS artist_name, k.file_name, k.file_mime,
       k.file_size, k.created_by, k.created_at, k.updated_at`;

function isNoTable(e: unknown): boolean {
  return (e as { code?: string }).code === "ER_NO_SUCH_TABLE";
}

function toMeta(r: RowDataPacket): KbItemMeta {
  return {
    id: Number(r.id),
    kind: String(r.kind),
    title: String(r.title),
    summary: r.summary == null ? null : String(r.summary),
    tags: r.tags == null ? null : String(r.tags),
    source_url: r.source_url == null ? null : String(r.source_url),
    artist_id: r.artist_id == null ? null : String(r.artist_id),
    artist_name: r.artist_name == null ? null : String(r.artist_name),
    file_name: r.file_name == null ? null : String(r.file_name),
    file_mime: r.file_mime == null ? null : String(r.file_mime),
    file_size: r.file_size == null ? null : Number(r.file_size),
    created_by: r.created_by == null ? null : String(r.created_by),
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

/** ±120 chars around the first occurrence of any term; leading slice when the
 * match was on title/tags instead of body; null when there's no body. */
function makeSnippet(body: unknown, terms: string[]): string | null {
  if (typeof body !== "string" || !body) return null;
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) {
    return body.length > 240 ? `${body.slice(0, 240)}…` : body;
  }
  const start = Math.max(0, at - 120);
  const end = Math.min(body.length, at + 120);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

export async function searchKb(opts: {
  q?: string;
  artistId?: string;
  kind?: string;
  limit?: number;
}): Promise<KbSearchHit[]> {
  const pool = getPool();
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20) || 20, 1), 50);
  const terms = (opts.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);

  const where: string[] = [];
  const whereValues: string[] = [];
  if (opts.artistId) {
    where.push("k.artist_id = ?");
    whereValues.push(opts.artistId);
  }
  if (opts.kind) {
    where.push("k.kind = ?");
    whereValues.push(opts.kind);
  }

  try {
    if (!terms.length) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT ${META_COLUMNS}
           FROM kb_items k LEFT JOIN artists a ON a.id = k.artist_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY k.created_at DESC LIMIT ${limit}`,
        whereValues,
      );
      return rows.map((r) => ({ ...toMeta(r), snippet: null, score: 0 }));
    }

    // Per term: AND across terms, OR across fields; score in SQL (title ×3,
    // tags ×2, summary ×1, body ×1). Placeholders bind in order of appearance:
    // score expression first (SELECT), then the WHERE filters (artist/kind,
    // pushed above), then the per-term groups.
    const scoreValues: string[] = [];
    const termValues: string[] = [];
    const scoreParts: string[] = [];
    for (const t of terms) {
      const like = `%${t.replace(/[\\%_]/g, "\\$&")}%`;
      scoreParts.push(
        "(CASE WHEN k.title LIKE ? THEN 3 ELSE 0 END" +
          " + CASE WHEN k.tags LIKE ? THEN 2 ELSE 0 END" +
          " + CASE WHEN k.summary LIKE ? THEN 1 ELSE 0 END" +
          " + CASE WHEN k.body LIKE ? THEN 1 ELSE 0 END)",
      );
      scoreValues.push(like, like, like, like);
      where.push(
        "(k.title LIKE ? OR k.body LIKE ? OR k.summary LIKE ? OR k.tags LIKE ? OR a.name LIKE ?)",
      );
      termValues.push(like, like, like, like, like);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${META_COLUMNS}, k.body AS body, ${scoreParts.join(" + ")} AS score
         FROM kb_items k LEFT JOIN artists a ON a.id = k.artist_id
        WHERE ${where.join(" AND ")}
        ORDER BY score DESC, k.created_at DESC LIMIT ${limit}`,
      [...scoreValues, ...whereValues, ...termValues],
    );
    // body was selected only to compute the snippet — strip it from the hit.
    return rows.map((r) => ({
      ...toMeta(r),
      snippet: makeSnippet(r.body, terms),
      score: Number(r.score) || 0,
    }));
  } catch (e) {
    if (isNoTable(e)) return [];
    throw e;
  }
}

export async function getKbItem(id: number): Promise<KbItem | null> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${META_COLUMNS}, k.body AS body
         FROM kb_items k LEFT JOIN artists a ON a.id = k.artist_id
        WHERE k.id = ?`,
      [id],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return { ...toMeta(r), body: r.body == null ? null : String(r.body) };
  } catch (e) {
    if (isNoTable(e)) return null;
    throw e;
  }
}

export async function insertKbItem(item: {
  kind: string;
  title: string;
  body?: string | null;
  summary?: string | null;
  tags?: string | null;
  sourceUrl?: string | null;
  artistId?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileSize?: number | null;
  file?: Buffer | null;
  createdBy?: string | null;
}): Promise<number> {
  const pool = getPool();
  const sql = `INSERT INTO kb_items
      (kind, title, body, summary, tags, source_url, artist_id,
       file_name, file_mime, file_size, file, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const values = [
    item.kind,
    item.title,
    item.body ?? null,
    item.summary ?? null,
    item.tags ?? null,
    item.sourceUrl ?? null,
    item.artistId ?? null,
    item.fileName ?? null,
    item.fileMime ?? null,
    item.fileSize ?? null,
    item.file ?? null,
    item.createdBy ?? null,
  ];
  try {
    const [res] = await pool.query<ResultSetHeader>(sql, values);
    return res.insertId;
  } catch (e) {
    if (!isNoTable(e)) throw e;
    // Lazy self-heal: create the table and retry once (schema.sql may not
    // have been applied to this database yet).
    await pool.query(KB_TABLE_DDL);
    const [res] = await pool.query<ResultSetHeader>(sql, values);
    return res.insertId;
  }
}

export async function updateKbItem(
  id: number,
  patch: Partial<{
    title: string;
    body: string | null;
    summary: string | null;
    tags: string | null;
    sourceUrl: string | null;
    artistId: string | null;
    kind: string;
  }>,
): Promise<boolean> {
  const columns: Record<string, string> = {
    title: "title",
    body: "body",
    summary: "summary",
    tags: "tags",
    sourceUrl: "source_url",
    artistId: "artist_id",
    kind: "kind",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in patch) {
      sets.push(`${column} = ?`);
      values.push(patch[key as keyof typeof patch] ?? null);
    }
  }
  if (!sets.length) return false;
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE kb_items SET ${sets.join(", ")} WHERE id = ?`,
    [...values, id],
  );
  return res.affectedRows > 0;
}

export async function deleteKbItem(id: number): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "DELETE FROM kb_items WHERE id = ?",
    [id],
  );
  return res.affectedRows > 0;
}
