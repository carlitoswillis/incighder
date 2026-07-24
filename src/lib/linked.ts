/**
 * Which platforms an artist is currently linked on.
 *
 * `metric_snapshots` rows outlive the link that produced them: clearing a source
 * drops the link, its scrape_meta entry and its metric columns, but deliberately
 * keeps the recorded history. Anything reading snapshots therefore has to check
 * the link itself, or a cleared platform keeps reporting numbers forever.
 */
export function linkedPlatforms(row: {
  social_links?: unknown;
  spotify_id?: unknown;
}): Set<string> {
  const raw = row.social_links;
  let links: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      links = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Malformed JSON reads as "no links" rather than throwing mid-request.
    }
  } else if (raw && typeof raw === "object") {
    links = raw as Record<string, unknown>;
  }

  const out = new Set<string>();
  for (const [platform, url] of Object.entries(links)) {
    if (url) out.add(platform);
  }
  // Spotify hangs off spotify_id, not social_links.
  if (row.spotify_id) out.add("spotify");
  return out;
}
