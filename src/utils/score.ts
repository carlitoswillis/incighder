import type { Artist } from "@/lib/types";

// Cross-platform traction score (0–200). Three explainable components:
//   Reach   (≤120): log-scaled total audience across every linked platform —
//                   an IG-only skater and a Spotify artist score on the same axis.
//   Breadth (≤30):  +6 per platform with an audience — being everywhere counts.
//   Spotify pop (≤50): Spotify's own 0–100 popularity halved, when present.
// Log scale keeps megastars from flattening everyone else.

const AUDIENCE_FIELDS: { field: keyof Artist; label: string }[] = [
  { field: "instagram_followers", label: "Instagram" },
  { field: "tiktok_followers", label: "TikTok" },
  { field: "youtube_subscribers", label: "YouTube" },
  { field: "soundcloud_followers", label: "SoundCloud" },
  { field: "twitch_followers", label: "Twitch" },
  { field: "x_followers", label: "X" },
];

export const calculateArtistScore = (
  artist: Partial<Artist> & {
    followers?: number | null;
    popularity?: number | null;
    monthly_listeners?: number | null;
  },
): {
  score: number;
  breakdown: string;
} => {
  const audiences: { label: string; count: number }[] = [];

  // Spotify: followers and monthly listeners overlap heavily — count the larger.
  const spotify = Math.max(artist.followers ?? 0, artist.monthly_listeners ?? 0);
  if (spotify > 0) audiences.push({ label: "Spotify", count: spotify });

  for (const { field, label } of AUDIENCE_FIELDS) {
    const v = artist[field];
    if (typeof v === "number" && v > 0) audiences.push({ label, count: v });
  }

  const total = audiences.reduce((s, a) => s + a.count, 0);
  const reach = total > 0 ? Math.min(100, Math.log10(1 + total) * 15) : 0;
  const breadth = Math.min(25, audiences.length * 5);
  const popularity = (artist.popularity ?? 0) * 0.25;
  // Momentum: median weekly audience growth % across tracked platforms,
  // computed server-side from metric_snapshots (momentum_wk_pct on the row).
  const wkPct = artist.momentum_wk_pct;
  const momentum =
    typeof wkPct === "number" ? Math.max(0, Math.min(50, wkPct * 5)) : 0;

  const score = Math.min(200, reach + breadth + momentum + popularity);

  let breakdown = "Score Breakdown:\n";
  if (audiences.length) {
    breakdown += `- Reach: +${reach.toFixed(1)} (${total.toLocaleString()} total audience: ${audiences
      .map((a) => `${a.label} ${a.count.toLocaleString()}`)
      .join(", ")})\n`;
    breakdown += `- Breadth: +${breadth} (${audiences.length} platform${audiences.length === 1 ? "" : "s"})\n`;
  } else {
    breakdown += "- Reach: 0 (no audience data yet)\n";
  }
  if (typeof wkPct === "number") {
    breakdown += `- Momentum: +${momentum.toFixed(1)} (${wkPct >= 0 ? "+" : ""}${wkPct.toFixed(1)}%/week median growth)\n`;
  } else {
    breakdown += "- Momentum: 0 (no growth history yet)\n";
  }
  if (popularity > 0) {
    breakdown += `- Spotify popularity: +${popularity.toFixed(1)} (from ${artist.popularity})\n`;
  }
  breakdown += `\nTotal Score: ${score.toFixed(1)}`;

  return { score: Math.round(score), breakdown };
};
