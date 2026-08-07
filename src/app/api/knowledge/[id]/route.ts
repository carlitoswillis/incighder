import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { deleteKbItem, getKbItem, updateKbItem } from "@/lib/knowledge/db";
import { dataApiHeaders, getDataApiUrl } from "@/lib/data-api";

const pool = getPool();

const KINDS = ["fact", "document", "image", "link"];

function normalizeTags(tags: unknown): string | null {
  const list = Array.isArray(tags)
    ? tags.map(String)
    : typeof tags === "string"
      ? tags.split(",")
      : [];
  const uniq = [...new Set(list.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  return uniq.length ? uniq.join(",") : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const item = await getKbItem(Number(id));
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Knowledge item fetch failed:", e);
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const body = await request.json();
    const patch: Parameters<typeof updateKbItem>[1] = {};

    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if ("body" in body) patch.body = typeof body.body === "string" ? body.body : null;
    if ("summary" in body) {
      patch.summary = typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : null;
    }
    if ("tags" in body) patch.tags = normalizeTags(body.tags);
    if ("source_url" in body) {
      patch.sourceUrl =
        typeof body.source_url === "string" && body.source_url.trim()
          ? body.source_url.trim()
          : null;
    }
    if ("kind" in body) {
      if (!KINDS.includes(body.kind)) {
        return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
      }
      patch.kind = body.kind;
    }
    if ("artist_id" in body) {
      const artistId =
        typeof body.artist_id === "string" && body.artist_id.trim()
          ? body.artist_id.trim()
          : null;
      if (artistId) {
        const [rows] = await pool.query<RowDataPacket[]>(
          "SELECT id FROM artists WHERE id = ?",
          [artistId],
        );
        if (!rows.length) {
          return NextResponse.json({ error: "Unknown artist_id" }, { status: 400 });
        }
      }
      patch.artistId = artistId;
    }
    if ("group_name" in body) {
      const groupName =
        typeof body.group_name === "string" && body.group_name.trim()
          ? body.group_name.trim()
          : null;
      if (groupName) {
        const [rows] = await pool.query<RowDataPacket[]>(
          "SELECT 1 FROM artists WHERE group_name = ? LIMIT 1",
          [groupName],
        );
        if (!rows.length) {
          return NextResponse.json({ error: "Unknown group_name" }, { status: 400 });
        }
      }
      patch.groupName = groupName;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await updateKbItem(Number(id), patch);
    const item = await getKbItem(Number(id));
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Knowledge item update failed:", e);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    // Originals over the blob cap live on the data-api host — clean that
    // file up too (best-effort; an unreachable data-api shouldn't block the
    // DB delete).
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT file_path FROM kb_items WHERE id = ?",
      [Number(id)],
    );
    const filePath = rows.length ? rows[0].file_path : null;
    const ok = await deleteKbItem(Number(id));
    if (!ok) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (filePath) {
      try {
        await fetch(
          `${await getDataApiUrl()}/kb_file/${encodeURIComponent(String(filePath))}`,
          { method: "DELETE", headers: dataApiHeaders(), signal: AbortSignal.timeout(10_000) },
        );
      } catch (cleanupErr) {
        console.error("Orphaned kb file on data-api host:", filePath, cleanupErr);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Knowledge item delete failed:", e);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
