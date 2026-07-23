import { NextResponse } from "next/server";
import { getDataApiUrl, dataApiHeaders } from "@/lib/data-api";
import { isAdmin } from "@/lib/auth";

export const maxDuration = 30;

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({}, { status: 200 });
  try {
    const r = await fetch(
      `${await getDataApiUrl()}/preview?url=${encodeURIComponent(url)}`,
      { headers: dataApiHeaders() },
    );
    return NextResponse.json(await r.json(), { status: 200 });
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
