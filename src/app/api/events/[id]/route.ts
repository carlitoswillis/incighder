import { NextResponse } from "next/server";
import { ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

const pool = getPool();

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const [res] = await pool.query<ResultSetHeader>("DELETE FROM events WHERE id = ?", [id]);
    if (res.affectedRows === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Event delete failed:", e);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
