import { NextResponse } from "next/server";

// Discover (web search + LLM verify) + scrape (Playwright + throttle) per artist
// is slow, so allow a long run. The client refreshes one artist at a time.
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch("http://data-api:5000/refresh_artist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error refreshing artist via data-api:", error);
    return NextResponse.json({ error: "Failed to refresh artist" }, { status: 500 });
  }
}
