import { searchKb, type KbSearchHit } from "./db";

// Auto-recall for GLO: before the model sees a turn, pull the few
// knowledgebase items most likely to matter and inject them into the system
// prompt, so common recall costs zero tool round-trips. searchKb ANDs its
// terms (LIKE-based), so a whole sentence matches nothing — we extract a few
// distinctive words and progressively relax until something hits.

const STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "with", "that", "this", "what",
  "when", "where", "which", "who", "whose", "how", "why", "can", "could",
  "should", "would", "will", "did", "does", "doing", "done", "has", "have",
  "had", "about", "tell", "show", "give", "get", "got", "know", "like",
  "just", "them", "they", "their", "there", "then", "than", "his", "her",
  "him", "she", "you", "your", "our", "out", "any", "all", "not", "but",
  "from", "into", "over", "under", "week", "month", "year", "today", "now",
  "doing", "going", "much", "many", "more", "most", "some", "one", "two",
  "artist", "artists", "roster", "please", "hey", "glo", "whats", "hows",
]);

/** A few distinctive lowercase terms from a message, longest first. */
export function extractTerms(text: string, max = 3): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const w of words) {
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    terms.push(w);
  }
  return terms.sort((a, b) => b.length - a.length).slice(0, max);
}

/** Best-effort knowledge hits for a user message: try the ANDed term set,
 * relax term count on a miss, and fall back to the page artist/group's most
 * recent items. Never throws — recall is a bonus, not a dependency. */
export async function recallKnowledge(opts: {
  message: string;
  artistId?: string;
  group?: string;
}): Promise<KbSearchHit[]> {
  try {
    const terms = extractTerms(opts.message);
    for (let n = terms.length; n >= 1; n--) {
      const hits = await searchKb({ q: terms.slice(0, n).join(" "), limit: 5 });
      if (hits.length) return hits;
    }
    if (opts.artistId || opts.group) {
      return await searchKb({ artistId: opts.artistId, group: opts.group, limit: 3 });
    }
  } catch (e) {
    console.error("Knowledge recall failed:", e);
  }
  return [];
}

/** Compact one-line-per-item block for the system prompt; "" when empty. */
export function formatRecallBlock(hits: KbSearchHit[]): string {
  if (!hits.length) return "";
  return hits
    .map((h) => {
      const attach = h.artist_name || h.group_name;
      const gist = (h.snippet || h.summary || "").replace(/\s+/g, " ").slice(0, 220);
      return `- [#${h.id}] ${h.title}${attach ? ` (${attach})` : ""}${gist ? ` — ${gist}` : ""}`;
    })
    .join("\n");
}
