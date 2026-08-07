import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getKbItem, insertKbItem, searchKb } from "@/lib/knowledge/db";
import { extractFromFile, extractTextFromUrl } from "@/lib/knowledge/extract";

// GLO knowledgebase: search/list items and create new ones — file uploads
// (vision-extracted), saved links (fetched + stripped), and manual facts.
// Extraction can take up to a minute, hence the generous maxDuration.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const pool = getPool();

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const KINDS = ["fact", "document", "image", "link"];

function normalizeTags(tags: unknown, extra: string[] = []): string | null {
  const provided = Array.isArray(tags)
    ? tags.map(String)
    : typeof tags === "string"
      ? tags.split(",")
      : [];
  const all = [...provided, ...extra]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const uniq = [...new Set(all)];
  return uniq.length ? uniq.join(",") : null;
}

async function artistExists(id: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM artists WHERE id = ?",
    [id],
  );
  return rows.length > 0;
}

async function groupExists(name: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM artists WHERE group_name = ? LIMIT 1",
    [name],
  );
  return rows.length > 0;
}

/** Exact case-insensitive name match — attach only when unambiguous. */
async function artistIdByName(name: string): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM artists WHERE LOWER(name) = LOWER(?)",
    [name],
  );
  return rows.length === 1 ? String(rows[0].id) : null;
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const limitRaw = parseInt(params.get("limit") || "", 10);
    const items = await searchKb({
      q: params.get("q") || undefined,
      artistId: params.get("artist_id") || undefined,
      group: params.get("group") || undefined,
      kind: params.get("kind") || undefined,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    });
    return NextResponse.json({ items });
  } catch (e) {
    console.error("Knowledge search failed:", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const providedTitle = typeof body.title === "string" ? body.title.trim() : "";

    let artistId: string | null =
      typeof body.artist_id === "string" && body.artist_id.trim()
        ? body.artist_id.trim()
        : null;
    if (artistId && !(await artistExists(artistId))) {
      return NextResponse.json({ error: "Unknown artist_id" }, { status: 400 });
    }

    const groupName: string | null =
      typeof body.group_name === "string" && body.group_name.trim()
        ? body.group_name.trim()
        : null;
    if (groupName && !(await groupExists(groupName))) {
      return NextResponse.json({ error: "Unknown group_name" }, { status: 400 });
    }

    let id: number;

    if (typeof body.file_b64 === "string" && body.file_b64) {
      const b64 = body.file_b64.replace(/^data:[^;]*;base64,/, "");
      const file = Buffer.from(b64, "base64");
      if (!file.length) {
        return NextResponse.json({ error: "Empty file" }, { status: 400 });
      }
      if (file.length > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File too large (4 MB max)" }, { status: 413 });
      }
      const mime =
        typeof body.file_mime === "string" && body.file_mime
          ? body.file_mime
          : "application/octet-stream";
      const fileName = typeof body.file_name === "string" ? body.file_name : undefined;

      const extraction = await extractFromFile({ b64, mime, fileName });
      if (!artistId && extraction.suggestedArtist) {
        artistId = await artistIdByName(extraction.suggestedArtist);
      }
      id = await insertKbItem({
        kind: mime.startsWith("image/") ? "image" : "document",
        title: providedTitle || extraction.title || fileName || "Untitled",
        body: extraction.text || null,
        summary:
          (typeof body.summary === "string" && body.summary.trim()) ||
          extraction.summary ||
          null,
        tags: normalizeTags(body.tags, extraction.tags),
        sourceUrl: typeof body.source_url === "string" ? body.source_url : null,
        artistId,
        groupName,
        fileName: fileName ?? null,
        fileMime: mime,
        fileSize: file.length,
        file,
        createdBy: "upload",
      });
    } else if (typeof body.source_url === "string" && body.source_url.trim()) {
      const sourceUrl = body.source_url.trim();
      const { title, text } = await extractTextFromUrl(sourceUrl);
      id = await insertKbItem({
        kind: "link",
        title: providedTitle || title || sourceUrl,
        body: text || null,
        summary: typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : null,
        tags: normalizeTags(body.tags),
        sourceUrl,
        artistId,
        groupName,
        createdBy: "link",
      });
    } else {
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (!text && !providedTitle) {
        return NextResponse.json(
          { error: "body or title is required" },
          { status: 400 },
        );
      }
      const kind =
        typeof body.kind === "string" && KINDS.includes(body.kind) ? body.kind : "fact";
      id = await insertKbItem({
        kind,
        title: providedTitle || text.slice(0, 80),
        body: text || null,
        summary: typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : null,
        tags: normalizeTags(body.tags),
        artistId,
        groupName,
        createdBy: "manual",
      });
    }

    const item = await getKbItem(id);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Knowledge create failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create item" },
      { status: 500 },
    );
  }
}
