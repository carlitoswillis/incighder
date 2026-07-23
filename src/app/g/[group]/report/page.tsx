"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import type { Artist } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { calculateArtistScore } from "@/utils/score";
import { formatCompact } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type HistoryEntry = { current: number; first: number; change: number };
type HistoryMap = Record<string, HistoryEntry>;

// Roster one-sheet: every member of a group on one printable page — a ledger
// row per person, per-platform numbers with growth deltas.
export default function GroupReportPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group } = use(params);
  const name = decodeURIComponent(group);
  const [members, setMembers] = useState<Artist[] | null>(null);
  const [histories, setHistories] = useState<Record<string, HistoryMap>>({});

  useEffect(() => {
    fetch(`/api/artists?group=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(async (rows: Artist[]) => {
        setMembers(rows);
        const entries = await Promise.all(
          rows.map(async (a) => {
            const h = await fetch(`/api/history?artist_id=${encodeURIComponent(a.id)}`)
              .then((r) => r.json())
              .catch(() => ({}));
            return [a.id, h] as const;
          }),
        );
        setHistories(Object.fromEntries(entries));
      })
      .catch(() => setMembers([]));
  }, [name]);

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  if (members === null)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href={`/g/${encodeURIComponent(name)}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to {name}
        </Link>
        <Button onClick={() => window.print()} size="sm">
          <Printer className="size-4" /> Print / save PDF
        </Button>
      </div>

      <div className="rounded-xl bg-card p-8 ring-1 ring-foreground/10 print:rounded-none print:p-0 print:ring-0">
        {/* Masthead */}
        <div className="flex items-baseline justify-between border-b-2 border-primary pb-3">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight">
              <span className="text-primary">◐</span> Incighder
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Roster one-sheet
            </span>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {today}
          </span>
        </div>

        <div className="mt-6 flex items-baseline justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>

        {members.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <div className="mt-6 border-t border-border">
            {members.map((a) => {
              const h = histories[a.id] ?? {};
              const { score } = calculateArtistScore({
                followers: a.followers ?? 0,
                popularity: a.popularity ?? 0,
                monthly_listeners: a.monthly_listeners ?? null,
              });
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex w-56 shrink-0 items-center gap-3">
                    {a.images?.[0]?.url && (
                      <Image
                        src={a.images[0].url}
                        alt={a.name}
                        width={40}
                        height={40}
                        className="size-10 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.name}</div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                        score {score}
                      </div>
                    </div>
                  </div>
                  <div className="grid flex-1 grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-5">
                    {PLATFORMS.map((p) => {
                      const e = h[p.key];
                      const current =
                        e?.current ?? (a[p.metric.field as keyof Artist] as number | null);
                      if (current == null) return <div key={p.key} />;
                      const pct = e && e.first ? (e.change / e.first) * 100 : null;
                      const Icon = p.Icon;
                      return (
                        <div key={p.key} className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Icon className="size-3 shrink-0" style={{ color: p.color }} />
                            <span className="font-mono text-sm font-semibold tabular-nums">
                              {formatCompact(current)}
                            </span>
                          </div>
                          {pct != null && pct !== 0 && (
                            <div
                              className={cn(
                                "font-mono text-[10px] tabular-nums",
                                pct > 0 ? "text-emerald-500" : "text-rose-500",
                              )}
                            >
                              {pct > 0 ? "+" : ""}
                              {pct.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10 flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-mono text-[10px] text-muted-foreground">
            incighder.vercel.app/g/{encodeURIComponent(name)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Cross-platform traction · live data
          </span>
        </div>
      </div>
    </div>
  );
}
