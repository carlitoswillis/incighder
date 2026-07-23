import { NextResponse } from "next/server";
import { getDataApiUrl } from "@/lib/data-api";

export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch(`${await getDataApiUrl()}/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error discovering links via data-api:", error);
    return NextResponse.json({ error: "Failed to discover links" }, { status: 500 });
  }
}
