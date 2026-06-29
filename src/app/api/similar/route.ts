import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing seed artist name' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:5050/similar_artists?q=${encodeURIComponent(query)}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Data API service error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching similar artists via data-api:', error);
    return NextResponse.json({ error: 'Failed to fetch similar artists' }, { status: 500 });
  }
}
