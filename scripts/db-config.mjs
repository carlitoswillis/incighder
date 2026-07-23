// MySQL connection options for the standalone node scripts — plain-JS mirror of
// src/lib/db.ts (the scripts run outside the Next build, so they can't import
// the TS lib). Precedence: DATABASE_URL > DB_* vars > local-dev defaults.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Scripts run bare (`node scripts/x.mjs`), so pull in the repo-root .env the
// same way Next and the data-api do. Real env vars win (loadEnvFile does not
// override existing keys).
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // best-effort: scripts still work off real env vars
  }
}

const truthy = (v) => /^(1|true|yes|require|required|on)$/i.test((v ?? '').trim());

export function poolOptions(extra = {}) {
  const opts = {
    user: process.env.DB_USER || 'incighder',
    host: process.env.DB_HOST || '127.0.0.1',
    database: process.env.DB_NAME || 'incighder',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '4000', 10),
  };

  let ssl = truthy(process.env.DB_SSL);
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const u = new URL(url);
    if (u.hostname) opts.host = u.hostname;
    if (u.port) opts.port = parseInt(u.port, 10);
    if (u.username) opts.user = decodeURIComponent(u.username);
    if (u.password) opts.password = decodeURIComponent(u.password);
    const db = u.pathname.replace(/^\//, '');
    if (db) opts.database = db;
    if (
      truthy(u.searchParams.get('ssl')) ||
      truthy(u.searchParams.get('sslmode')) ||
      truthy(u.searchParams.get('ssl-mode'))
    ) {
      ssl = true;
    }
  }
  if (ssl) opts.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };

  return { ...opts, ...extra };
}
