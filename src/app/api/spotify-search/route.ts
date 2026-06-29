import { NextResponse } from "next/server";

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
    console.error("Error searching Spotify:", error);
    return NextResponse.json({ error: "Failed to search Spotify" }, { status: 500 });
  }
}
