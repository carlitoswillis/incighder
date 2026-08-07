import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { deleteKbItem, getKbItem, updateKbItem } from "@/lib/knowledge/db";

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
    const ok = await deleteKbItem(Number(id));
    if (!ok) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Knowledge item delete failed:", e);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
