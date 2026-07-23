import { NextResponse } from 'next/server';
import { getDataApiUrl, dataApiHeaders } from "@/lib/data-api";
import { isAdmin } from "@/lib/auth";

// Scraping can take a while (Playwright render + throttle), so allow a long run.
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();

  try {
    const response = await fetch(`${await getDataApiUrl()}/scrape`, {
      method: 'POST',
      headers: dataApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error scraping artist via data-api:', error);
    return NextResponse.json({ error: 'Failed to scrape artist' }, { status: 500 });
  }
}
