import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'db',
  database: process.env.DB_NAME || 'incighder',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

// Columns on the artists table that may be updated via PATCH. Keys come from the
// request body, so this allowlist guards against column-name (identifier) injection.
const UPDATABLE_COLUMNS = new Set([
  'name', 'followers', 'popularity', 'genres', 'images', 'external_urls',
  'monthly_listeners', 'spotify_id', 'youtube_id',
  'top_track_id', 'top_track_name', 'top_track_popularity',
]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const updatedFields: Record<string, any> = await request.json();

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const key in updatedFields) {
    if (Object.prototype.hasOwnProperty.call(updatedFields, key) && key !== 'id' && UPDATABLE_COLUMNS.has(key)) {
      setClauses.push(`${key} = $${paramIndex}`);
      
      const val = updatedFields[key];
      
      if (key === 'genres') {
        if (val === null || val === 'null' || val === '') {
          values.push(null);
        } else if (typeof val === 'string') {
          const cleaned = val.replace(/[\{\}\"\[\]]/g, '');
          values.push(cleaned);
        } else if (Array.isArray(val)) {
          values.push(val.join(', '));
        } else {
          values.push(String(val));
        }
      } else if (key === 'images') {
        if (val === null || val === 'null' || val === '') {
          values.push(null);
        } else if (Array.isArray(val)) {
          values.push(JSON.stringify(val));
        } else if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            values.push(JSON.stringify(Array.isArray(parsed) ? parsed : [val]));
          } catch {
            values.push(JSON.stringify(val.split(',').map((s: string) => s.trim()).filter((s: string) => s).map(url => ({ url }))));
          }
        } else {
          values.push(JSON.stringify(val));
        }
      } else if (key === 'external_urls') {
        if (val === null || val === 'null' || val === '') {
          values.push(null);
        } else if (typeof val === 'object') {
          values.push(JSON.stringify(val));
        } else {
          try {
            values.push(JSON.stringify(JSON.parse(val)));
          } catch {
            return NextResponse.json({ error: `Invalid JSON for field: ${key}` }, { status: 400 });
          }
        }
      } else {
        values.push(val === '' || val === 'null' ? null : val);
      }
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ message: 'No fields to update' }, { status: 200 });
  }

  values.push(id);

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

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

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
