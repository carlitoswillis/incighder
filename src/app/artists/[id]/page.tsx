import type { Metadata } from "next";
import { getArtistMeta } from "@/lib/artist-meta";
import ArtistDetail from "./artist-detail";

type Params = { params: Promise<{ id: string }> };

// Server-rendered so link unfurlers (iMessage, Slack, Twitter…) and the browser
// tab get the artist's name + image. The UI itself stays client-rendered below.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const artist = await getArtistMeta(id);
  if (!artist) return { title: "Artist" };

  const description = artist.genres.length
    ? `${artist.name} — ${artist.genres.slice(0, 3).join(", ")} · traction across Spotify, YouTube, SoundCloud & socials.`
    : `${artist.name} — audience traction across Spotify, YouTube, SoundCloud & socials.`;
  const images = artist.image ? [{ url: artist.image }] : undefined;

  return {
    title: artist.name, // root layout template renders "<name> · Incighder"
    description,
    openGraph: {
      title: `${artist.name} · Incighder`,
      description,
      type: "profile",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: `${artist.name} · Incighder`,
      description,
      images: artist.image ? [artist.image] : undefined,
    },
  };
}

export default function ArtistDetailPage() {
  return <ArtistDetail />;
}
