import { NextResponse } from 'next/server';
import mysql, { RowDataPacket } from 'mysql2/promise';
import crypto from 'crypto';

const pool = mysql.createPool({
  user: process.env.DB_USER || 'incighder',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'incighder',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '3306', 10),
});

export async function POST(request: Request) {
  try {
    const artistData = await request.json();
    const { name } = artistData;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const artistId = crypto.randomUUID();

    // MySQL has no INSERT ... RETURNING; insert then read the row back.
    await pool.query(
      'INSERT INTO artists (id, name, followers, popularity) VALUES (?, ?, ?, ?)',
      [artistId, name, 0, 0],
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM artists WHERE id = ?', [artistId]);

    return NextResponse.json({
      message: 'Artist data inserted successfully',
      artist: rows[0],
    });
  } catch (error) {
    console.error('Error inserting manual artist via DB pool:', error);
    const message = error instanceof Error ? error.message : 'Failed to insert manual artist';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

