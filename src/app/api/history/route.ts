import { NextResponse } from "next/server";
import { getDataApiUrl } from "@/lib/data-api";

export async function GET(request: Request) {
  const artistId = new URL(request.url).searchParams.get("artist_id");
  if (!artistId) return NextResponse.json({}, { status: 200 });
  try {
    const r = await fetch(
      `${await getDataApiUrl()}/history?artist_id=${encodeURIComponent(artistId)}`,
    );
    return NextResponse.json(await r.json(), { status: 200 });
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
