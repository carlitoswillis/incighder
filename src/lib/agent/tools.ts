import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { linkedPlatforms } from "@/lib/linked";
import { attachMomentum } from "@/lib/momentum";
import { dailySeries, daysBetween, deltaOver, valueOnDay, type DayPoint } from "@/lib/series";
import { calculateArtistScore } from "@/utils/score";
import { formatRelativeTime } from "@/lib/format";
import { getDataApiUrl, dataApiHeaders } from "@/lib/data-api";

// Tool registry for the /api/agent brain. Every tool runs server-side against
// the DB and returns COMPACT, projected JSON — all arithmetic (deltas, %,
// medians) happens here in TS so the model never does its own math. Non-admin
// callers only ever see is_public=1 artists; private artists behave as
// nonexistent (resolution, suggestions and rankings all filter).

type Json = Record<string, unknown>;

export interface AgentToolContext {
  admin: boolean;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Json;
  label: (args: Json) => string;
  run: (args: Json, ctx: AgentToolContext) => Promise<unknown>;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

// NEVER select artists.images (huge data: URIs). scrape_meta is selected but
// only ever projected into per-platform freshness before reaching the model.
const ARTIST_COLUMNS = `id, name, group_name, genres, bio, is_public, spotify_id, social_links, scrape_meta,
  followers, popularity, monthly_listeners, top_track_name, top_track_plays,
  youtube_subscribers, youtube_total_views, youtube_video_count, youtube_top_video_title, youtube_top_video_views,
  soundcloud_followers, soundcloud_track_count, soundcloud_top_track, soundcloud_top_track_plays,
  instagram_followers, instagram_posts, tiktok_followers, tiktok_likes, tiktok_video_count,
  twitch_followers, x_followers`;

type ArtistRow = RowDataPacket & {
  id: string;
  name: string;
  group_name: string | null;
  spotify_id: string | null;
  social_links: unknown;
  scrape_meta: unknown;
};

const DAY_MS = 24 * 3600 * 1000;

/** Common platform-name aliases users type → canonical platform keys. */
const PLATFORM_ALIASES: Record<string, string> = {
  twitter: "x",
  ig: "instagram",
  insta: "instagram",
  yt: "youtube",
  sc: "soundcloud",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function intArg(v: unknown, fallback: number, min = 1, max = 365): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function dayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function shiftDay(day: string, days: number): string {
  return dayString(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS);
}

function cleanGenres(genres: unknown): string[] {
  if (typeof genres !== "string" || !genres) return [];
  return genres
    .replace(/[[\]"']/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseJsonColumn(raw: unknown): Json {
  if (typeof raw === "string") {
    try {
      return (JSON.parse(raw) as Json) ?? {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") return raw as Json;
  return {};
}

interface FreshnessEntry {
  last_scraped_at: string | null;
  status: string | null;
  relative: string;
}

/** scrape_meta projected to per-platform freshness — raw JSON never reaches the model. */
function freshnessOf(row: ArtistRow): Record<string, FreshnessEntry> {
  const meta = parseJsonColumn(row.scrape_meta);
  const out: Record<string, FreshnessEntry> = {};
  for (const [platform, entry] of Object.entries(meta)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { last_scraped_at?: string; status?: string };
    out[platform] = {
      last_scraped_at: e.last_scraped_at ?? null,
      status: e.status ?? null,
      relative: formatRelativeTime(e.last_scraped_at ?? null),
    };
  }
  return out;
}

function lastScrapedOf(row: ArtistRow): { iso: string | null; relative: string } {
  let latest: string | null = null;
  for (const entry of Object.values(freshnessOf(row))) {
    if (entry.last_scraped_at && (!latest || entry.last_scraped_at > latest)) {
      latest = entry.last_scraped_at;
    }
  }
  return { iso: latest, relative: formatRelativeTime(latest) };
}

/** Score a DB row — the loose `social_links: unknown` column needs a cast into Artist. */
function scoreOf(row: ArtistRow & { momentum_wk_pct?: number | null }) {
  return calculateArtistScore(row as unknown as Parameters<typeof calculateArtistScore>[0]);
}

function audienceOf(row: ArtistRow) {
  return {
    spotify_monthly_listeners: num(row.monthly_listeners),
    spotify_followers: num(row.followers),
    youtube_subscribers: num(row.youtube_subscribers),
    instagram_followers: num(row.instagram_followers),
    tiktok_followers: num(row.tiktok_followers),
    soundcloud_followers: num(row.soundcloud_followers),
    twitch_followers: num(row.twitch_followers),
    x_followers: num(row.x_followers),
  };
}

// ── Artist resolution ───────────────────────────────────────────────────────

function similarity(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.8;
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const ga = grams(la);
  const gb = grams(lb);
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return hit / Math.max(1, Math.max(ga.size, gb.size));
}

type Resolved =
  | { row: ArtistRow; error?: undefined; suggestions?: undefined }
  | { row?: undefined; error: string; suggestions: string[] };

/** Exact id → exact name (case-insensitive) → LIKE. Non-admin never sees private artists. */
async function resolveArtist(query: string, admin: boolean): Promise<Resolved> {
  const pool = getPool();
  const vis = admin ? "" : " AND is_public = 1";
  const q = query.trim();
  if (!q) return { error: "Empty artist query", suggestions: [] };

  const [byId] = await pool.query<ArtistRow[]>(
    `SELECT ${ARTIST_COLUMNS} FROM artists WHERE id = ?${vis}`,
    [q],
  );
  if (byId.length) return { row: byId[0] };

  const [byName] = await pool.query<ArtistRow[]>(
    `SELECT ${ARTIST_COLUMNS} FROM artists WHERE LOWER(name) = LOWER(?)${vis}`,
    [q],
  );
  if (byName.length) return { row: byName[0] };

  const likeSafe = q.replace(/[\\%_]/g, "\\$&"); // escape LIKE metacharacters
  const [byLike] = await pool.query<ArtistRow[]>(
    `SELECT ${ARTIST_COLUMNS} FROM artists WHERE name LIKE ?${vis} ORDER BY name LIMIT 6`,
    [`%${likeSafe}%`],
  );
  if (byLike.length === 1) return { row: byLike[0] };
  if (byLike.length > 1) {
    return {
      error: `"${query}" is ambiguous — several artists match`,
      suggestions: byLike.map((r) => r.name),
    };
  }

  const [names] = await pool.query<RowDataPacket[]>(
    `SELECT name FROM artists WHERE 1=1${vis} ORDER BY name`,
  );
  const suggestions = names
    .map((r) => ({ name: String(r.name), score: similarity(String(r.name), q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.name);
  return { error: `No artist matches "${query}"`, suggestions };
}

// ── Snapshot series (history semantics: latest account_key + linked only) ──

interface SnapPoint {
  key: string | null;
  t: string;
  v: number;
}

/** Group ordered snapshot rows: artist_id → platform → points (chronological). */
function groupSnaps(rows: RowDataPacket[]): Map<string, Map<string, SnapPoint[]>> {
  const byArtist = new Map<string, Map<string, SnapPoint[]>>();
  for (const r of rows) {
    const platforms = byArtist.get(String(r.artist_id)) ?? new Map<string, SnapPoint[]>();
    const list = platforms.get(String(r.platform)) ?? [];
    list.push({
      key: r.account_key == null ? null : String(r.account_key),
      t: new Date(r.captured_at).toISOString(),
      v: Number(r.value),
    });
    platforms.set(String(r.platform), list);
    byArtist.set(String(r.artist_id), platforms);
  }
  return byArtist;
}

/**
 * Per-platform day series for the CURRENTLY-linked account only — the same
 * semantics as /api/history: within a platform only rows matching the latest
 * account_key count, and only currently-linked platforms count at all.
 */
function platformDaySeries(
  platforms: Map<string, SnapPoint[]> | undefined,
  linked: Set<string>,
): Map<string, DayPoint[]> {
  const out = new Map<string, DayPoint[]>();
  if (!platforms) return out;
  for (const [platform, series] of platforms) {
    if (!linked.has(platform)) continue;
    const currentKey = series[series.length - 1].key; // most recent account wins
    const points = series.filter((s) => s.key === currentKey).map((s) => ({ t: s.t, v: s.v }));
    if (points.length) out.set(platform, dailySeries(points));
  }
  return out;
}

async function snapsForArtists(ids: string[]): Promise<Map<string, Map<string, SnapPoint[]>>> {
  if (!ids.length) return new Map();
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT artist_id, platform, account_key, value, captured_at FROM metric_snapshots
     WHERE artist_id IN (${ids.map(() => "?").join(",")}) ORDER BY captured_at`,
    ids,
  );
  return groupSnaps(rows);
}

/**
 * Median week-over-week growth % across the day series. Each sample compares a
 * day against the last ACTUAL snapshot at least 7 days earlier, scaled by the
 * real gap to a true weekly rate — same span normalization as momentum.ts, so
 * sparse snapshot history doesn't overstate weekly growth.
 */
function weeklyMedianPct(series: DayPoint[]): number | null {
  const pcts: number[] = [];
  for (const d of series) {
    if (d.day <= series[0].day) continue;
    const target = shiftDay(d.day, -7);
    let prev: DayPoint | null = null;
    for (const p of series) {
      if (p.day <= target) prev = p;
      else break;
    }
    if (prev && prev.v > 0) {
      const span = daysBetween(prev.day, d.day);
      if (span > 0) pcts.push((((d.v - prev.v) / prev.v) * 100 * 7) / span);
    }
  }
  return round1(median(pcts));
}

// ── Misc projections ────────────────────────────────────────────────────────

/** Compact an unknown data-api payload: drop heavy keys, truncate long strings. */
function compactJson(v: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof v === "string") return v.length > 240 ? `${v.slice(0, 240)}…` : v;
  if (Array.isArray(v)) {
    return v.slice(0, 25).map((x) => compactJson(x, depth + 1));
  }
  if (v && typeof v === "object") {
    const out: Json = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === "images" || k === "scrape_meta" || k === "image") continue;
      const c = compactJson(val, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return v;
}

// ── Tools ───────────────────────────────────────────────────────────────────

const listArtists: AgentTool = {
  name: "list_artists",
  description:
    "List the roster: every visible artist with genres, traction score (0-100), weekly momentum %, per-platform audience counts and data freshness. Default spans ALL artists (grouped and ungrouped) with each artist's group noted; pass group to narrow to one group.",
  inputSchema: {
    type: "object",
    properties: {
      group: { type: "string", description: "Only artists in this group (e.g. 'glogang')" },
      all: {
        type: "boolean",
        description: "Explicitly request the whole roster (the default behavior)",
      },
    },
  },
  label: (a) => (a.group ? `Pulling the ${str(a.group)} roster` : "Pulling the full roster"),
  run: async (args, ctx) => {
    const pool = getPool();
    const where: string[] = [];
    const values: string[] = [];
    if (!ctx.admin) where.push("is_public = 1");
    const group = str(args.group).trim();
    if (group) {
      where.push("group_name = ?");
      values.push(group);
    }
    const [rows] = await pool.query<ArtistRow[]>(
      `SELECT ${ARTIST_COLUMNS} FROM artists${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
       ORDER BY (sort_order IS NULL), sort_order, name`,
      values,
    );
    const withMomentum = await attachMomentum(rows);
    return {
      count: withMomentum.length,
      artists: withMomentum.map((row) => {
        const last = lastScrapedOf(row);
        return {
          id: row.id,
          name: row.name,
          group_name: row.group_name ?? null,
          genres: cleanGenres(row.genres),
          traction: scoreOf(row).traction,
          momentum_wk_pct: round1(row.momentum_wk_pct),
          audience: audienceOf(row),
          last_scraped: last.iso,
          last_scraped_relative: last.relative,
        };
      }),
    };
  },
};

const getArtist: AgentTool = {
  name: "get_artist",
  description:
    "Full profile for one artist by id or name: identity, every platform metric, top content, social links, traction score with its human-readable breakdown, weekly momentum %, and per-platform scrape freshness. If no match, returns closest-name suggestions.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Artist id or (partial) name" },
    },
    required: ["query"],
  },
  label: (a) => `Looking up ${str(a.query) || "an artist"}`,
  run: async (args, ctx) => {
    const res = await resolveArtist(str(args.query), ctx.admin);
    if (!res.row) return { error: res.error, suggestions: res.suggestions };
    const [row] = await attachMomentum([res.row]);
    const score = scoreOf(row);
    return {
      id: row.id,
      name: row.name,
      group_name: row.group_name ?? null,
      genres: cleanGenres(row.genres),
      bio: typeof row.bio === "string" ? row.bio.slice(0, 400) : null,
      is_public: Boolean(row.is_public),
      platforms: {
        spotify: {
          monthly_listeners: num(row.monthly_listeners),
          followers: num(row.followers),
          popularity: num(row.popularity),
          top_track_name: row.top_track_name ?? null,
          top_track_plays: num(row.top_track_plays),
        },
        youtube: {
          subscribers: num(row.youtube_subscribers),
          total_views: num(row.youtube_total_views),
          video_count: num(row.youtube_video_count),
          top_video_title: row.youtube_top_video_title ?? null,
          top_video_views: num(row.youtube_top_video_views),
        },
        soundcloud: {
          followers: num(row.soundcloud_followers),
          track_count: num(row.soundcloud_track_count),
          top_track: row.soundcloud_top_track ?? null,
          top_track_plays: num(row.soundcloud_top_track_plays),
        },
        instagram: {
          followers: num(row.instagram_followers),
          posts: num(row.instagram_posts),
        },
        tiktok: {
          followers: num(row.tiktok_followers),
          likes: num(row.tiktok_likes),
          video_count: num(row.tiktok_video_count),
        },
        twitch: { followers: num(row.twitch_followers) },
        x: { followers: num(row.x_followers) },
      },
      social_links: parseJsonColumn(row.social_links),
      traction: score.traction,
      traction_breakdown: score.breakdown,
      momentum_wk_pct: round1(row.momentum_wk_pct),
      freshness: freshnessOf(row),
    };
  },
};

const getGrowth: AgentTool = {
  name: "get_growth",
  description:
    "Growth history for one artist over a window (default 30 days): per linked platform the current value, value at window start, change, %, the same-length prior window's % (accelerating vs decelerating), median weekly growth %, first tracked date and data-point count. All math is precomputed.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Artist id or name" },
      window_days: { type: "number", description: "Window length in days (default 30)" },
      platform: {
        type: "string",
        description: "Limit to one platform (spotify, youtube, instagram, tiktok, soundcloud, twitch, x)",
      },
    },
    required: ["query"],
  },
  label: (a) => `Analyzing growth history for ${str(a.query) || "an artist"}`,
  run: async (args, ctx) => {
    const res = await resolveArtist(str(args.query), ctx.admin);
    if (!res.row) return { error: res.error, suggestions: res.suggestions };
    const row = res.row;
    const window = intArg(args.window_days, 30);
    const rawFilter = str(args.platform).trim().toLowerCase();
    const platformFilter = PLATFORM_ALIASES[rawFilter] ?? rawFilter;

    const byArtist = await snapsForArtists([row.id]);
    const series = platformDaySeries(byArtist.get(row.id), linkedPlatforms(row));

    const today = dayString(Date.now());
    const start = shiftDay(today, -window);
    const priorStart = shiftDay(today, -2 * window);

    let asOf: string | null = null;
    const platforms: Json = {};
    for (const [platform, days] of series) {
      if (platformFilter && platform !== platformFilter) continue;
      const last = days[days.length - 1];
      if (!asOf || last.t > asOf) asOf = last.t;
      const d = deltaOver(days, start, today);
      const prior = deltaOver(days, priorStart, start);
      platforms[platform] = {
        current: d.to ?? last.v,
        value_at_window_start: d.from,
        change: d.change,
        pct: round1(d.pct),
        prior_window_pct: round1(prior.pct),
        weekly_median_pct: weeklyMedianPct(days),
        first_tracked: days[0].t,
        points_in_window: days.filter((x) => x.day >= start).length,
      };
    }
    if (!Object.keys(platforms).length) {
      // A filter that matched nothing shouldn't read as "no history at all"
      // when other platforms have months of it.
      const note =
        platformFilter && series.size
          ? `No snapshot history for ${platformFilter} — platforms with history: ${[...series.keys()].join(", ")}.`
          : "No snapshot history on any linked platform yet.";
      return { artist: row.name, window_days: window, platforms: {}, note };
    }
    return { artist: row.name, window_days: window, as_of: asOf, platforms };
  },
};

const rankRoster: AgentTool = {
  name: "rank_roster",
  description:
    "Rank all visible artists by one metric: growth_pct (total linked audience now vs window start, default 7 days — 'fastest grower'), audience (total audience now), momentum (median weekly growth %), or traction (0-100 score). Returns sorted rows with a human-readable detail per artist.",
  inputSchema: {
    type: "object",
    properties: {
      metric: {
        type: "string",
        enum: ["growth_pct", "audience", "momentum", "traction"],
        description: "What to rank by",
      },
      window_days: { type: "number", description: "Window for growth_pct (default 7)" },
      group: { type: "string", description: "Only rank artists in this group" },
    },
    required: ["metric"],
  },
  label: (a) => `Ranking the roster by ${str(a.metric) || "growth"}`,
  run: async (args, ctx) => {
    const metric = str(args.metric || "growth_pct");
    const window = intArg(args.window_days, 7);
    const pool = getPool();
    const where: string[] = [];
    const values: string[] = [];
    if (!ctx.admin) where.push("is_public = 1");
    const group = str(args.group).trim();
    if (group) {
      where.push("group_name = ?");
      values.push(group);
    }
    const [rows] = await pool.query<ArtistRow[]>(
      `SELECT ${ARTIST_COLUMNS} FROM artists${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`,
      values,
    );
    if (!rows.length) return { metric, rows: [], note: "No artists visible." };
    const withMomentum = await attachMomentum(rows);

    type Ranked = { name: string; group_name: string | null; value: number | null; detail: string };
    let ranked: Ranked[];

    if (metric === "growth_pct") {
      // ONE batched query over metric_snapshots for the whole roster, then
      // per-artist account_key/linked filtering in TS (momentum.ts pattern).
      const byArtist = await snapsForArtists(withMomentum.map((r) => r.id));
      const today = dayString(Date.now());
      const start = shiftDay(today, -window);
      ranked = withMomentum.map((row) => {
        const series = platformDaySeries(byArtist.get(row.id), linkedPlatforms(row));
        let now = 0;
        let then = 0;
        let count = 0;
        for (const [, days] of series) {
          const startVal = valueOnDay(days, start);
          const endVal = days[days.length - 1]?.v;
          if (startVal != null && endVal != null && startVal > 0) {
            now += endVal;
            then += startVal;
            count++;
          }
        }
        const value = then > 0 ? round1(((now - then) / then) * 100) : null;
        return {
          name: row.name,
          group_name: row.group_name ?? null,
          value,
          detail:
            value == null
              ? "not enough history in the window"
              : `${then.toLocaleString()} → ${now.toLocaleString()} total audience across ${count} platform${count === 1 ? "" : "s"} in ${window}d`,
        };
      });
    } else if (metric === "audience") {
      ranked = withMomentum.map((row) => {
        const audience = audienceOf(row);
        // Spotify followers/listeners overlap heavily — count the larger, like the traction score does.
        const spotify = Math.max(audience.spotify_monthly_listeners ?? 0, audience.spotify_followers ?? 0);
        const rest = [
          audience.youtube_subscribers,
          audience.instagram_followers,
          audience.tiktok_followers,
          audience.soundcloud_followers,
          audience.twitch_followers,
          audience.x_followers,
        ].filter((v): v is number => v != null && v > 0);
        const total = spotify + rest.reduce((s, v) => s + v, 0);
        const platforms = (spotify > 0 ? 1 : 0) + rest.length;
        return {
          name: row.name,
          group_name: row.group_name ?? null,
          value: total > 0 ? total : null,
          detail:
            total > 0
              ? `${total.toLocaleString()} total across ${platforms} platform${platforms === 1 ? "" : "s"}`
              : "no audience data",
        };
      });
    } else if (metric === "momentum") {
      ranked = withMomentum.map((row) => ({
        name: row.name,
        group_name: row.group_name ?? null,
        value: round1(row.momentum_wk_pct),
        detail:
          row.momentum_wk_pct == null
            ? "not enough history"
            : `median weekly audience change ${row.momentum_wk_pct >= 0 ? "+" : ""}${row.momentum_wk_pct.toFixed(1)}%/wk`,
      }));
    } else if (metric === "traction") {
      ranked = withMomentum.map((row) => {
        const s = scoreOf(row);
        return {
          name: row.name,
          group_name: row.group_name ?? null,
          value: s.traction,
          detail: `traction ${s.traction}/100${s.trajectoryLabel ? `, trajectory ${s.trajectoryLabel}` : ""}`,
        };
      });
    } else {
      return { error: `Unknown metric "${metric}" — use growth_pct, audience, momentum or traction.` };
    }

    ranked.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    return { metric, window_days: metric === "growth_pct" ? window : undefined, rows: ranked };
  },
};

const getEvents: AgentTool = {
  name: "get_events",
  description:
    "Events (releases, videos, shows, posts...) for one artist with per-platform impact: audience before the event, after (within a 14-day attribution window), change and %. Impact is observed correlation on currently-linked platforms only. Includes other artists tagged on the same event.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Artist id or name" },
    },
    required: ["query"],
  },
  label: (a) => `Reviewing events for ${str(a.query) || "an artist"}`,
  run: async (args, ctx) => {
    const res = await resolveArtist(str(args.query), ctx.admin);
    if (!res.row) return { error: res.error, suggestions: res.suggestions };
    const row = res.row;
    const pool = getPool();

    // shared_names must not leak private artists to visitors.
    const vis = ctx.admin ? "" : " AND a.is_public = 1";
    const [events] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.title, e.event_type, e.url, e.happened_at, e.notes,
              (SELECT GROUP_CONCAT(a.name ORDER BY a.name SEPARATOR ', ')
                 FROM event_artists x JOIN artists a ON a.id = x.artist_id
                WHERE x.event_id = e.id AND x.artist_id <> ?${vis}) AS shared_names
         FROM events e
         JOIN event_artists ea ON ea.event_id = e.id
        WHERE ea.artist_id = ?
        ORDER BY e.happened_at DESC, e.id DESC`,
      [row.id, row.id],
    );
    if (!events.length) return { artist: row.name, events: [], note: "No events recorded yet." };

    const byArtist = await snapsForArtists([row.id]);
    const platforms = byArtist.get(row.id);
    const linked = linkedPlatforms(row);
    const ATTRIBUTION_DAYS = 14;

    const computeImpact = (eventMs: number) => {
      const windowEnd = eventMs + ATTRIBUTION_DAYS * DAY_MS;
      const out: Json[] = [];
      if (!platforms) return out;
      for (const [platform, series] of platforms) {
        if (!linked.has(platform)) continue;
        const currentKey = series[series.length - 1].key;
        const pts = series
          .filter((s) => s.key === currentKey)
          .map((s) => ({ v: s.v, t: Date.parse(s.t) }));
        // Baseline: last reading up to a day after the event (a scrape the next
        // morning is still effectively "at" the event).
        const baseline = [...pts].reverse().find((p) => p.t <= eventMs + DAY_MS);
        const after = [...pts].reverse().find((p) => p.t <= windowEnd);
        if (!baseline || !after || after.t <= baseline.t) continue;
        out.push({
          platform,
          before: baseline.v,
          after: after.v,
          change: after.v - baseline.v,
          pct: baseline.v > 0 ? round1(((after.v - baseline.v) / baseline.v) * 100) : null,
          window_open: Date.now() < windowEnd,
        });
      }
      return out.sort(
        (a, b) => Math.abs((b.pct as number | null) ?? 0) - Math.abs((a.pct as number | null) ?? 0),
      );
    };

    return {
      artist: row.name,
      attribution_window_days: ATTRIBUTION_DAYS,
      events: events.map((e) => ({
        title: e.title,
        event_type: e.event_type,
        url: e.url ?? null,
        happened_at: new Date(e.happened_at).toISOString(),
        notes: e.notes ?? null,
        shared_names: e.shared_names ?? null,
        impact: computeImpact(new Date(e.happened_at).getTime()),
      })),
    };
  },
};

const getPosts: AgentTool = {
  name: "get_posts",
  description:
    "Recent post-level content for one artist (from captured Instagram/TikTok/YouTube posts): url, caption, date, likes/comments/views, plus median likes/views and outlier posts doing >2x the median engagement — cite specific posts and their multiple vs the median.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Artist id or name" },
      platform: { type: "string", description: "Limit to one platform" },
      limit: { type: "number", description: "Max posts to return (default 12)" },
      sort: { type: "string", enum: ["recent", "top"], description: "Sort order (default recent)" },
    },
    required: ["query"],
  },
  label: (a) => `Reading recent posts for ${str(a.query) || "an artist"}`,
  run: async (args, ctx) => {
    const res = await resolveArtist(str(args.query), ctx.admin);
    if (!res.row) return { error: res.error, suggestions: res.suggestions };
    const row = res.row;
    const limit = intArg(args.limit, 12, 1, 50);
    const platform = str(args.platform).trim().toLowerCase();
    const sort = str(args.sort) === "top" ? "top" : "recent";

    let rows: RowDataPacket[];
    try {
      const where = ["artist_id = ?"];
      const values: string[] = [row.id];
      if (platform) {
        where.push("platform = ?");
        values.push(platform);
      }
      [rows] = await getPool().query<RowDataPacket[]>(
        `SELECT platform, url, caption, is_video, posted_at, likes, comments, views
           FROM artist_posts WHERE ${where.join(" AND ")}
          ORDER BY posted_at DESC LIMIT 200`,
        values,
      );
    } catch (e) {
      if ((e as { code?: string }).code === "ER_NO_SUCH_TABLE") {
        return { posts: [], note: "No post-level data captured yet — run a refresh to fetch recent posts." };
      }
      throw e;
    }
    if (!rows.length) {
      return { posts: [], note: "No post-level data captured yet — run a refresh to fetch recent posts." };
    }

    const posts = rows.map((p) => ({
      platform: String(p.platform),
      url: p.url ?? null,
      caption: typeof p.caption === "string" ? p.caption.slice(0, 200) : null,
      posted_at: p.posted_at ? new Date(p.posted_at).toISOString() : null,
      likes: num(p.likes),
      comments: num(p.comments),
      views: num(p.views),
      is_video: Boolean(p.is_video),
    }));

    // Likes (IG/TikTok) and views (YouTube) live on different scales, so
    // medians and outliers are computed WITHIN each platform — never across.
    const engagement = (p: (typeof posts)[number]) => Math.max(p.likes ?? 0, p.views ?? 0);
    const byPlatform = new Map<string, typeof posts>();
    for (const p of posts) {
      const list = byPlatform.get(p.platform) ?? [];
      list.push(p);
      byPlatform.set(p.platform, list);
    }

    const medians: Json = {};
    const outliers: ((typeof posts)[number] & { multiple_vs_median: number | null })[] = [];
    for (const [plat, list] of byPlatform) {
      const medianEng = median(list.map(engagement).filter((v) => v > 0));
      medians[plat] = {
        median_likes: median(list.map((p) => p.likes).filter((v): v is number => v != null)),
        median_views: median(list.map((p) => p.views).filter((v): v is number => v != null)),
        median_engagement: medianEng,
      };
      if (medianEng && medianEng > 0) {
        for (const p of list) {
          if (engagement(p) > 2 * medianEng) {
            outliers.push({ ...p, multiple_vs_median: round1(engagement(p) / medianEng) });
          }
        }
      }
    }

    const sorted = sort === "top" ? [...posts].sort((a, b) => engagement(b) - engagement(a)) : posts;
    return {
      artist: row.name,
      total_captured: posts.length,
      medians_by_platform: medians,
      outliers,
      posts: sorted.slice(0, limit),
    };
  },
};

const compareArtists: AgentTool = {
  name: "compare_artists",
  description:
    "Side-by-side comparison of 2-5 artists: current audience per platform, growth % over the window (default 30 days) per linked platform, traction score and weekly momentum.",
  inputSchema: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description: "2-5 artist ids or names",
      },
      window_days: { type: "number", description: "Growth window in days (default 30)" },
    },
    required: ["queries"],
  },
  label: (a) =>
    Array.isArray(a.queries)
      ? `Comparing ${a.queries.map((q) => str(q)).join(" vs ")}`
      : "Comparing artists",
  run: async (args, ctx) => {
    const queries = Array.isArray(args.queries) ? args.queries.map((q) => str(q)) : [];
    if (queries.length < 2 || queries.length > 5) {
      return { error: "Provide 2-5 artist names or ids to compare." };
    }
    const window = intArg(args.window_days, 30);

    const resolved: ArtistRow[] = [];
    const unresolved: Json[] = [];
    for (const q of queries) {
      const r = await resolveArtist(q, ctx.admin);
      if (r.row) resolved.push(r.row);
      else unresolved.push({ query: q, error: r.error, suggestions: r.suggestions });
    }
    if (resolved.length < 2) {
      return { error: "Fewer than two artists resolved.", unresolved };
    }

    const withMomentum = await attachMomentum(resolved);
    const byArtist = await snapsForArtists(withMomentum.map((r) => r.id));
    const today = dayString(Date.now());
    const start = shiftDay(today, -window);

    const artists = withMomentum.map((row) => {
      const series = platformDaySeries(byArtist.get(row.id), linkedPlatforms(row));
      const growth: Json = {};
      for (const [platform, days] of series) {
        const d = deltaOver(days, start, today);
        growth[platform] = {
          current: d.to ?? days[days.length - 1].v,
          change: d.change,
          pct: round1(d.pct),
        };
      }
      return {
        id: row.id,
        name: row.name,
        group_name: row.group_name ?? null,
        genres: cleanGenres(row.genres),
        traction: scoreOf(row).traction,
        momentum_wk_pct: round1(row.momentum_wk_pct),
        audience: audienceOf(row),
        growth,
      };
    });

    return {
      window_days: window,
      artists,
      ...(unresolved.length ? { unresolved } : {}),
    };
  },
};

const similarArtists: AgentTool = {
  name: "similar_artists",
  description:
    "Discover artists similar to a given name (outside benchmark, via Last.fm/Spotify through the discovery service): name, match strength, listener count, genre tags and Spotify popularity.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Seed artist name" },
    },
    required: ["name"],
  },
  label: (a) => `Finding artists similar to ${str(a.name) || "an artist"}`,
  run: async (args) => {
    const name = str(args.name).trim();
    if (!name) return { error: "Provide a seed artist name." };
    try {
      const res = await fetch(
        `${await getDataApiUrl()}/similar_artists?q=${encodeURIComponent(name)}`,
        { headers: dataApiHeaders(), signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as unknown;
      const items = Array.isArray(data)
        ? data
        : Array.isArray((data as Json)?.results)
          ? ((data as Json).results as unknown[])
          : Array.isArray((data as Json)?.artists)
            ? ((data as Json).artists as unknown[])
            : [];
      return {
        seed: name,
        similar: items.slice(0, 15).map((it) => {
          const o = (it ?? {}) as Json;
          return {
            name: o.name ?? null,
            match: o.match ?? null,
            listeners: num(o.lastfm_listeners),
            genres: o.lastfm_tags ?? null,
            spotify_popularity: num(o.popularity),
          };
        }),
      };
    } catch (e) {
      console.error("similar_artists tool failed:", e);
      return {
        error: "discovery service offline",
        hint: "The Python data-api is unreachable — similar-artist discovery needs it running. Check data_status.",
      };
    }
  },
};

const refreshArtist: AgentTool = {
  name: "refresh_artist",
  description:
    "ADMIN ONLY: trigger a live re-scrape of one artist across all platforms (with link discovery). Slow (up to ~2 minutes). Returns a compact per-platform ok/error summary and any newly discovered links.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Artist id or name" },
    },
    required: ["query"],
  },
  label: (a) => `Refreshing live data for ${str(a.query) || "an artist"}`,
  run: async (args, ctx) => {
    if (!ctx.admin) return { error: "admin required" };
    const res = await resolveArtist(str(args.query), true);
    if (!res.row) return { error: res.error, suggestions: res.suggestions };
    const row = res.row;
    try {
      const response = await fetch(`${await getDataApiUrl()}/refresh_artist`, {
        method: "POST",
        headers: dataApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ artist_id: row.id, discover: true }),
        signal: AbortSignal.timeout(110_000),
      });
      // Stale-worker guard: a dead gunicorn worker serves an HTML error page.
      const text = await response.text();
      if (!response.headers.get("content-type")?.includes("application/json")) {
        console.error(
          `data-api /refresh_artist returned ${response.status} (non-JSON):`,
          text.slice(0, 200),
        );
        return { error: `Refresh failed — data-api returned a non-JSON response (${response.status}).` };
      }
      const payload = JSON.parse(text) as unknown;
      if (!response.ok) {
        return { error: `Refresh failed (${response.status})`, detail: compactJson(payload) };
      }
      return { artist: row.name, refreshed: true, result: compactJson(payload) };
    } catch (e) {
      console.error("refresh_artist tool failed:", e);
      return { error: "Refresh failed — the data-api is unreachable or timed out." };
    }
  },
};

