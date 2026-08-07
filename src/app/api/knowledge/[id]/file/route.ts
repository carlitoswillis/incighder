import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { dataApiHeaders, getDataApiUrl } from "@/lib/data-api";

// Download the original uploaded file for a knowledgebase item. This is the
// ONLY place `file` is ever SELECTed — everywhere else projects explicit
// columns to keep blobs off the wire. Originals over the blob cap live on
// the data-api host (kb_items.file_path) and are proxied from there.

const pool = getPool();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT file, file_path, file_name, file_mime FROM kb_items WHERE id = ?",
      [Number(id)],
    );
    if (!rows.length || (rows[0].file == null && !rows[0].file_path)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const row = rows[0];
    let bytes: Uint8Array;
    if (row.file != null) {
      bytes = new Uint8Array(row.file as Buffer);
    } else {
      const upstream = await fetch(
        `${await getDataApiUrl()}/kb_file/${encodeURIComponent(String(row.file_path))}`,
        { headers: dataApiHeaders(), signal: AbortSignal.timeout(60_000) },
      );
      if (!upstream.ok) {
        return NextResponse.json(
          { error: "Original is stored on the data-api host, which is unreachable" },
          { status: 502 },
        );
      }
      bytes = new Uint8Array(await upstream.arrayBuffer());
    }
    const fileName = String(row.file_name || "download").replace(/["\\\r\n]/g, "_");
    const mime = String(row.file_mime || "application/octet-stream");
    // The stored MIME comes from the uploader — rendering e.g. text/html or
    // image/svg+xml inline would execute stored markup on our origin (XSS).
    // Only known-inert types render inline; everything else downloads.
    const inlineSafe =
      /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/(plain|csv|markdown)|audio\/|video\/)/i.test(
        mime,
      );
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `${inlineSafe ? "inline" : "attachment"}; filename="${fileName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ER_NO_SUCH_TABLE") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    console.error("Knowledge file fetch failed:", e);
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
}
