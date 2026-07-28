import type { Artist } from "@/lib/types";

// Two separate signals, because one number can't honestly mean both "how big are
// they now" and "are they rising" — and Incighder's edge is surfacing the
// small-but-rising, which a size-dominated score buries.
//
//   TRACTION (0–100): established audience/presence right now.
//     Reach   ≤70  — log10 of total audience across every linked platform.
//     Breadth ≤15  — +2.5 per platform with an audience.
//     Spotify ≤15  — Spotify's own 0–100 popularity ×0.15.
//   TRAJECTORY: recent growth — the median weekly audience-change % across
//     tracked platforms (momentum_wk_pct, from metric_snapshots). Shown signed
//     ("+7.1%/wk"); null until there's enough history. trajectoryScore maps it
//     onto a 0–100 dial (50 = flat) for sorting and the ring.
//
// `score` is kept as an alias of `traction` so every existing caller/badge that
// reads `{ score, breakdown }` keeps working unchanged.

const AUDIENCE_FIELDS: { field: keyof Artist; label: string }[] = [
  { field: "instagram_followers", label: "Instagram" },
  { field: "tiktok_followers", label: "TikTok" },
  { field: "youtube_subscribers", label: "YouTube" },
  { field: "soundcloud_followers", label: "SoundCloud" },
  { field: "twitch_followers", label: "Twitch" },
  { field: "x_followers", label: "X" },
];

export type ArtistScore = {
  /** Traction (0–100). Aliased as `score` for back-compat. */
  score: number;
  traction: number;
  /** Traction breakdown, shown in the badge tooltip. */
  breakdown: string;
  /** Median weekly growth %, signed. null = not enough history yet. */
  trajectory: number | null;
  /** Trajectory on a 0–100 dial where 50 = flat. null = no history. */
  trajectoryScore: number | null;
  /** "+7.1%/wk" / "-3.0%/wk" / "flat". null = no history. */
  trajectoryLabel: string | null;
  trajectoryBreakdown: string;
};

// Below this weekly-% magnitude we call it flat rather than up/down.
const FLAT_EPS = 0.05;

export const calculateArtistScore = (
  artist: Partial<Artist> & {
    followers?: number | null;
    popularity?: number | null;
    monthly_listeners?: number | null;
  },
): ArtistScore => {
  const audiences: { label: string; count: number }[] = [];

  // Spotify: followers and monthly listeners overlap heavily — count the larger.
  const spotify = Math.max(artist.followers ?? 0, artist.monthly_listeners ?? 0);
  if (spotify > 0) audiences.push({ label: "Spotify", count: spotify });

  for (const { field, label } of AUDIENCE_FIELDS) {
    const v = artist[field];
    if (typeof v === "number" && v > 0) audiences.push({ label, count: v });
  }

  const total = audiences.reduce((s, a) => s + a.count, 0);
  const reach = total > 0 ? Math.min(70, Math.log10(1 + total) * 10.5) : 0;
  const breadth = Math.min(15, audiences.length * 2.5);
  const popularity = Math.min(15, (artist.popularity ?? 0) * 0.15);
  const traction = Math.round(Math.min(100, reach + breadth + popularity));

  let breakdown = "Traction (audience now):\n";
  if (audiences.length) {
    breakdown += `- Reach: +${reach.toFixed(1)} (${total.toLocaleString()} total: ${audiences
      .map((a) => `${a.label} ${a.count.toLocaleString()}`)
      .join(", ")})\n`;
    breakdown += `- Breadth: +${breadth.toFixed(1)} (${audiences.length} platform${audiences.length === 1 ? "" : "s"})\n`;
  } else {
    breakdown += "- Reach: 0 (no audience data yet)\n";
  }
  if (popularity > 0) {
    breakdown += `- Spotify popularity: +${popularity.toFixed(1)} (from ${artist.popularity})\n`;
  }
  breakdown += `\nTraction: ${traction} / 100`;

  const wkPct = artist.momentum_wk_pct;
  const hasTraj = typeof wkPct === "number";
  const trajectory = hasTraj ? wkPct! : null;
  const trajectoryScore = hasTraj
    ? Math.round(Math.max(0, Math.min(100, 50 + wkPct! * 2.5)))
    : null;
  const trajectoryLabel = !hasTraj
    ? null
    : Math.abs(wkPct!) < FLAT_EPS
      ? "flat"
      : `${wkPct! >= 0 ? "+" : ""}${wkPct!.toFixed(1)}%/wk`;
  const trajectoryBreakdown = hasTraj
    ? `Trajectory: ${trajectoryLabel}\nMedian weekly audience change across tracked platforms (50 = flat on the 0–100 dial).`
    : "Trajectory: no history yet\nNeeds two snapshots a day apart on a tracked platform.";

  return {
    score: traction,
    traction,
    breakdown,
    trajectory,
    trajectoryScore,
    trajectoryLabel,
    trajectoryBreakdown,
  };
};
