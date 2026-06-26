"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCompact } from "@/lib/format";

interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
  popularity: number;
  followers: { total: number };
  external_urls: { spotify: string };
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SpotifyArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/spotify-search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Search failed");
      setResults(d.artists.items);
      if (!d.artists.items.length) toast.info("No artists found.");
    } catch (e) {
      toast.error(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(a: SpotifyArtist) {
    try {
      const r = await fetch("/api/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Add failed");
      setAdded((p) => ({ ...p, [a.id]: true }));
      toast.success(`Added ${a.name}`);
    } catch (e) {
      toast.error(`Failed to add: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div>
      <PageHeader title="Search Spotify" />

      <form onSubmit={handleSearch} className="mb-6 flex max-w-md gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artist name"
          autoFocus
        />
        <Button type="submit" disabled={loading}>
          <Search /> {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((a) => (
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
              <div className="min-w-0">
                <div className="truncate font-medium">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatCompact(a.followers.total)} followers · pop {a.popularity}
                </div>
              </div>
            </div>
            {a.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {a.genres.slice(0, 3).map((g) => (
                  <Badge key={g} variant="secondary">
                    {g}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              onClick={() => handleAdd(a)}
              disabled={added[a.id]}
              variant={added[a.id] ? "secondary" : "default"}
              className="mt-auto"
            >
              {added[a.id] ? (
                "Added ✓"
              ) : (
                <>
                  <Plus /> Add to dataset
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
