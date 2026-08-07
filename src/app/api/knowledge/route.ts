import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getKbItem, insertKbItem, searchKb } from "@/lib/knowledge/db";
import { extractFromFile, extractTextFromUrl } from "@/lib/knowledge/extract";
import { dataApiHeaders, getDataApiUrl } from "@/lib/data-api";

// GLO knowledgebase: search/list items and create new ones — file uploads
// (vision-extracted), saved links (fetched + stripped), and manual facts.
// Extraction can take up to a minute, hence the generous maxDuration.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const pool = getPool();

// Files up to the blob cap are stored in TiDB (row-size limits apply above
// that); bigger ones — up to MAX_FILE_BYTES — go to the data-api host's disk
// via /kb_store, with only the extracted text kept in the DB. Note the
// deployed (Vercel) site can't receive bodies over ~4.5MB at the platform
// edge, so big uploads only work when the app runs on the same machine.
const DB_BLOB_MAX = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 24 * 1024 * 1024;
const KINDS = ["fact", "document", "image", "link"];

async function storeBigFile(b64: string, fileName?: string): Promise<string> {
  const url = await getDataApiUrl();
  const res = await fetch(`${url}/kb_store`, {
    method: "POST",
    headers: dataApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ data_b64: b64, file_name: fileName ?? null }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !data.path) {
    throw new Error(
      data.error || `File is over 4 MB and the data-api file store is unavailable (${res.status})`,
    );
  }
  return data.path;
}

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
        return NextResponse.json({ error: "File too large (24 MB max)" }, { status: 413 });
      }
      const mime =
        typeof body.file_mime === "string" && body.file_mime
          ? body.file_mime
          : "application/octet-stream";
      const fileName = typeof body.file_name === "string" ? body.file_name : undefined;

      // Store the original first: an oversized file that can't be stored
      // should fail fast, before a minute of extraction.
      const filePath =
        file.length > DB_BLOB_MAX ? await storeBigFile(b64, fileName) : null;

      let extraction;
      if (mime.startsWith("text/")) {
        // Already text — no vision pass needed (a 6MB transcript would also
        // blow the extraction model's limits). Cap what we index for search.
        const text = file.toString("utf8").slice(0, 200_000);
        extraction = {
          title: fileName?.replace(/\.[^.]+$/, "") || "",
          text,
          summary: "",
          tags: [],
          suggestedArtist: null,
        };
      } else {
        try {
          extraction = await extractFromFile({ b64, mime, fileName });
        } catch (err) {
          // Don't leave an orphaned original on the data-api host when the
          // item was never created.
          if (filePath) {
            fetch(
              `${await getDataApiUrl()}/kb_file/${encodeURIComponent(filePath)}`,
              { method: "DELETE", headers: dataApiHeaders(), signal: AbortSignal.timeout(10_000) },
            ).catch(() => {});
          }
          throw err;
        }
      }
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
        file: filePath ? null : file,
        filePath,
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
