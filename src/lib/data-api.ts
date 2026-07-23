import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

// Base URL of the Python data-api (scraping, discovery, refresh, link preview).
// Resolution order:
//   1. DATA_API_URL env — explicit override.
//   2. In production: `app_config.data_api_url` in the shared DB — published by
//      ./go_live.sh each time the home machine brings the tunnel up, so the
//      deployed site follows the current tunnel URL with NO redeploy.
//   3. http://127.0.0.1:$DATA_API_PORT — local dev default.

const DEFAULT_URL = `http://127.0.0.1:${process.env.DATA_API_PORT || "5050"}`;

// The tunnel makes the data-api publicly reachable, so every proxy call
// carries a shared secret the Flask side verifies (DATA_API_SECRET in .env on
// both ends). No secret configured = header omitted (open local dev).
export function dataApiHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const h = { ...extra };
  if (process.env.DATA_API_SECRET) {
    h["X-Data-Api-Secret"] = process.env.DATA_API_SECRET;
  }
  return h;
}

let cached: { url: string; at: number } | null = null;
const TTL_MS = 30_000;

export async function getDataApiUrl(): Promise<string> {
  if (process.env.DATA_API_URL) return process.env.DATA_API_URL;
  // Local dev talks to localhost directly; only deployed instances need to
  // discover the tunnel through the DB.
  if (process.env.NODE_ENV !== "production") return DEFAULT_URL;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.url;
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT v FROM app_config WHERE k = 'data_api_url'",
    );
    const url = (rows[0]?.v as string | undefined)?.trim();
    if (url) {
      cached = { url, at: Date.now() };
      return url;
    }
  } catch {
    // table missing / DB unreachable — fall through
  }
  return DEFAULT_URL;
}
