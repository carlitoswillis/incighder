"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MoreHorizontal, Trash2, SquareArrowOutUpRight, Pencil } from "lucide-react";
import { SiSpotify } from "react-icons/si";

import type { Artist } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { calculateArtistScore } from "@/utils/score";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/score-badge";
import { StatTile } from "@/components/stat-tile";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DeleteArtistDialog } from "@/components/delete-artist-dialog";
import { useAdmin } from "@/components/admin-context";

function parseGenres(genres: string | null): string[] {
  if (!genres) return [];
  const cleaned = genres.replace(/[[\]"']/g, "");
  return cleaned
    ? cleaned.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
}

export function ArtistCard({
  artist,
  onDeleted,
}: {
  artist: Artist;
  onDeleted: (id: string) => void;
}) {
  const { admin } = useAdmin();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const genres = parseGenres(artist.genres);
  const image = artist.images?.[0]?.url ?? null;
  const spotifyUrl = artist.external_urls?.spotify;
  const { score, breakdown } = calculateArtistScore({
    followers: artist.followers ?? 0,
    popularity: artist.popularity ?? 0,
    monthly_listeners: artist.monthly_listeners ?? null,
  });

  return (
    <>
      <div className="overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
        <div className="flex flex-col md:min-h-80 md:flex-row">
          {/* Image */}
          <div className="relative aspect-square w-full shrink-0 bg-secondary md:aspect-auto md:w-2/5 md:self-stretch">
            {image ? (
              <Image
                src={image}
                alt={artist.name}
                fill
                sizes="(max-width: 768px) 100vw, 40vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full min-h-56 items-center justify-center text-sm text-muted-foreground">
                No image
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col gap-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Link
                  href={`/artists/${artist.id}`}
                  className="text-2xl font-semibold tracking-tight transition-colors hover:text-primary"
                >
                  {artist.name}
                </Link>
                {genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {genres.slice(0, 4).map((g) => (
                      <Badge key={g} variant="secondary">
                        {g}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ScoreBadge score={score} breakdown={breakdown} size="lg" />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Artist actions"
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem render={<Link href={`/artists/${artist.id}`} />}>
                      <Pencil /> Open
                    </DropdownMenuItem>
                    {spotifyUrl && (
                      <DropdownMenuItem
                        render={
                          <a href={spotifyUrl} target="_blank" rel="noopener noreferrer" />
                        }
                      >
                        <SiSpotify /> Spotify
                      </DropdownMenuItem>
                    )}
                    {admin && (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmOpen(true)}
                      >
                        <Trash2 /> Remove
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PLATFORMS.map((p) => (
                <StatTile key={p.key} platform={p} artist={artist} />
              ))}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
              <Button render={<Link href={`/artists/${artist.id}`} />}>
                View profile
              </Button>
              {spotifyUrl && (
                <Button
                  variant="outline"
                  render={
                    <a href={spotifyUrl} target="_blank" rel="noopener noreferrer" />
                  }
                >
                  <SiSpotify /> Open in Spotify
                  <SquareArrowOutUpRight />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <DeleteArtistDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        artistId={artist.id}
        artistName={artist.name}
        onDeleted={() => onDeleted(artist.id)}
      />
    </>
  );
}
