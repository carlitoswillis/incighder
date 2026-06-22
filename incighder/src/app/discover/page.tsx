"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Search, Sparkles } from "lucide-react";
import { SiSpotify } from "react-icons/si";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCompact } from "@/lib/format";

interface SimilarArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
  popularity: number;
  followers: { total: number };
  external_urls: { spotify: string };
  top_track_name?: string | null;
  top_track_popularity?: number | null;
  top_track_id?: string | null;
  match: number;
  lastfm_listeners: number | null;
  lastfm_playcount: number | null;
  lastfm_tags: string[];
}

// Only the Spotify-shaped fields the insert path expects.
function toSpotifyPayload(a: SimilarArtist) {
  return {
    id: a.id,
    name: a.name,
    images: a.images,
    genres: a.genres,
    popularity: a.popularity,
    followers: a.followers,
    external_urls: a.external_urls,
    top_track_name: a.top_track_name,
    top_track_popularity: a.top_track_popularity,
    top_track_id: a.top_track_id,
  };
}

export default function DiscoverPage() {
  const [q, setQ] = useState("");
  const [seed, setSeed] = useState("");
  const [results, setResults] = useState<SimilarArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const loadTracked = useCallback(async () => {
    try {
      const r = await fetch("/api/artists");
      const rows = await r.json();
      if (Array.isArray(rows)) {
        setTracked(
          new Set(
            rows
              .map((row: { spotify_id?: string | null }) => row.spotify_id)
              .filter((id: string | null | undefined): id is string => !!id),
          ),
        );
      }
    } catch {
      // non-fatal: just means we can't grey out tracked artists
    }
  }, []);

  useEffect(() => {
    loadTracked();
  }, [loadTracked]);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setSeed(q.trim());
    try {
      const r = await fetch(`/api/similar?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Search failed");
      setResults(d.artists.items);
      setSearched(true);
      if (!d.artists.items.length)
        toast.info("No similar artists found on Spotify.");
    } catch (e) {
      toast.error(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleTrack(a: SimilarArtist) {
    try {
      const r = await fetch("/api/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSpotifyPayload(a)),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Track failed");
      setAdded((p) => ({ ...p, [a.id]: true }));
      toast.success(`Now tracking ${a.name}`);
    } catch (e) {
      toast.error(`Failed to track: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div>
      <PageHeader title="Discover" />
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        Find artists similar to one you know, then track the ones worth watching.
      </p>

      <form onSubmit={handleSearch} className="mb-6 flex max-w-md gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Seed artist name"
          autoFocus
        />
        <Button type="submit" disabled={loading}>
          <Search /> {loading ? "Finding…" : "Discover"}
        </Button>
      </form>

      {searched && !loading && results.length > 0 && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-primary" />
          Artists similar to <span className="font-medium text-foreground">{seed}</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((a) => {
          const isTracked = tracked.has(a.id) || added[a.id];
          return (
            <div
              key={a.id}
              className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
            >
              <div className="flex items-center gap-3">
                {a.images?.[0]?.url ? (
                  <Image
                    src={a.images[0].url}
                    alt={a.name}
                    width={56}
                    height={56}
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="size-14 shrink-0 rounded-lg bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium">{a.name}</div>
                    {a.match > 0 && (
                      <Badge variant="secondary" className="shrink-0">
                        {Math.round(a.match * 100)}% match
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCompact(a.followers.total)} followers · pop {a.popularity}
                  </div>
                </div>
              </div>

              {a.lastfm_listeners ? (
                <div className="text-xs text-muted-foreground">
                  Last.fm: {formatCompact(a.lastfm_listeners)} listeners
                  {a.lastfm_playcount
                    ? ` · ${formatCompact(a.lastfm_playcount)} plays`
                    : ""}
                </div>
              ) : null}

              {(a.lastfm_tags?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {a.lastfm_tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : a.genres?.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {a.genres.slice(0, 3).map((g) => (
                    <Badge key={g} variant="secondary">
                      {g}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <Button
                onClick={() => handleTrack(a)}
                disabled={isTracked}
                variant={isTracked ? "secondary" : "default"}
                className="mt-auto"
              >
                {isTracked ? (
                  "Tracked ✓"
                ) : (
                  <>
                    <SiSpotify /> Track
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {searched && !loading && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No similar artists found. Try another spelling or a better-known seed.
        </p>
      )}
    </div>
  );
}
