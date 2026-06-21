"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Artist } from "@/lib/types";
import { calculateArtistScore } from "@/utils/score";
import { formatCompact } from "@/lib/format";
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
import type { PlatformKey } from "@/lib/platforms";

function HeadMetric({ platform, label }: { platform: PlatformKey; label: string }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <PlatformIcon platform={platform} className="size-3.5" /> {label}
    </div>
  );
}

export default function TablePage() {
  const [artists, setArtists] = useState<Artist[] | null>(null);

  useEffect(() => {
    fetch("/api/artists")
      .then((r) => r.json())
      .then(setArtists)
      .catch(() => setArtists([]));
  }, []);

  return (
    <div>
      <PageHeader title="Table" count={artists?.length} />

      {artists === null ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : artists.length === 0 ? (
        <EmptyState title="No artists yet" description="Add artists to populate the table." />
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artist</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Followers</TableHead>
                <TableHead className="text-right">
                  <HeadMetric platform="spotify" label="Monthly" />
                </TableHead>
                <TableHead className="text-right">
                  <HeadMetric platform="youtube" label="Subs" />
                </TableHead>
                <TableHead className="text-right">
                  <HeadMetric platform="instagram" label="IG" />
                </TableHead>
                <TableHead className="text-right">
                  <HeadMetric platform="tiktok" label="TikTok" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {artists.map((a) => {
                const { score } = calculateArtistScore({
                  followers: a.followers ?? 0,
                  popularity: a.popularity ?? 0,
                  monthly_listeners: a.monthly_listeners ?? null,
                });
                return (
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
