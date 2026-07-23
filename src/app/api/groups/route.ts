import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '@/lib/db';
import { isAdmin } from '@/lib/auth';

const pool = getPool();

// Distinct artist groups with member counts, for the group chips on the home
// page and /g/<name> headers. Visitors only count public members (and groups
// with zero public members disappear entirely).
export async function GET() {
  const admin = await isAdmin();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT group_name, COUNT(*) AS count FROM artists
       WHERE group_name IS NOT NULL ${admin ? '' : 'AND is_public = 1'}
       GROUP BY group_name ORDER BY group_name`,
    );
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([]);
  }
}
