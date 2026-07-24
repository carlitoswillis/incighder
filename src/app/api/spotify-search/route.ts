import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getDataApiUrl, dataApiHeaders } from "@/lib/data-api";

// Spotify client-credentials token, cached in-process until shortly before expiry.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`);

  const json = await res.json();
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }

  try {
    const token = await getSpotifyToken();
    const url =
      "https://api.spotify.com/v1/search?type=artist&limit=5&q=" +
      encodeURIComponent(query);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!res.ok) {
      throw new Error(`Spotify search failed: ${res.status}`);
    }

    // Spotify's response is already { artists: { items: [...] } } with the exact
    // fields the UI reads (id, name, images, genres, popularity, followers, external_urls).
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    // The deploy has no Spotify credentials of its own (they live with the
    // data-api), so fall back to its /spotify_search — same response shape. Every
    // caller of this route also needs the data-api to actually add an artist, so
    // this adds no dependency the flow didn't already have.
    console.error("Direct Spotify search failed; trying data-api:", error);
    try {
      return await searchViaDataApi(query);
    } catch (fallbackError) {
      console.error("data-api Spotify search failed:", fallbackError);
      return NextResponse.json({ error: "Failed to search Spotify" }, { status: 500 });
    }
  }
}

async function searchViaDataApi(query: string) {
  const res = await fetch(
    `${await getDataApiUrl()}/spotify_search?q=${encodeURIComponent(query)}`,
    { headers: dataApiHeaders() },
  );
  // A stale/missing route serves Flask's HTML 404 page; don't blind-parse it.
  const text = await res.text();
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`data-api returned ${res.status} (non-JSON)`);
  }
  if (!res.ok) throw new Error(`data-api returned ${res.status}`);
  return NextResponse.json(JSON.parse(text));
}
