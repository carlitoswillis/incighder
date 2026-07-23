import { NextResponse } from "next/server";
import { getDataApiUrl } from "@/lib/data-api";

// Is the (home-run) data-api reachable? The app shell polls this to show the
// "live scraping offline" banner. Never cache — the whole point is liveness.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = await getDataApiUrl();
    const r = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return NextResponse.json({ online: r.ok });
  } catch {
    return NextResponse.json({ online: false });
  }
}
