import { NextResponse } from 'next/server';
import { getDataApiUrl, dataApiHeaders } from "@/lib/data-api";
import { isAdmin } from "@/lib/auth";
import fallbackArtists from '@/data/artists-fallback.json';
import { getPool } from '@/lib/db';
import { attachMomentum } from '@/lib/momentum';

const pool = getPool();

export async function GET(request: Request) {
  const admin = await isAdmin();
  const params = new URL(request.url).searchParams;
  const group = params.get('group');
  const all = params.get('all') === '1';

  // Roster separation: the default list is ungrouped artists only; a group's
  // members live at ?group=<name>; ?all=1 (bulk tools) spans everything.
  const where: string[] = [];
  const values: string[] = [];
  if (!admin) where.push('is_public = 1');
  if (group) {
    where.push('group_name = ?');
    values.push(group);
  } else if (!all) {
    where.push('group_name IS NULL');
  }
  const sql =
    'SELECT * FROM artists' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY (sort_order IS NULL), sort_order, name';

  try {
    const [rows] = await pool.query(sql, values);
    return NextResponse.json(await attachMomentum(rows as { id: string }[]));
  } catch (error) {
    // No reachable MySQL (e.g. serverless deploy on Vercel) — serve the static
    // snapshot from scripts/export-artists.mjs so the dashboard still loads.
    console.error('Error fetching artists; serving JSON fallback:', error);
    const rows = (fallbackArtists as { is_public?: number; group_name?: string | null }[])
      .filter((a) => admin || a.is_public)
      .filter((a) => (group ? a.group_name === group : all || !a.group_name));
    return NextResponse.json(rows);
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const artistData = await request.json();

  try {
    const response = await fetch(`${await getDataApiUrl()}/insert_artist`, {
      method: 'POST',
      headers: dataApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(artistData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Data API service error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error inserting artist via scraper service:', error);
    return NextResponse.json({ error: 'Failed to insert artist' }, { status: 500 });
  }
}
