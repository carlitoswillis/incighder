import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, cookieOptions, makeToken, passwordOk } from "@/lib/auth";

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));

  if (!passwordOk(String(password ?? ""))) {
    // Blunt the brute-force loop a little.
    await new Promise((r) => setTimeout(r, 750));
    return NextResponse.json({ error: "Wrong passphrase" }, { status: 401 });
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, makeToken(), cookieOptions());
  return NextResponse.json({ admin: true });
}
