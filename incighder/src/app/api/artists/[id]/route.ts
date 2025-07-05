import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'incighder',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM artists WHERE id = $1', [id]);
    client.release();
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching artist:', error);
    return NextResponse.json({ error: 'Failed to fetch artist' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const { monthly_listeners } = await request.json();

  try {
    const client = await pool.connect();
    const result = await client.query(
      'UPDATE artists SET monthly_listeners = $1 WHERE id = $2 RETURNING *;',
      [monthly_listeners, id]
    );
    client.release();

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating artist:', error);
    return NextResponse.json({ error: 'Failed to update artist' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const client = await pool.connect();
    const result = await client.query('DELETE FROM artists WHERE id = $1 RETURNING id', [id]);
    client.release();

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    return NextResponse.json({ message: `Artist with ID ${id} deleted successfully` });
  } catch (error) {
    console.error('Error deleting artist:', error);
    return NextResponse.json({ error: 'Failed to delete artist' }, { status: 500 });
  }
}