import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { spawn } from 'child_process';
import path from 'path';

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
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

  return new Promise((resolve) => {
    const pythonScriptPath = path.join(process.cwd(), '..', 'scraper', 'insert_artist_from_json.py');
    const venvPython = path.join(process.cwd(), '..', 'scraper', '.venv', 'bin', 'python3');

    const pythonProcess = spawn(venvPython, [pythonScriptPath, JSON.stringify(artistData)]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const jsonResponse = JSON.parse(stdout);
          resolve(NextResponse.json(jsonResponse));
        } catch (e) {
          console.error('Failed to parse Python script output:', e, stdout);
          resolve(NextResponse.json({ error: 'Internal server error: Invalid Python script output' }, { status: 500 }));
        }
      } else {
        console.error(`Python script exited with code ${code}: ${stderr}`);
        resolve(NextResponse.json({ error: `Failed to insert artist: ${stderr}` }, { status: 500 }));
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python subprocess:', err);
      resolve(NextResponse.json({ error: 'Internal server error: Could not execute Python script' }, { status: 500 }));
    });
  });
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