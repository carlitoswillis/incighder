// Snapshots the local MySQL `artists` table to src/data/artists-fallback.json.
// The deployed app (Vercel) has no MySQL, so GET /api/artists falls back to this
// file when a DB connection isn't available. Re-run after scraping to refresh:
//   node scripts/export-artists.mjs
import mysql from 'mysql2/promise';
import { poolOptions } from './db-config.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/artists-fallback.json');

const pool = mysql.createPool(poolOptions({ connectTimeout: 3000 }));

try {
  const [rows] = await pool.query('SELECT * FROM artists');
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  console.log(`Wrote ${rows.length} artist(s) to ${OUT}`);
} catch (err) {
  // Run on every dev start; if MySQL isn't up yet just keep the existing
  // snapshot rather than failing the launch.
  console.warn(`Skipping artist snapshot (DB unavailable): ${err.message}`);
} finally {
  await pool.end();
}
