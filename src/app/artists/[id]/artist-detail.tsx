"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { SiSpotify } from "react-icons/si";
import { ArrowLeft, ExternalLink, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";

import type { Artist } from "@/lib/types";
import { calculateArtistScore } from "@/utils/score";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge } from "@/components/score-badge";
import { MetricGrid } from "@/components/metric-grid";
import { SourcesPanel } from "@/components/sources-panel";
import { useAdmin } from "@/components/admin-context";
import { DeleteArtistDialog } from "@/components/delete-artist-dialog";
import { GrowthSection } from "@/components/growth-section";

const fieldClass =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function parseGenres(genres: string | null): string[] {
  if (!genres) return [];
  const cleaned = genres.replace(/[[\]"']/g, "");
  return cleaned
    ? cleaned.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
}

function ArtistDetail() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { admin } = useAdmin();
  const artistId = params.id as string;

  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(searchParams.get("edit") === "true");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    genres: "",
    images: "",
    external_urls: "",
    x_followers: "",
    bio: "",
    group_name: "",
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(`/api/artists/${artistId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setArtist(data);
        setForm({
          name: data.name || "",
          genres: data.genres || "",
          images: Array.isArray(data.images)
            ? data.images
                .map((i: { url: string } | string) =>
                  typeof i === "string" ? i : i.url,
                )
                .join(", ")
            : "",
          external_urls: data.external_urls
            ? JSON.stringify(data.external_urls, null, 2)
            : "",
          x_followers: data.x_followers != null ? String(data.x_followers) : "",
          bio: data.bio || "",
          group_name: data.group_name || "",
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    if (artistId) load();
  }, [artistId]);

  // Surface the artist's name as the browser tab title (client-rendered page, so
  // we can't use generateMetadata). Restore the site default on unmount.
  useEffect(() => {
    if (!artist?.name) return;
    document.title = `${artist.name} · Incighder`;
    return () => {
      document.title = "Incighder — Artist Traction Insights";
    };
  }, [artist?.name]);

  async function togglePublic() {
    if (!artist) return;
    const next = artist.is_public ? 0 : 1;
    try {
      const r = await fetch(`/api/artists/${artistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setArtist(await r.json());
      toast.success(next ? "Now visible to visitors" : "Now hidden from visitors");
    } catch (e) {
      toast.error(`Failed to update visibility: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const [fetchingBio, setFetchingBio] = useState(false);
  async function fetchBio() {
    setFetchingBio(true);
    try {
      const r = await fetch("/api/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artistId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setArtist(data);
      setForm((f) => ({ ...f, bio: data.bio || "" }));
      toast.success("Bio pulled from Last.fm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setFetchingBio(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    let parsedUrls: unknown = null;
    if (form.external_urls.trim()) {
      try {
        parsedUrls = JSON.parse(form.external_urls);
      } catch {
        try {
          parsedUrls = JSON.parse(
            form.external_urls.replace(/(\w+):/g, '"$1":').replace(/'/g, '"'),
          );
        } catch {
          toast.error("External URLs must be valid JSON.");
          return;
        }
      }
    }
    try {
      const r = await fetch(`/api/artists/${artistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          x_followers: form.x_followers,
          genres: form.genres.split(",").map((s) => s.trim()).filter(Boolean),
          images: form.images
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((url) => ({ url })),
          external_urls: parsedUrls,
          bio: form.bio,
          group_name: form.group_name.trim() || null,
          ...(form.bio !== (artist?.bio || "") ? { bio_source: "manual" } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Update failed");
      setArtist(data);
      setShowEdit(false);
      toast.success("Saved changes");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  if (error) return <p className="text-sm text-destructive">Error: {error}</p>;
  if (!artist) return <p className="text-muted-foreground">Artist not found.</p>;

  const genres = parseGenres(artist.genres);
  const image = artist.images?.[0]?.url ?? null;
  const spotifyUrl = artist.external_urls?.spotify;
  const { score, breakdown } = calculateArtistScore({
    followers: artist.followers ?? 0,
    popularity: artist.popularity ?? 0,
    monthly_listeners: artist.monthly_listeners ?? null,
  });

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to artists
      </Link>

      {/* Hero */}
      <div className="flex flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:flex-row sm:items-center">
        {image && (
          <Image
            src={image}
            alt={artist.name}
            width={128}
            height={128}
            className="size-32 shrink-0 rounded-xl object-cover"
          />
        )}
        <div className="flex-1 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{artist.name}</h1>
          {artist.group_name && (
            <Link href={`/g/${encodeURIComponent(artist.group_name)}`}>
              <Badge className="mr-1.5">{artist.group_name}</Badge>
            </Link>
          )}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <Badge key={g} variant="secondary">
                  {g}
                </Badge>
              ))}
            </div>
          )}
          {spotifyUrl && (
            <a
              href={spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <SiSpotify style={{ color: "#1DB954" }} /> Open in Spotify
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge score={score} breakdown={breakdown} size="lg" />
          {admin && (
            <>
              <Button
                variant="outline"
                onClick={togglePublic}
                title={
                  artist.is_public
                    ? "Visible to visitors — click to make private"
                    : "Hidden from visitors — click to make public"
                }
              >
                {artist.is_public ? <Eye /> : <EyeOff />}
                {artist.is_public ? "Public" : "Private"}
              </Button>
              <Button variant="outline" onClick={() => setShowEdit((v) => !v)}>
                <Pencil /> Edit
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setDeleteOpen(true)}
                aria-label="Remove artist"
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit form */}
      {showEdit && (
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="x">X / Twitter followers (manual)</Label>
              <Input
                id="x"
                inputMode="numeric"
                value={form.x_followers}
                onChange={(e) =>
                  setForm({ ...form, x_followers: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="genres">Genres (comma separated)</Label>
            <Input
              id="genres"
              value={form.genres}
              onChange={(e) => setForm({ ...form, genres: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="images">Image URLs (comma separated)</Label>
            <textarea
              id="images"
              rows={2}
              className={fieldClass}
              value={form.images}
              onChange={(e) => setForm({ ...form, images: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="urls">External URLs (JSON)</Label>
            <textarea
              id="urls"
              rows={4}
              className={`${fieldClass} font-mono text-xs`}
              value={form.external_urls}
              onChange={(e) =>
                setForm({ ...form, external_urls: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group">Group (optional — e.g. glogang; moves them off the main list to /g/&lt;group&gt;)</Label>
            <Input
              id="group"
              value={form.group_name}
              onChange={(e) => setForm({ ...form, group_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <textarea
              id="bio"
              rows={6}
              placeholder="Write a bio, or use “Fetch from Last.fm” below."
              className={fieldClass}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Save changes</Button>
            <Button type="button" variant="ghost" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Bio */}
      {(artist.bio || admin) && (
        <div className="space-y-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">About</h2>
            {admin && (
              <div className="flex items-center gap-2">
                {artist.bio_source && (
                  <Badge variant="secondary">
                    {artist.bio_source === "lastfm" ? "Last.fm" : "manual"}
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchBio}
                  disabled={fetchingBio}
                >
                  {fetchingBio ? "Fetching…" : "Fetch from Last.fm"}
                </Button>
              </div>
            )}
          </div>
          {artist.bio ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {artist.bio}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground/70">
              No bio yet — fetch one from Last.fm or write one via Edit.
            </p>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Cross-platform metrics
        </h2>
        <MetricGrid artist={artist} />
      </div>

      {/* Growth */}
      <GrowthSection
        artistId={artistId}
        refreshSignal={artist.scrape_meta ? JSON.stringify(artist.scrape_meta) : ""}
      />

      {/* Sources */}
      {admin && <SourcesPanel artist={artist} onScraped={setArtist} />}

      <DeleteArtistDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        artistId={artistId}
        artistName={artist.name}
        onDeleted={() => router.push("/")}
      />
    </div>
  );
}

export default function ArtistDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-44 w-full rounded-xl" />}>
      <ArtistDetail />
    </Suspense>
  );
}
