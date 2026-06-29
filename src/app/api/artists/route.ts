import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  user: process.env.DB_USER || 'incighder',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'incighder',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '3306', 10),
});

export async function GET() {
  try {
    const [rows] = await pool.query('SELECT * FROM artists');
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching artists:', error);
    return NextResponse.json({ error: 'Failed to fetch artists' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const artistData = await request.json();

  try {
    const response = await fetch('http://127.0.0.1:5050/insert_artist', {
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
