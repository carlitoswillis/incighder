import { NextResponse } from 'next/server';
import { getDataApiUrl, dataApiHeaders } from "@/lib/data-api";
import { isAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing seed artist name' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${await getDataApiUrl()}/similar_artists?q=${encodeURIComponent(query)}`,
      { headers: dataApiHeaders() },
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
