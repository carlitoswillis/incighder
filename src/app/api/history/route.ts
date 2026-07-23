import { NextResponse } from "next/server";
import { getDataApiUrl, dataApiHeaders } from "@/lib/data-api";

// Public: growth charts render on visitor-facing artist pages. The upstream
// call still carries the shared secret so the tunnel stays closed to strangers.
export async function GET(request: Request) {
  const artistId = new URL(request.url).searchParams.get("artist_id");
  if (!artistId) return NextResponse.json({}, { status: 200 });
  try {
    const r = await fetch(
      `${await getDataApiUrl()}/history?artist_id=${encodeURIComponent(artistId)}`,
      { headers: dataApiHeaders() },
    );
    return NextResponse.json(await r.json(), { status: 200 });
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
