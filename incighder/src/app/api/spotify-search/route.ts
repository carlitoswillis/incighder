import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing search query' }, { status: 400 });
  }

  return new Promise((resolve) => {
    const pythonScriptPath = path.join(process.cwd(), '../scraper', 'spotify_search.py');
    const venvPython = path.join(process.cwd(), '../scraper', '.venv', 'bin', 'python3');

    const pythonProcess = spawn(venvPython, [pythonScriptPath, query]);

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
        resolve(NextResponse.json({ error: `Failed to search Spotify: ${stderr}` }, { status: 500 }));
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python subprocess:', err);
      resolve(NextResponse.json({ error: 'Internal server error: Could not execute Python script' }, { status: 500 }));
    });
  });
}
