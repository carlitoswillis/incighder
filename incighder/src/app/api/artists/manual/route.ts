import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'db',
  database: process.env.DB_NAME || 'incighder',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

export async function POST(request: Request) {
  try {
    const artistData = await request.json();
    const { name } = artistData;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const artistId = crypto.randomUUID();
    const client = await pool.connect();


    const queryText = `
      INSERT INTO artists (id, name, followers, popularity)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [artistId, name, 0, 0];

    const result = await client.query(queryText, values);
    client.release();

    return NextResponse.json({ 
      message: 'Artist data inserted successfully', 
      artist: result.rows[0] 
    });
  } catch (error: any) {
    console.error('Error inserting manual artist via DB pool:', error);
    return NextResponse.json({ error: error.message || 'Failed to insert manual artist' }, { status: 500 });
  }
}

