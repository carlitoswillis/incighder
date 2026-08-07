import {
  FileText,
  ImageIcon,
  Lightbulb,
  Link2,
  type LucideIcon,
} from "lucide-react";

// Client-side mirrors of the API's KbItemMeta/KbItem/KbSearchHit shapes.
export interface KbItemMeta {
  id: number;
  kind: string;
  title: string;
  summary: string | null;
  tags: string | null;
  source_url: string | null;
  artist_id: string | null;
  artist_name: string | null;
  group_name: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbItem extends KbItemMeta {
  body: string | null;
}

export interface KbSearchHit extends KbItemMeta {
  snippet: string | null;
  score: number;
}

export const KB_KINDS = ["fact", "document", "image", "link"] as const;

const KIND_ICONS: Record<string, LucideIcon> = {
  fact: Lightbulb,
  document: FileText,
  image: ImageIcon,
  link: Link2,
};

export const kindIcon = (kind: string): LucideIcon =>
  KIND_ICONS[kind] ?? FileText;

export const formatKbDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const splitTags = (tags: string | null): string[] =>
  tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Shared form-control styles (same look as events-section's select and
// artist-detail's textareas).
export const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

export const fieldClass =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
