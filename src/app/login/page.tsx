"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        setError("Wrong passphrase");
        return;
      }
      // Full reload so the AdminProvider re-reads the fresh cookie everywhere.
      window.location.href = "/";
    } catch {
      setError("Something went wrong — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 pt-20">
      <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card">
        <Lock className="size-5 text-primary" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-semibold">Admin access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the passphrase to manage artists.
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <Input
          type="password"
          autoFocus
          placeholder="Passphrase"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Unlock"}
        </Button>
      </form>
      <button
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => router.push("/")}
      >
        Back to the site
      </button>
    </div>
  );
}
