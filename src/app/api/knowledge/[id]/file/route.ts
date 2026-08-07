import { NextResponse } from "next/server";
import { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

// Download the original uploaded file for a knowledgebase item. This is the
// ONLY place `file` is ever SELECTed — everywhere else projects explicit
// columns to keep blobs off the wire.

const pool = getPool();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT file, file_name, file_mime FROM kb_items WHERE id = ?",
      [Number(id)],
    );
    if (!rows.length || rows[0].file == null) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const row = rows[0];
    const fileName = String(row.file_name || "download").replace(/["\\\r\n]/g, "_");
    const mime = String(row.file_mime || "application/octet-stream");
    // The stored MIME comes from the uploader — rendering e.g. text/html or
    // image/svg+xml inline would execute stored markup on our origin (XSS).
    // Only known-inert types render inline; everything else downloads.
    const inlineSafe =
      /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/(plain|csv|markdown)|audio\/|video\/)/i.test(
        mime,
      );
    return new NextResponse(new Uint8Array(row.file as Buffer), {
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
