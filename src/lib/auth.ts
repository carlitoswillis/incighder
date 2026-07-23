import crypto from "crypto";
import { cookies } from "next/headers";

// Passphrase-admin gate. Visitors browse read-only; anyone presenting one of
// the ADMIN_PASSWORDS (comma-separated env — one each for you and Adam) gets a
// signed, expiring cookie that unlocks mutations and the data-api proxies.
// Deliberately not a user system: when real multi-user auth is needed
// (Manager mode), swap the passphrase check for a provider and keep the
// isAdmin() guards as-is.

export const ADMIN_COOKIE = "incighder_admin";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000; // 30 days

function secret(): string {
  return process.env.AUTH_SECRET || "";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Token = "<expiryEpochMs>.<hmac>" */
export function makeToken(): string {
  const exp = String(Date.now() + MAX_AGE_MS);
  return `${exp}.${sign(exp)}`;
}

export function validToken(token?: string | null): boolean {
  if (!token || !secret()) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sign(exp), sig)) return false;
  return Number(exp) > Date.now();
}

/** Server-side admin check for route handlers / server components. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return validToken(store.get(ADMIN_COOKIE)?.value);
}

export function passwordOk(pw: string): boolean {
  if (!pw) return false;
  const allowed = (process.env.ADMIN_PASSWORDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.some((p) => safeEqual(p, pw));
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_MS / 1000,
  };
}
