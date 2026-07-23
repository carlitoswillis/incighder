import mysql from "mysql2/promise";
import type { Pool, PoolOptions } from "mysql2/promise";

// Single source of truth for MySQL connection config on the Next.js side.
// Precedence: DATABASE_URL (mysql://user:pass@host:port/db?ssl=true) > DB_* vars
// > local-dev defaults. One env var points the whole app at a hosted database
// (TiDB Serverless, Aiven, ...); TLS turns on via ?ssl=true / ?sslmode=require
// in the URL or DB_SSL=true.

const truthy = (v?: string | null) =>
  /^(1|true|yes|require|required|on)$/i.test((v ?? "").trim());

export function poolOptions(extra: PoolOptions = {}): PoolOptions {
  const opts: PoolOptions = {
    user: process.env.DB_USER || "incighder",
    host: process.env.DB_HOST || "127.0.0.1",
    database: process.env.DB_NAME || "incighder",
    password: process.env.DB_PASSWORD || "password",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    // Short enough that routes with a JSON fallback fail over quickly when no
    // DB is reachable, long enough for a cold serverless DB to answer.
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || "4000", 10),
  };

  let ssl = truthy(process.env.DB_SSL);
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const u = new URL(url);
    if (u.hostname) opts.host = u.hostname;
    if (u.port) opts.port = parseInt(u.port, 10);
    if (u.username) opts.user = decodeURIComponent(u.username);
    if (u.password) opts.password = decodeURIComponent(u.password);
    const db = u.pathname.replace(/^\//, "");
    if (db) opts.database = db;
    if (
      truthy(u.searchParams.get("ssl")) ||
      truthy(u.searchParams.get("sslmode")) ||
      truthy(u.searchParams.get("ssl-mode"))
    ) {
      ssl = true;
    }
  }
  if (ssl) opts.ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };

  return { ...opts, ...extra };
}

// One pool for the whole server process, cached on globalThis so dev
// hot-reloads and route modules don't each open their own pool.
const globalForPool = globalThis as unknown as { _incighderPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool._incighderPool) {
    globalForPool._incighderPool = mysql.createPool(poolOptions());
  }
  return globalForPool._incighderPool;
}
