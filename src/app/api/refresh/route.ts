import { NextResponse } from "next/server";
import { getDataApiUrl } from "@/lib/data-api";

// Discover (web search + LLM verify) + scrape (Playwright + throttle) per artist
// is slow, so allow a long run. The client refreshes one artist at a time.
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch(`${await getDataApiUrl()}/refresh_artist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // data-api may return a non-JSON body on error (e.g. a stale/missing route
    // serves Flask's HTML 404 page). Guard the parse so we surface a useful status
    // and message instead of crashing on `Unexpected token '<'`.
    const text = await response.text();
    if (!response.headers.get("content-type")?.includes("application/json")) {
      console.error(
        `data-api /refresh_artist returned ${response.status} (non-JSON):`,
        text.slice(0, 200),
      );
      return NextResponse.json(
        { error: `data-api error (${response.status})` },
        { status: response.status === 200 ? 502 : response.status },
      );
    }
    return NextResponse.json(JSON.parse(text), { status: response.status });
  } catch (error) {
    console.error("Error refreshing artist via data-api:", error);
    return NextResponse.json({ error: "Failed to refresh artist" }, { status: 500 });
  }
}
