import { NextResponse } from "next/server";
import { getDataApiUrl } from "@/lib/data-api";

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const r = await fetch(`${await getDataApiUrl()}/clear_source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (error) {
    console.error("Error clearing source via data-api:", error);
    return NextResponse.json({ error: "Failed to clear source" }, { status: 500 });
  }
}
