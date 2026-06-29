import { NextResponse } from 'next/server';

// Scraping can take a while (Playwright render + throttle), so allow a long run.
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch('http://127.0.0.1:5050/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error scraping artist via data-api:', error);
    return NextResponse.json({ error: 'Failed to scrape artist' }, { status: 500 });
  }
}
