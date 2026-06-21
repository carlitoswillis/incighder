import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const artistId = new URL(request.url).searchParams.get("artist_id");
  if (!artistId) return NextResponse.json({}, { status: 200 });
  try {
    const r = await fetch(
      `http://data-api:5000/history?artist_id=${encodeURIComponent(artistId)}`,
    );
    return NextResponse.json(await r.json(), { status: 200 });
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
