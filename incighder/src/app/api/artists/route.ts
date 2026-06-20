import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'db',
  database: process.env.DB_NAME || 'incighder',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

export async function GET() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM artists');
    client.release();
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching artists:', error);
    return NextResponse.json({ error: 'Failed to fetch artists' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const artistData = await request.json();

  try {
    const response = await fetch('http://data-api:5000/insert_artist', {
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
