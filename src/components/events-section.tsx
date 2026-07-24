"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ExternalLink, Plus, Trash2 } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdmin } from "@/components/admin-context";

interface Impact {
  platform: string;
  before: number;
  after: number;
  change: number;
  pct: number | null;
  window_open: boolean;
}

interface EventRow {
  id: number;
  title: string;
  event_type: string | null;
  url: string | null;
  happened_at: string;
  notes: string | null;
  impact: Impact[];
  shared_with?: number;
  shared_names?: string | null;
}

const TYPES = ["release", "video", "reel", "post", "show", "announcement", "press", "other"];

const platformLabel = (key: string) =>
  PLATFORMS.find((p) => p.key === key)?.label ?? key;

// Timeline of releases/videos/announcements with per-platform chips showing
// the change observed in the attribution window AFTER each event. Framed as
// correlation, deliberately: we can't prove the event caused the movement,
// only put the two side by side.
export function EventsSection({
  artistId,
  group,
}: {
  artistId: string;
  group?: string | null;
}) {
  const { admin } = useAdmin();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [groupMates, setGroupMates] = useState<{ id: string; name: string }[]>([]);
  const [alsoApply, setAlsoApply] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!admin || !group) return;
    fetch(`/api/artists?group=${encodeURIComponent(group)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; name: string }[]) =>
        setGroupMates(rows.filter((r) => r.id !== artistId)),
      )
      .catch(() => setGroupMates([]));
  }, [admin, group, artistId]);
  const [form, setForm] = useState({
    title: "",
    event_type: "release",
    happened_at: new Date().toISOString().slice(0, 10),
    url: "",
  });

  const load = useCallback(() => {
    fetch(`/api/events?artist_id=${encodeURIComponent(artistId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [artistId]);

  useEffect(load, [load]);

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_id: artistId,
          artist_ids: [artistId, ...alsoApply],
          ...form,
          url: form.url || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      setShowForm(false);
      setForm((f) => ({ ...f, title: "", url: "" }));
      setAlsoApply(new Set());
      toast.success("Event added");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(id: number) {
    try {
      const r = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEvents((prev) => prev?.filter((e) => e.id !== id) ?? prev);
      toast.success("Event removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (events === null) return null;
  if (events.length === 0 && !admin) return null;

  return (
    <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Events</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Releases, videos, announcements — and how the numbers moved in
            the two weeks after each one.
          </p>
        </div>
        {admin && (
          <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-4" /> Add event
          </Button>
        )}
      </div>

      {admin && showForm && (
        <form
          onSubmit={addEvent}
          className="mt-4 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[1fr_10rem_10rem_1fr_auto]"
        >
          <Input
            placeholder="Title (e.g. “MISS ME” video drop)"
            value={form.title}
            required
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <select
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={form.event_type}
            onChange={(e) => setForm({ ...form, event_type: e.target.value })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t} className="bg-card">
                {t}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={form.happened_at}
            required
            onChange={(e) => setForm({ ...form, happened_at: e.target.value })}
          />
          <Input
            placeholder="Link (optional)"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
          <Button type="submit" size="sm">
            Save
          </Button>
          {groupMates.length > 0 && (
            <div className="sm:col-span-5">
              <span className="text-xs text-muted-foreground">Also applies to:</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {groupMates.map((m) => {
                  const on = alsoApply.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setAlsoApply((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      className={cn(
                        "rounded-md px-2 py-1 text-xs ring-1 ring-inset transition-colors",
                        on
                          ? "bg-primary/15 text-primary ring-primary/40"
                          : "text-muted-foreground ring-border hover:text-foreground",
                      )}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      )}

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No events yet — add a release or video drop and Incighder will show
          how the numbers moved in the weeks after it.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border/60">
          {events.map((e) => (
            <div key={e.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start">
              <div className="flex w-40 shrink-0 items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                {new Date(e.happened_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.title}</span>
                  {e.event_type && <Badge variant="secondary">{e.event_type}</Badge>}
                  {(e.shared_with ?? 0) > 0 && (
                    <Badge
                      variant="secondary"
                      title={e.shared_names ? `Also: ${e.shared_names}` : undefined}
                    >
                      +{e.shared_with} other{e.shared_with === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {e.url && (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground transition-colors hover:text-primary"
                      aria-label="Open link"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                {e.impact.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.impact.map((i) => (
                      <span
                        key={i.platform}
                        title={`${platformLabel(i.platform)}: ${formatCompact(i.before)} → ${formatCompact(i.after)} in the 14 days after${i.window_open ? " (window still open)" : ""}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs tabular-nums ring-1 ring-inset",
                          i.change > 0
                            ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 ring-rose-500/20",
                        )}
                      >
                        {platformLabel(i.platform)}{" "}
                        {i.pct != null
                          ? `${i.pct > 0 ? "+" : ""}${i.pct.toFixed(1)}%`
                          : `${i.change > 0 ? "+" : ""}${formatCompact(i.change)}`}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    impact pending — needs snapshots before and after the event
                  </p>
                )}
              </div>
              {admin && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete event"
                  onClick={() => remove(e.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
