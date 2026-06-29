import { NextResponse } from "next/server";
import { DATA_API_URL } from "@/lib/data-api";

export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({}, { status: 200 });
  try {
    const r = await fetch(
      `${DATA_API_URL}/preview?url=${encodeURIComponent(url)}`,
    );
    return NextResponse.json(await r.json(), { status: 200 });
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
