"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

import type { Artist } from "@/lib/types";
import { SCRAPED_PLATFORMS } from "@/lib/platforms";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ScrapeStatus = { ok: boolean; error?: string | null; skipped?: string };

function initialLinks(artist: Artist): Record<string, string> {
  const links = artist.social_links || {};
  const out: Record<string, string> = {};
  for (const p of SCRAPED_PLATFORMS) {
    out[p.key] =
      links[p.key] ||
      (p.key === "spotify"
        ? artist.external_urls?.spotify ||
          (artist.spotify_id
            ? `https://open.spotify.com/artist/${artist.spotify_id}`
            : "")
        : "");
  }
  return out;
}

export function SourcesPanel({
  artist,
  onScraped,
}: {
  artist: Artist;
  onScraped: (a: Artist) => void;
}) {
  const [links, setLinks] = useState<Record<string, string>>(() =>
    initialLinks(artist),
  );
  const [force, setForce] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [results, setResults] = useState<Record<string, ScrapeStatus> | null>(
    null,
  );

  async function handleScrape() {
    setScraping(true);
    setResults(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artist.id, links, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape failed");
      onScraped(data.artist);
      setResults(data.results || {});
      const ok = Object.values(data.results || {}).filter(
        (r) => (r as ScrapeStatus).ok,
      ).length;
      toast.success(`Scraped ${ok} platform${ok === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(`Scrape failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScraping(false);
    }
  }

  return (
    <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <h2 className="text-lg font-semibold tracking-tight">Sources &amp; scraping</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste profile URLs, then scrape. Results are cached 24h unless you force a
        refresh.
      </p>

      <div className="mt-4 space-y-3">
        {SCRAPED_PLATFORMS.map((p) => {
          const Icon = p.Icon;
          const status = results?.[p.key];
          const meta = artist.scrape_meta?.[p.key];
          return (
            <div key={p.key} className="flex flex-col gap-1.5">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="size-3.5" style={{ color: p.color }} /> {p.label}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={links[p.key] ?? ""}
                  onChange={(e) =>
                    setLinks({ ...links, [p.key]: e.target.value })
                  }
                  placeholder={`${p.label} profile URL`}
                />
                {status && (
                  <span
                    className={cn(
                      "w-14 shrink-0 text-right text-xs",
                      status.ok ? "text-emerald-400" : "text-destructive",
                    )}
                  >
                    {status.skipped ? "cached" : status.ok ? "✓ ok" : "✗ fail"}
                  </span>
                )}
              </div>
              {meta?.last_scraped_at && (
                <span className="text-xs text-muted-foreground">
                  {meta.status === "error"
                    ? `last error: ${meta.error ?? "failed"}`
                    : `updated ${formatRelativeTime(meta.last_scraped_at)}`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <Button onClick={handleScrape} disabled={scraping}>
          {scraping ? (
            <>
              <Loader2 className="animate-spin" /> Scraping…
            </>
          ) : (
            <>
              <RefreshCw /> Scrape now
            </>
          )}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="size-4 accent-primary"
          />
          Force refresh (ignore 24h cache)
        </label>
      </div>
    </section>
  );
}
