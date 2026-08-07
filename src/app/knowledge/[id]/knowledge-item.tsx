"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Download, ExternalLink, Pencil, Trash2 } from "lucide-react";

import { useAdmin } from "@/components/admin-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  formatBytes,
  formatKbDate,
  kindIcon,
  selectClass,
  splitTags,
  type KbItem,
} from "../kb";

interface ArtistOption {
  id: string;
  name: string;
}

export default function KnowledgeItemDetail() {
  const params = useParams();
  const router = useRouter();
  const { admin, loading: adminLoading } = useAdmin();
  const itemId = params.id as string;

  const [item, setItem] = useState<KbItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [form, setForm] = useState({ title: "", tags: "", artist_id: "" });

  useEffect(() => {
    if (!admin || !itemId) return;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch(`/api/knowledge/${itemId}`);
        if (r.status === 404) {
          setItem(null);
          return;
        }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setItem(d.item);
        setForm({
          title: d.item.title || "",
          tags: d.item.tags || "",
          artist_id: d.item.artist_id || "",
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [admin, itemId]);

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await fetch(`/api/knowledge/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          tags: form.tags
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .join(","),
          artist_id: form.artist_id || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Update failed");
      setItem(d.item);
      setShowEdit(false);
      toast.success("Saved changes");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const r = await fetch(`/api/knowledge/${itemId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success("Item deleted");
      router.push("/knowledge");
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (adminLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  if (!admin) notFound();
  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  if (error) return <p className="text-sm text-destructive">Error: {error}</p>;
  if (!item) return <p className="text-muted-foreground">Item not found.</p>;

  const Icon = kindIcon(item.kind);
  const tags = splitTags(item.tags);

  return (
    <div className="space-y-6">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to knowledge
      </Link>

      {/* Header */}
      <div className="space-y-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            <Icon /> {item.kind}
          </Badge>
          {item.created_by && <Badge variant="outline">{item.created_by}</Badge>}
          <span className="text-xs text-muted-foreground">
            Added {formatKbDate(item.created_at)}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
        {(item.artist_name || tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.artist_id && item.artist_name && (
              <Link href={`/artists/${item.artist_id}`}>
                <Badge>{item.artist_name}</Badge>
              </Link>
            )}
            {tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span className="truncate">{item.source_url}</span>
          </a>
        )}
        {item.file_name && (
          <p className="text-xs text-muted-foreground">
            {item.file_name}
            {item.file_size != null ? ` · ${formatBytes(item.file_size)}` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {item.file_name && (
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={`/api/knowledge/${item.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Download /> Download original
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowEdit((v) => !v)}>
            <Pencil /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>

      {/* Edit form */}
      {showEdit && (
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
        >
          <div className="space-y-2">
            <Label htmlFor="kb-title">Title</Label>
            <Input
              id="kb-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kb-tags">Tags (comma separated)</Label>
              <Input
                id="kb-tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kb-artist">Artist</Label>
              <select
                id="kb-artist"
                className={cn(selectClass, "w-full")}
                value={form.artist_id}
                onChange={(e) => setForm({ ...form, artist_id: e.target.value })}
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
          <div className="flex gap-2">
            <Button type="submit">Save changes</Button>
            <Button type="button" variant="ghost" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Summary */}
      {item.summary && (
        <div className="space-y-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="text-lg font-semibold tracking-tight">Summary</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {item.summary}
          </p>
        </div>
      )}

      {/* Body */}
      {item.body && (
        <div className="space-y-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="text-lg font-semibold tracking-tight">
            {item.kind === "fact" ? "Fact" : "Extracted text"}
          </h2>
          <div className="max-h-[32rem] overflow-y-auto">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{item.title}”?</DialogTitle>
            <DialogDescription>
              This removes the item
              {item.file_name ? " and its uploaded file" : ""} from the
              knowledgebase. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
