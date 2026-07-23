import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import crypto from 'crypto';
import { getPool } from '@/lib/db';
import { isAdmin } from "@/lib/auth";

const pool = getPool();

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

