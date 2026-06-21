import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch("http://data-api:5000/discover", {
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
