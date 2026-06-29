// Restores the `artists` table from src/data/artists-fallback.json (JSON -> DB).
// The inverse of export-artists.mjs. Use to seed/restore a fresh local MySQL
// from the committed snapshot:
//   node scripts/import-artists.mjs
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../src/data/artists-fallback.json');

const rows = JSON.parse(readFileSync(SRC, 'utf8'));
if (!Array.isArray(rows) || rows.length === 0) {
  console.log('No artists in snapshot — nothing to import.');
  process.exit(0);
}

const pool = mysql.createPool({
  user: process.env.DB_USER || 'incighder',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'incighder',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '3306', 10),
});

// JSON columns must be re-serialized; other values pass through as-is.
const toCell = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

let imported = 0;
for (const row of rows) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
    .join(', ');
  const sql =
    `INSERT INTO artists (${cols.map((c) => `\`${c}\``).join(', ')}) ` +
    `VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
  await pool.query(sql, cols.map((c) => toCell(row[c])));
  imported++;
}

console.log(`Imported/updated ${imported} artist(s) from ${SRC}`);
await pool.end();
