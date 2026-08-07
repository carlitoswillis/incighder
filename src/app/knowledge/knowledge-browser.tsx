"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, Paperclip, Search, Upload } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { useAdmin } from "@/components/admin-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  KB_KINDS,
  fieldClass,
  formatKbDate,
  kindIcon,
  selectClass,
  type KbSearchHit,
} from "./kb";

interface ArtistOption {
  id: string;
  name: string;
}

// The API's hard cap is 4 MB decoded, but the file travels as base64 inside a
// JSON body (~4/3× inflation) and Vercel rejects serverless request bodies
// over ~4.5 MB before the route runs — so the effective client cap is 3 MB.
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_FILE_LABEL = "3 MB";

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      resolve(s.slice(s.indexOf(",") + 1)); // strip the data-URI prefix
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export default function KnowledgeBrowser() {
  const { admin, loading: adminLoading } = useAdmin();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [artistFilter, setArtistFilter] = useState(
    searchParams.get("artist_id") ?? "",
  );
  const [items, setItems] = useState<KbSearchHit[] | null>(null);
  const [artists, setArtists] = useState<ArtistOption[]>([]);

  // Add panel state
  const [addArtist, setAddArtist] = useState(searchParams.get("artist_id") ?? "");
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<{
    index: number;
    total: number;
    name: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [fact, setFact] = useState("");
  const [factTitle, setFactTitle] = useState("");
  const [savingFact, setSavingFact] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (submittedQ) params.set("q", submittedQ);
    if (kindFilter) params.set("kind", kindFilter);
    if (artistFilter) params.set("artist_id", artistFilter);
    params.set("limit", "50");
    try {
      const r = await fetch(`/api/knowledge?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setItems(d.items);
    } catch (e) {
      setItems([]);
      toast.error(
        `Failed to load knowledgebase: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, [submittedQ, kindFilter, artistFilter]);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  useEffect(() => {
    if (!admin) return;
    fetch("/api/artists")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ArtistOption[]) =>
        setArtists(
          Array.isArray(rows)
            ? rows
                .map((a) => ({ id: a.id, name: a.name }))
                .sort((a, b) => a.name.localeCompare(b.name))
            : [],
        ),
      )
      .catch(() => setArtists([]));
  }, [admin]);

  async function addItem(body: Record<string, unknown>): Promise<void> {
    const r = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        ...(addArtist ? { artist_id: addArtist } : {}),
      }),
    });
    // A platform-level rejection (e.g. Vercel's 413 for oversized bodies)
    // returns a non-JSON error page — don't let the parse error mask it.
    const d = await r.json().catch(() => ({}) as { error?: string; item?: never });
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    if (!d.item) throw new Error("Malformed response");
    toast.success(`Saved “${d.item.title}”`);
    load();
  }

  // Sequential on purpose: each file runs a vision-extraction pass server-side,
  // so a parallel burst would spawn one CLI process per file. Per-file failures
  // skip and continue rather than abandoning the rest of the drop.
  async function handleFiles(list: FileList | File[]) {
    if (extracting) return;
    const files = Array.from(list);
    if (!files.length) return;
    setExtracting(true);
    let saved = 0;
    try {
      for (const [i, file] of files.entries()) {
        setProgress({ index: i + 1, total: files.length, name: file.name });
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is over the ${MAX_FILE_LABEL} limit — skipped.`);
          continue;
        }
        if (file.size === 0) {
          toast.error(`${file.name} is empty — skipped.`);
          continue;
        }
        try {
          const b64 = await fileToB64(file);
          await addItem({
            file_b64: b64,
            file_mime: file.type || "application/octet-stream",
            file_name: file.name,
          });
          saved++;
        } catch (e) {
          toast.error(
            `${file.name} failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      if (files.length > 1) {
        toast.success(`Saved ${saved} of ${files.length} files.`);
      }
    } finally {
      setExtracting(false);
      setProgress(null);
    }
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAddingLink(true);
    try {
      await addItem({ source_url: url.trim() });
      setUrl("");
    } catch (e) {
      toast.error(`Failed to add link: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAddingLink(false);
    }
  }

  async function saveFact(e: React.FormEvent) {
    e.preventDefault();
    if (!fact.trim()) return;
    setSavingFact(true);
    try {
      await addItem({
        kind: "fact",
        body: fact.trim(),
        ...(factTitle.trim() ? { title: factTitle.trim() } : {}),
      });
      setFact("");
      setFactTitle("");
    } catch (e) {
      toast.error(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingFact(false);
    }
  }

  if (adminLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  if (!admin) notFound();

  return (
    <div>
      <PageHeader title="Knowledge" count={items ? items.length : undefined} />
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        Facts, documents, images and links GLO can search when answering
        questions — beyond the live platform metrics.
      </p>

      {/* Add panel */}
      <div className="mb-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Tabs defaultValue="upload">
          <TabsList>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="link">Link</TabsTrigger>
            <TabsTrigger value="fact">Fact</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
              }}
              onClick={() => {
                if (!extracting) fileInputRef.current?.click();
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/30",
                extracting && "cursor-default",
              )}
            >
              {extracting ? (
                <>
                  <Loader2 className="size-5 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {progress && progress.total > 1
                      ? `Extracting ${progress.name} (${progress.index} of ${progress.total})…`
                      : "Extracting text — this can take up to a minute…"}
                  </p>
                </>
              ) : (
                <>
                  <Upload className="size-5 text-muted-foreground" />
                  <p className="text-sm">
                    Drop PDFs, decks or images here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Max {MAX_FILE_LABEL} — text is transcribed and summarized
                    automatically
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="link">
            <form onSubmit={addLink} className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button type="submit" disabled={addingLink || !url.trim()}>
                {addingLink ? (
                  "Fetching…"
                ) : (
                  <>
                    <Link2 /> Save link
                  </>
                )}
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              The page&apos;s text is fetched and stored so GLO can search it.
            </p>
          </TabsContent>

          <TabsContent value="fact">
            <form onSubmit={saveFact} className="space-y-2">
              <Input
                placeholder="Title (optional)"
                value={factTitle}
                onChange={(e) => setFactTitle(e.target.value)}
              />
              <textarea
                rows={3}
                className={fieldClass}
                placeholder="e.g. Booking contact for Chief Keef is …"
                value={fact}
                onChange={(e) => setFact(e.target.value)}
              />
              <Button type="submit" disabled={savingFact || !fact.trim()}>
                {savingFact ? "Saving…" : "Save fact"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Label htmlFor="kb-attach" className="text-xs text-muted-foreground">
            Attach to artist
          </Label>
          <select
            id="kb-attach"
            className={selectClass}
            value={addArtist}
            onChange={(e) => setAddArtist(e.target.value)}
          >
            <option value="" className="bg-card">
              None (general)
            </option>
            {artists.map((a) => (
              <option key={a.id} value={a.id} className="bg-card">
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search + filters */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedQ(q.trim());
        }}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the knowledgebase"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          <Search /> Search
        </Button>
        <select
          className={selectClass}
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          aria-label="Filter by kind"
        >
          <option value="" className="bg-card">
            All kinds
          </option>
          {KB_KINDS.map((k) => (
            <option key={k} value={k} className="bg-card">
              {k}
            </option>
          ))}
        </select>
        <select
          className={cn(selectClass, "max-w-44")}
          value={artistFilter}
          onChange={(e) => setArtistFilter(e.target.value)}
          aria-label="Filter by artist"
        >
          <option value="" className="bg-card">
            All artists
          </option>
          {artists.map((a) => (
            <option key={a.id} value={a.id} className="bg-card">
              {a.name}
            </option>
          ))}
        </select>
      </form>

      {/* Results */}
      {items === null ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {submittedQ || kindFilter || artistFilter
            ? "No knowledgebase matches — try different terms or clear the filters."
            : "Nothing saved yet — upload a document, add a link, or save a fact above."}
        </p>
      ) : (
        <div className="divide-y divide-border/60 rounded-xl bg-card ring-1 ring-foreground/10">
          {items.map((it) => {
            const Icon = kindIcon(it.kind);
            return (
              <Link
                key={it.id}
                href={`/knowledge/${it.id}`}
                className="flex flex-col gap-1.5 px-6 py-4 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-secondary/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    <Icon /> {it.kind}
                  </Badge>
                  <span className="min-w-0 font-medium">{it.title}</span>
                  {it.file_name && (
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </div>
                {(it.snippet || it.summary) && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {it.snippet ?? it.summary}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {it.artist_name && (
                    <Badge variant="outline">{it.artist_name}</Badge>
                  )}
                  <span>{formatKbDate(it.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
