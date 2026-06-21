"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Artist } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ArtistCard } from "@/components/artist-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const [artists, setArtists] = useState<Artist[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setArtists)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function handleDeleted(id: string) {
    setArtists((prev) => prev?.filter((a) => a.id !== id) ?? prev);
  }

  return (
    <div>
      <PageHeader title="Artists" count={artists?.length} />

      {error ? (
        <p className="text-sm text-destructive">Failed to load artists: {error}</p>
      ) : artists === null ? (
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-xl" />
          ))}
        </div>
      ) : artists.length === 0 ? (
        <EmptyState
          title="No artists yet"
          description="Search Spotify to add your first artist and start tracking their cross-platform traction."
          action={
            <Button render={<Link href="/search_spotify" />}>Search Spotify</Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {artists.map((a) => (
            <ArtistCard key={a.id} artist={a} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
