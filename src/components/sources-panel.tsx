"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  BadgeCheck,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

import type { Artist } from "@/lib/types";
import { SCRAPED_PLATFORMS } from "@/lib/platforms";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkPreview } from "@/components/link-preview";

type ScrapeStatus = { ok: boolean; error?: string | null; skipped?: string };
type Verdict = { verdict: string; reason?: string; confidence?: number };
type Candidate = { url: string; verdict?: string; reason?: string; confidence?: number };

const VERDICT_STYLE: Record<
  string,
  { cls: string; Icon: typeof BadgeCheck; label: string }
> = {
  match: { cls: "text-emerald-400", Icon: BadgeCheck, label: "AI: looks like the artist" },
  verified: { cls: "text-emerald-400", Icon: BadgeCheck, label: "verified via official search" },
  uncertain: { cls: "text-amber-400", Icon: AlertTriangle, label: "AI unsure — verify this" },
  mismatch: { cls: "text-destructive", Icon: ShieldAlert, label: "AI: likely NOT the artist" },
};

function VerdictBadge({ v }: { v: Verdict }) {
  const s = VERDICT_STYLE[v.verdict];
  if (!s) return null;
  const Icon = s.Icon;
  return (
    <div className={cn("flex items-start gap-1.5 text-xs", s.cls)}>
      <Icon className="mt-px size-3.5 shrink-0" />
      <span>
        {s.label}
        {v.reason ? (
          <span className="text-muted-foreground"> — {v.reason}</span>
        ) : null}
      </span>
    </div>
  );
}

function handleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean);
    return path.length ? path[path.length - 1] : url;
  } catch {
    return url;
  }
}

function AlternatesList({
  items,
  onPick,
}: {
  items: Candidate[];
  onPick: (c: Candidate) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Other matches:</span>
      {items.map((c) => {
        const s = c.verdict ? VERDICT_STYLE[c.verdict] : undefined;
        return (
          <button
            key={c.url}
            type="button"
            onClick={() => onPick(c)}
            className="rounded-md bg-muted px-2 py-0.5 font-mono text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground hover:ring-foreground/20"
            title={`Use this account${c.verdict ? ` — ${s?.label ?? c.verdict}` : ""}`}
          >
            {s ? <s.Icon className={cn("mr-1 inline size-3", s.cls)} /> : null}
            {handleFromUrl(c.url)}
          </button>
        );
      })}
    </div>
  );
}

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
  const [discovering, setDiscovering] = useState(false);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [alternates, setAlternates] = useState<Record<string, Candidate[]>>({});

  // Swap a flagged auto-pick for one of the other search results; the displaced
  // pick goes back into the alternates list so the user can switch back.
  function applyAlternate(platform: string, alt: Candidate) {
    const prevUrl = links[platform];
    const prevVerdict = verdicts[platform];
    setLinks((prev) => ({ ...prev, [platform]: alt.url }));
    setVerdicts((prev) => {
      const n = { ...prev };
      if (alt.verdict) n[platform] = { verdict: alt.verdict, reason: alt.reason, confidence: alt.confidence };
      else delete n[platform];
      return n;
    });
    setAlternates((prev) => {
      const rest = (prev[platform] || []).filter((c) => c.url !== alt.url);
      if (prevUrl) rest.push({ url: prevUrl, ...prevVerdict });
      return { ...prev, [platform]: rest };
    });
  }

  async function handleDiscover() {
    setDiscovering(true);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: artist.name,
          platforms: SCRAPED_PLATFORMS.map((p) => p.key),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Discovery failed");
      const candidates: Record<
        string,
        { url?: string; verdict?: string; reason?: string; confidence?: number; alternates?: Candidate[] }
      > = data.candidates || {};
      const next = { ...links };
      const nextVerdicts: Record<string, Verdict> = {};
      const nextAlternates: Record<string, Candidate[]> = {};
      let filled = 0;
      let flagged = 0;
      for (const p of SCRAPED_PLATFORMS) {
        const c = candidates[p.key];
        if (!c?.url || next[p.key]) continue; // don't clobber a user-entered link
        next[p.key] = c.url;
        filled++;
        if (c.verdict && c.verdict !== "unknown") {
          nextVerdicts[p.key] = { verdict: c.verdict, reason: c.reason, confidence: c.confidence };
          if (c.verdict === "mismatch" || c.verdict === "uncertain") flagged++;
        }
        if (c.alternates?.length) nextAlternates[p.key] = c.alternates;
      }
      setLinks(next);
      setVerdicts((prev) => ({ ...prev, ...nextVerdicts }));
      setAlternates((prev) => ({ ...prev, ...nextAlternates }));
      if (filled)
        toast.success(
          `Found ${filled} link${filled === 1 ? "" : "s"}${flagged ? ` · ${flagged} flagged by AI` : ""} — review, then scrape`,
        );
      else toast.info("No new links found");
    } catch (e) {
      toast.error(`Discovery failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDiscovering(false);
    }
  }

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

  async function handleRemove(platform: string, label: string) {
    setLinks((prev) => ({ ...prev, [platform]: "" }));
    setVerdicts((prev) => {
      const n = { ...prev };
      delete n[platform];
      return n;
    });
    setAlternates((prev) => {
      const n = { ...prev };
      delete n[platform];
      return n;
    });
    setResults((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[platform];
      return next;
    });
    try {
      const res = await fetch("/api/clear-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artist.id, platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove");
      onScraped(data.artist);
      toast.success(`Removed ${label} source`);
    } catch (e) {
      toast.error(`Couldn't remove: ${e instanceof Error ? e.message : String(e)}`);
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
                  onChange={(e) => {
                    setLinks({ ...links, [p.key]: e.target.value });
                    setVerdicts((prev) => {
                      const n = { ...prev };
                      delete n[p.key];
                      return n;
                    });
                    setAlternates((prev) => {
                      const n = { ...prev };
                      delete n[p.key];
                      return n;
                    });
                  }}
                  placeholder={`${p.label} profile URL`}
                />
                {links[p.key] && (
                  <>
                    <LinkPreview url={links[p.key]} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(p.key, p.label)}
                      aria-label={`Remove ${p.label} source`}
                    >
                      <X />
                    </Button>
                  </>
                )}
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
              {verdicts[p.key] && <VerdictBadge v={verdicts[p.key]} />}
              {alternates[p.key]?.length ? (
                <AlternatesList
                  items={alternates[p.key]}
                  onPick={(c) => applyAlternate(p.key, c)}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={handleDiscover}
          disabled={discovering || scraping}
        >
          {discovering ? (
            <>
              <Loader2 className="animate-spin" /> Finding…
            </>
          ) : (
            <>
              <Sparkles /> Auto-discover
            </>
          )}
        </Button>
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
