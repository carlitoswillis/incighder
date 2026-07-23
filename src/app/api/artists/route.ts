import { NextResponse } from 'next/server';
import { getDataApiUrl, dataApiHeaders } from "@/lib/data-api";
import { isAdmin } from "@/lib/auth";
import fallbackArtists from '@/data/artists-fallback.json';
import { getPool } from '@/lib/db';

const pool = getPool();

export async function GET() {
  const admin = await isAdmin();
  try {
    // Visitors only see the curated public roster; admins see everything.
    const [rows] = await pool.query(
      admin ? 'SELECT * FROM artists' : 'SELECT * FROM artists WHERE is_public = 1',
    );
    return NextResponse.json(rows);
  } catch (error) {
    // No reachable MySQL (e.g. serverless deploy on Vercel) — serve the static
    // snapshot from scripts/export-artists.mjs so the dashboard still loads.
    console.error('Error fetching artists; serving JSON fallback:', error);
    const all = fallbackArtists as { is_public?: number }[];
    return NextResponse.json(admin ? all : all.filter((a) => a.is_public));
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