const dataStatus: AgentTool = {
  name: "data_status",
  description:
    "System health: whether the scraping/discovery service is online, how many artists are tracked, freshest and stalest scrape times across the roster, snapshot count and oldest snapshot — answers 'how fresh is this data'.",
  inputSchema: { type: "object", properties: {} },
  label: () => "Checking data freshness",
  run: async (_args, ctx) => {
    let dataApiOnline = false;
    try {
      const res = await fetch(`${await getDataApiUrl()}/health`, {
        headers: dataApiHeaders(),
        signal: AbortSignal.timeout(4_000),
      });
      dataApiOnline = res.ok;
    } catch {
      dataApiOnline = false;
    }

    const pool = getPool();
    const vis = ctx.admin ? "" : " WHERE is_public = 1";
    const out: Json = { data_api_online: dataApiOnline };
    try {
      const [[countRow]] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM artists${vis}`,
      );
      out.artists_tracked = Number(countRow?.c ?? 0);

      const snapVis = ctx.admin
        ? ""
        : " WHERE artist_id IN (SELECT id FROM artists WHERE is_public = 1)";
      const [[snapRow]] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c, MIN(captured_at) AS oldest FROM metric_snapshots${snapVis}`,
      );
      out.snapshot_count = Number(snapRow?.c ?? 0);
      out.oldest_snapshot = snapRow?.oldest ? new Date(snapRow.oldest).toISOString() : null;

      const [metaRows] = await pool.query<ArtistRow[]>(
        `SELECT id, name, group_name, spotify_id, social_links, scrape_meta FROM artists${vis}`,
      );
      let freshest: string | null = null;
      let stalest: string | null = null;
      for (const row of metaRows) {
        const last = lastScrapedOf(row).iso;
        if (!last) continue;
        if (!freshest || last > freshest) freshest = last;
        if (!stalest || last < stalest) stalest = last;
      }
      out.freshest_scrape = freshest;
      out.freshest_scrape_relative = formatRelativeTime(freshest);
      out.stalest_scrape = stalest;
      out.stalest_scrape_relative = formatRelativeTime(stalest);
    } catch (e) {
      console.error("data_status DB queries failed:", e);
      out.note = "Database stats unavailable.";
    }
    return out;
  },
};

export const agentTools: AgentTool[] = [
  listArtists,
  getArtist,
  getGrowth,
  rankRoster,
  getEvents,
  getPosts,
  compareArtists,
  similarArtists,
  refreshArtist,
  dataStatus,
];
