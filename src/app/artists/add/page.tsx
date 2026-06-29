"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AddArtistPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/artists/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Add failed");
      toast.success(`Added ${name}`);
      router.push(`/artists/${d.artist.id}?edit=true`);
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Add artist manually" />
      <form
        onSubmit={handleAdd}
        className="space-y-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Artist name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BKTHERULA"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Adding…" : "Add artist"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Or{" "}
          <Link href="/search_spotify" className="text-primary hover:underline">
            search Spotify
          </Link>{" "}
          to pull in full data automatically, or{" "}
          <Link href="/artists/bulk" className="text-primary hover:underline">
            bulk import
          </Link>{" "}
          a list of names.
        </p>
      </form>
    </div>
  );
}
