import { NextResponse } from 'next/server';
import { DATA_API_URL } from "@/lib/data-api";
import fallbackArtists from '@/data/artists-fallback.json';
import { getPool } from '@/lib/db';

const pool = getPool();

export async function GET() {
  try {
    const [rows] = await pool.query('SELECT * FROM artists');
    return NextResponse.json(rows);
  } catch (error) {
    // No reachable MySQL (e.g. serverless deploy on Vercel) — serve the static
    // snapshot from scripts/export-artists.mjs so the dashboard still loads.
    console.error('Error fetching artists; serving JSON fallback:', error);
    return NextResponse.json(fallbackArtists);
  }
}

export async function POST(request: Request) {
  const artistData = await request.json();

  try {
    const response = await fetch(`${DATA_API_URL}/insert_artist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
