const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en");

/** 2_492_265 -> "2.5M". Use formatFull for the title/tooltip. */
export const formatCompact = (n?: number | null) =>
  n == null ? "—" : compact.format(n);

/** 2_492_265 -> "2,492,265". */
export const formatFull = (n?: number | null) =>
  n == null ? "—" : full.format(n);

/** ISO timestamp -> "just now" / "5m ago" / "2h ago" / "3d ago". */
export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
