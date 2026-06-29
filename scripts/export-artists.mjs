// Snapshots the local MySQL `artists` table to src/data/artists-fallback.json.
// The deployed app (Vercel) has no MySQL, so GET /api/artists falls back to this
// file when a DB connection isn't available. Re-run after scraping to refresh:
//   node scripts/export-artists.mjs
import mysql from 'mysql2/promise';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/artists-fallback.json');

const pool = mysql.createPool({
  user: process.env.DB_USER || 'incighder',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'incighder',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '3306', 10),
});

const [rows] = await pool.query('SELECT * FROM artists');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
console.log(`Wrote ${rows.length} artist(s) to ${OUT}`);
await pool.end();
