"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, Users } from "lucide-react";
import type { Artist } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ArtistCard } from "@/components/artist-card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/components/admin-context";
import { toast } from "sonner";

interface GroupRow {
  group_name: string;
  count: number;
}

// Card-grid of artists, shared by the home page (ungrouped roster + group
// chips) and /g/[group] (one group's members).
export function ArtistGrid({ title, group }: { title: string; group?: string }) {
  const { admin } = useAdmin();
  const [artists, setArtists] = useState<Artist[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = group
      ? `/api/artists?group=${encodeURIComponent(group)}`
      : "/api/artists";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setArtists)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    if (!group && admin) {
      fetch("/api/groups")
        .then((r) => (r.ok ? r.json() : []))
        .then(setGroups)
        .catch(() => setGroups([]));
    }
  }, [group, admin]);

  function handleDeleted(id: string) {
    setArtists((prev) => prev?.filter((a) => a.id !== id) ?? prev);
  }

  // Swap with the neighbour, then persist 1-based sort_order for every row
  // whose position changed. Order is server-truth on next load.
  function handleMove(id: string, dir: "up" | "down") {
    setArtists((prev) => {
      if (!prev) return prev;
      const i = prev.findIndex((a) => a.id === id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      next.forEach((a, idx) => {
        const want = idx + 1;
        if (a.sort_order !== want) {
          a.sort_order = want;
          fetch(`/api/artists/${a.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: want }),
          }).catch(() => toast.error("Failed to save order"));
        }
      });
      return next;
    });
  }

  const actions = (
    <div className="flex items-center gap-2">
      {group && (
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/g/${encodeURIComponent(group)}/report`} />}
        >
          <FileText className="size-4" /> Report
        </Button>
      )}
      {admin && (
        <Button
          variant="outline"
          size="sm"
          render={
            <a
              href={group ? `/api/export?group=${encodeURIComponent(group)}` : "/api/export"}
            />
          }
        >
          <Download className="size-4" /> CSV
        </Button>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title={title} count={artists?.length} actions={actions} />

      {!group && admin && groups.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Groups:</span>
          {groups.map((g) => (
            <Link key={g.group_name} href={`/g/${encodeURIComponent(g.group_name)}`}>
              <Badge variant="secondary" className="gap-1.5 hover:bg-secondary/70">
                <Users className="size-3" />
                {g.group_name}
                <span className="text-muted-foreground">{g.count}</span>
              </Badge>
            </Link>
          ))}
        </div>
      )}

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
          title={group ? `Nothing in “${group}” yet` : "No artists yet"}
          description={
            group
              ? "Set an artist's Group field to add them here."
              : admin
                ? "Search Spotify to add your first artist and start tracking their cross-platform traction."
                : "Check back soon."
          }
          action={
            admin && !group ? (
              <Button render={<Link href="/search_spotify" />}>Search Spotify</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {artists.map((a) => (
            <ArtistCard
              key={a.id}
              artist={a}
              onDeleted={handleDeleted}
              onMove={admin ? (dir) => handleMove(a.id, dir) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
