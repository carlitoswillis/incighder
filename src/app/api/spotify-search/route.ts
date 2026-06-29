import { NextResponse } from 'next/server';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing search query' }, { status: 400 });
  }

  try {
    const response = await fetch(`http://127.0.0.1:5050/spotify_search?q=${encodeURIComponent(query)}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Data API service error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error searching Spotify via scraper service:', error);
    return NextResponse.json({ error: 'Failed to search Spotify' }, { status: 500 });
  }
}
