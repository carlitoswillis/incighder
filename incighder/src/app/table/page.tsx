"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { Artist } from "@/lib/types";
import type { PlatformKey } from "@/lib/platforms";
import { calculateArtistScore } from "@/utils/score";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = { a: Artist; score: number };
type SortKey =
  | "name"
  | "score"
  | "followers"
  | "monthly_listeners"
  | "youtube_subscribers"
  | "instagram_followers"
  | "tiktok_followers";

const NUMERIC: Record<Exclude<SortKey, "name">, (r: Row) => number> = {
  score: (r) => r.score,
  followers: (r) => r.a.followers ?? -1,
  monthly_listeners: (r) => r.a.monthly_listeners ?? -1,
  youtube_subscribers: (r) => r.a.youtube_subscribers ?? -1,
  instagram_followers: (r) => r.a.instagram_followers ?? -1,
  tiktok_followers: (r) => r.a.tiktok_followers ?? -1,
};

export default function TablePage() {
  const [artists, setArtists] = useState<Artist[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then(setArtists)
      .catch(() => setArtists([]));
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!artists) return [];
    const out = artists.map((a) => ({
      a,
      score: calculateArtistScore({
        followers: a.followers ?? 0,
        popularity: a.popularity ?? 0,
        monthly_listeners: a.monthly_listeners ?? null,
      }).score,
    }));
    out.sort((x, y) => {
      const cmp =
        sortKey === "name"
          ? x.a.name.localeCompare(y.a.name)
          : NUMERIC[sortKey](x) - NUMERIC[sortKey](y);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [artists, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  function SortHead({
    k,
    children,
    className,
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
  }) {
    const active = sortKey === k;
    return (
      <TableHead className={className}>
        <button
          onClick={() => toggleSort(k)}
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-foreground",
            active ? "text-foreground" : "",
          )}
        >
          {children}
          {active ? (
            sortDir === "asc" ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )
          ) : (
            <ChevronsUpDown className="size-3.5 opacity-40" />
          )}
        </button>
      </TableHead>
    );
  }

  function MetricHead({
    k,
    platform,
    label,
  }: {
    k: SortKey;
    platform: PlatformKey;
    label: string;
  }) {
    return (
      <SortHead k={k} className="text-right">
        <PlatformIcon platform={platform} className="size-3.5" /> {label}
      </SortHead>
    );
  }

  return (
    <div>
      <PageHeader title="Table" count={artists?.length} />

      {artists === null ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : artists.length === 0 ? (
        <EmptyState
          title="No artists yet"
          description="Add artists to populate the table."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead k="name">Artist</SortHead>
                <SortHead k="score" className="[&>button]:justify-end text-right">
                  Score
                </SortHead>
                <SortHead
                  k="followers"
                  className="[&>button]:justify-end text-right"
                >
                  Followers
                </SortHead>
                <MetricHead k="monthly_listeners" platform="spotify" label="Monthly" />
                <MetricHead k="youtube_subscribers" platform="youtube" label="Subs" />
                <MetricHead k="instagram_followers" platform="instagram" label="IG" />
                <MetricHead k="tiktok_followers" platform="tiktok" label="TikTok" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ a, score }) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link
                      href={`/artists/${a.id}`}
                      className="font-medium transition-colors hover:text-primary"
                    >
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {Math.round(score)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(a.followers)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(a.monthly_listeners)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(a.youtube_subscribers)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(a.instagram_followers)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(a.tiktok_followers)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
