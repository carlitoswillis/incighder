"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";

type Preview = {
  title?: string;
  image?: string;
  description?: string;
  site_name?: string;
};

/** Click the icon to open the link in a new tab; hover to lazy-load an OG preview. */
export function LinkPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function load() {
    if (fetched) return;
    setFetched(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/preview?url=${encodeURIComponent(url)}`);
      setPreview(res.ok ? await res.json() : {});
    } catch {
      setPreview({});
    } finally {
      setLoading(false);
    }
  }

  return (
    <HoverCard onOpenChange={(open) => open && load()}>
      <HoverCardTrigger
        render={
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open link in new tab"
          />
        }
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ExternalLink className="size-4" />
      </HoverCardTrigger>
      <HoverCardContent className="w-72 overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading preview…
          </div>
        ) : preview?.image || preview?.title ? (
          <div>
            {preview.image && (
              <Image
                src={preview.image}
                alt=""
                width={288}
                height={128}
                unoptimized
                className="h-32 w-full bg-secondary object-cover"
              />
            )}
            <div className="space-y-1 p-3">
              {preview.title && (
                <div className="line-clamp-1 text-sm font-medium">
                  {preview.title}
                </div>
              )}
              {preview.description && (
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {preview.description}
                </div>
              )}
              <div className="truncate text-xs text-primary">{url}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-1 p-3 text-xs text-muted-foreground">
            <div>No preview available — click to open ↗</div>
            <div className="truncate text-primary">{url}</div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
