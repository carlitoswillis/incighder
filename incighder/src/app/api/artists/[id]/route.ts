
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
  const updatedFields = await request.json();

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Dynamically build the SET clause for the SQL query
  for (const key in updatedFields) {
    if (updatedFields.hasOwnProperty(key) && key !== 'id') { // Exclude 'id' from update
      setClauses.push(`${key} = $${paramIndex}`);
      
      // Handle JSON string fields (genres, images, external_urls)
      if (key === 'genres' || key === 'images' || key === 'external_urls') {
        try {
          values.push(JSON.parse(updatedFields[key]));
        } catch (e) {
          return NextResponse.json({ error: `Invalid JSON for field: ${key}` }, { status: 400 });
        }
      } else {
        values.push(updatedFields[key]);
      }
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ message: 'No fields to update' }, { status: 200 });
  }

  values.push(id); // Add ID for the WHERE clause

  try {
    const client = await pool.connect();
    const result = await client.query(
      `UPDATE artists SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *;`,
      values
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
