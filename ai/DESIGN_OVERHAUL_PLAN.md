# UI Design Overhaul Plan

PURPOSE: Self-contained brief for an agent executing a full visual redesign of the
Incighder frontend. Read `ai/AGENTS.md` and `ai/ARCHITECTURE.md` first for repo
rules. This is a **presentational refactor** — do not change API routes, data
shapes, or scraper logic.

## Last Updated: 2026-06-20
## Status: Ready to execute (not started)

---

## 1. Direction (decided)

- **Aesthetic:** modern **dark analytics dashboard** — slate base, single **cyan**
  accent, data-forward and dense. Think Linear / Vercel / Spotify-dark.
- **Components:** **shadcn/ui** (Radix + Tailwind, New York style). The project is
  already Next 15.2 + React 19 + Tailwind v4, which shadcn supports.
- **Scope:** **full overhaul, phased** — design tokens first, then every page.
- **Mode:** dark-first. A light theme is out of scope (can come later via the same
  CSS-variable tokens).

## 2. Current State (what you're replacing)

- Styling is inconsistent: `globals.css` has hand-written `.artist-card` /
  `.spreadsheet-table` / `.remove-button` classes; `page.tsx`, `table/page.tsx`,
  `artists/[id]/page.tsx`, `layout.tsx`, `Navbar.tsx` use **inline `style={{}}`**;
  `search_spotify/page.tsx` and `artists/add/page.tsx` use ad-hoc Tailwind. Body is
  light `#f0f0f0`. No tokens, no reusable components, `window.confirm`/`alert` for
  UX, plain "Loading..." text.
- **Goal:** delete all of that in favor of tokens + shadcn + a small custom
  component set, with zero behavior change.

Pages today: `/` (artist cards), `/table`, `/artists/[id]` (detail + edit form +
"Sources & Scraping" panel + cross-platform metrics), `/search_spotify`,
`/artists/add`. Global `Navbar` (missing a Table link).

## 3. Data the UI must present (already in the app)

- **Artist:** name, genres (comma string), images (`[{url}]`), external_urls
  (`{spotify}`), followers, popularity, **score** (`utils/score.ts`, 0–200 capped).
- **Cross-platform metrics:** `monthly_listeners`, `youtube_subscribers` +
  `youtube_top_video_{title,views}`, `soundcloud_followers` +
  `soundcloud_top_track{,_plays}`, `instagram_followers`, `tiktok_followers` +
  `tiktok_likes`, `x_followers` (manual).
- **`social_links`** JSON (per-platform input URLs) and **`scrape_meta`** JSON
  (`{platform: {last_scraped_at, status, error}}`) → drive the Sources panel and
  freshness indicators.
- Actions: search Spotify → add; manual add; edit (PATCH); delete; **scrape**
  (`POST /api/scrape` with `{artist_id, links, force}` → returns `{results, artist}`).

## 4. Design Tokens (define as shadcn CSS variables in `globals.css`)

Dark theme values (use Tailwind/shadcn slate + cyan):

| Token | Value | Use |
|---|---|---|
| `background` | `#0B0F19` (≈ slate-950) | app base |
| `card` / surface | `#0F172A` (slate-900) | cards, panels |
| elevated surface | `#1E293B` (slate-800) | hover, popovers |
| `border` | `#1E293B`→`#334155` | hairlines / emphasis |
| `foreground` | `#F1F5F9` (slate-100) | primary text |
| `muted-foreground` | `#94A3B8` (slate-400) | secondary text |
| `primary` (accent) | `#22D3EE` / `#06B6D4` (cyan-400/500) | CTAs, links, focus ring, highlights |
| success / error / warn | emerald-400 / rose-400 / amber-400 | scrape status, alerts |
| radius | `0.5rem` base (`rounded-lg` cards, `rounded-md` controls) | — |

- **Typography:** add **Geist** (or Inter) via `next/font`; headings tight
  tracking; **all numeric metrics use `tabular-nums`** so columns align.
- **Elevation:** prefer hairline borders + subtle `ring-1 ring-white/5` over heavy
  shadows on dark.
- **Platform brand meta** (centralize in `lib/platforms.ts`): Spotify `#1DB954`,
  YouTube `#FF0000`, SoundCloud `#FF5500`, Instagram `#E1306C`, TikTok `#FE2C55`,
  X `#E7E9EA`. Each maps to a brand icon (see §5) + label.

## 5. Tech Setup

1. `npx shadcn@latest init` — New York style, base color **Slate**, CSS variables
   **yes**. With React 19 + npm you may need `--legacy-peer-deps` on Radix installs.
2. **Dark-first:** set `<html lang="en" className="dark">` in `layout.tsx` (or wire
   `next-themes` if a toggle is wanted — optional, dark is the default).
3. **Icons:** `lucide-react` (ships with shadcn) for UI glyphs; **`react-icons`**
   (Simple Icons set: `SiSpotify`, `SiYoutube`, `SiSoundcloud`, `SiInstagram`,
   `SiTiktok`, `SiX`) for platform brand logos.
4. **next/image:** ensure `next.config.ts` `images.remotePatterns` covers artist
   image hosts (`i.scdn.co`, etc.); scraped images can come from many hosts, so
   allow the needed patterns or set `unoptimized` for those. Verify images still load.
5. shadcn components to add: `button card input label table badge tooltip dialog
   dropdown-menu sonner skeleton tabs avatar separator sheet progress`.

## 6. Component Inventory (custom, on top of shadcn)

- **`AppShell` / `Navbar`** — sticky dark top bar: "Incighder" wordmark (cyan
  accent), nav links with active state (Artists, Table, Search, **add a Table
  link**, Add), right-aligned primary "Add Artist". Mobile → `Sheet` drawer.
- **`PageHeader`** — page title + count + right-side actions.
- **`ArtistCard`** — avatar, name, genre `Badge`s, `ScoreBadge`, a compact row of
  platform metrics (brand icon + value), View/Delete actions (Delete → `Dialog`
  confirm + toast). Replaces `.artist-card`.
- **`ScoreBadge` / `ScoreRing`** — visualize the 0–200 score (ring or pill with the
  cyan accent); tooltip shows the breakdown from `calculateArtistScore`.
- **`PlatformIcon`** — platform key → brand icon + brand color.
- **`StatTile`** + **`MetricGrid`** — per-platform tile (icon, label,
  `tabular-nums` value, optional sub e.g. top track/video). Detail-page grid.
- **`SourcesPanel`** — per-platform link `Input`s, "Scrape now" `Button` (loading
  spinner), per-platform `StatusChip` (ok/error/cached) + `FreshnessBadge`
  ("updated 2h ago" from `scrape_meta`), force-refresh toggle.
- **`StatusChip`**, **`FreshnessBadge`**, **`EmptyState`**, **`PageHeader`**.
- **`lib/format.ts`** — compact number formatting (`2,492,265` → `2.5M`, full value
  in `title`/tooltip) and relative time. **`lib/platforms.ts`** — brand meta.

## 7. Page-by-Page Specs

- **AppShell/Navbar:** as above; add the missing `/table` link; active route styling
  with the cyan accent.
- **Home `/`:** `PageHeader` ("Artists" + count). A **single-column stack of
  large, full-width `ArtistCard`s** — one artist per row, each dominating the
  viewport as you scroll (NOT a dense grid). Mobile-first: big image on top,
  side-by-side (image left ~40%) at `md+`; large name, genre badges, prominent
  `ScoreBadge`, and a spacious row of platform `StatTile`s. Loading → `Skeleton`
  cards. Empty → `EmptyState` (CTA to Search). Delete → `Dialog` + `sonner`
  toast (replaces `window.confirm`/`alert`).
- **Artist detail `/artists/[id]`:** hero header (large `Avatar`, name, genre
  badges, `ScoreRing`, Spotify link, Edit/Delete). `MetricGrid` of `StatTile`s for
  all platforms (incl. manual X). `SourcesPanel` for scraping. Edit form → styled
  `Input`/`Label`/`Textarea` in a card or `Dialog` (keep current PATCH behavior,
  incl. that it only sends edited fields). Score breakdown in a tooltip/collapsible.
- **Table `/table`:** shadcn `Table`, sticky header, zebra + hover, **client-side
  sortable** columns; add the new metric columns (score, monthly listeners, YT
  subs, IG, TikTok) with small brand icons in headers; row → detail; horizontal
  scroll on mobile.
- **Search `/search_spotify`:** `Input` + `Button` search w/ loading; results grid
  reusing card styling; "Add to dataset" → toast.
- **Add `/artists/add`:** centered card with `Input` + `Button`; success → toast +
  link to the new artist's edit page.

## 8. UX Upgrades to Include

- Replace **all** `window.confirm` / `alert` with `Dialog` + `sonner` toasts.
- `Skeleton` loading states everywhere (no bare "Loading...").
- Score visualization; brand icons + colors for instant platform recognition.
- `tabular-nums` + compact formatting for every metric; full value on hover.
- Freshness indicators from `scrape_meta`; clear ✓/✗/cached per platform.
- Focus-visible cyan rings; `aria-label`s on icon-only buttons; respects
  `prefers-reduced-motion`.

## 9. File Structure (target)

```
incighder/src/
  app/...                    # pages restyled (no inline styles)
  components/
    ui/                      # shadcn components
    app-shell.tsx
    page-header.tsx
    artist-card.tsx
    score-badge.tsx
    platform-icon.tsx
    stat-tile.tsx  metric-grid.tsx
    sources-panel.tsx  status-chip.tsx  freshness-badge.tsx
    empty-state.tsx
  lib/
    utils.ts                 # cn()
    format.ts                # numbers + relative time
    platforms.ts             # brand color/icon/label per platform
```

## 10. Phased Task List

**Phase A — Foundations**
- [ ] `shadcn init` (Tailwind v4, slate, CSS vars); dark-first on `<html>`.
- [ ] Install `react-icons`; add the shadcn components from §5.
- [ ] Define tokens in `globals.css`; add `next/font` (Geist/Inter); remove legacy
      `.artist-card`/`.spreadsheet-table`/`.remove-button` rules + light body bg.
- [ ] `lib/utils.ts`, `lib/format.ts`, `lib/platforms.ts`.
- [ ] `AppShell`/`Navbar` (+ `/table` link) and `PageHeader`. Build passes.

**Phase B — Core screens** — done
- [x] Home → big one-per-row `ArtistCard`s, `ScoreBadge` ring, skeletons,
      `EmptyState`, delete `Dialog` + toast.
- [x] Artist detail: hero, `MetricGrid`/`StatTile`, `SourcesPanel`, restyled edit
      form (scrape + edit + delete preserved).

**Phase C — Remaining pages** — done
- [x] Table: shadcn table + new metric columns (click-to-sort deferred to polish).
- [x] Search and Add (restyled, toasts).

**Phase D — Polish**
- [ ] Sonner toasts wired app-wide; loading/empty/error states; mobile `Sheet` nav;
      a11y + focus pass; confirm no inline styles remain.

## 11. Constraints & Non-Goals

- **Do not** touch `data-api/`, the Next API routes (`/api/*`), the DB, or scraper
  logic. Presentational only; keep all current functionality (search, add, edit,
  delete, scrape) working identically.
- Keep TypeScript clean — no new `tsc --noEmit` errors. (The pre-existing missing
  `@types/pg` warning is unrelated; optionally `npm i -D @types/pg`.)
- Do not regress the scraping flow: the detail page must still POST `/api/scrape`
  with `{artist_id, links, force}` and render `result.artist` + per-platform status.
- No light theme, no new pages, no data-model changes in this pass.

## 12. Verification

- `npm run build` and `tsc --noEmit` clean (besides the known `pg` warning).
- Each page visually reviewed in the running app (`docker compose up`); spot-check
  responsive (mobile width) and dark contrast.
- Functional parity: add from search, manual add, edit/save, delete, and a live
  scrape all still work and update the UI.

---

# Appendix — concrete reference for the implementing agent

Centralize a shared `Artist` type in `lib/types.ts` (the home and detail pages
currently each redeclare it) covering all columns in §3, and import it everywhere.

## A. Design tokens (`globals.css`)

After `shadcn init`, overwrite the generated `.dark` palette with the values below
(keep whatever variable *format* shadcn emitted — raw hex or `hsl(...)`). Set
`<html className="dark">` and `body` → `bg-background text-foreground antialiased`.

| shadcn var | hex | ~Tailwind |
|---|---|---|
| `--background` | `#0B0F19` | slate-950 |
| `--foreground` | `#F1F5F9` | slate-100 |
| `--card`, `--popover` | `#0F172A` | slate-900 |
| `--muted` | `#1E293B` | slate-800 |
| `--muted-foreground` | `#94A3B8` | slate-400 |
| `--border`, `--input` | `#1E293B` | slate-800 |
| `--primary`, `--ring` | `#22D3EE` | cyan-400 |
| `--primary-foreground` | `#08121A` | near-black (contrast on cyan) |
| `--accent` | `#164E63` | cyan-900 (hover surfaces) |
| `--destructive` | `#FB7185` | rose-400 |
| `--radius` | `0.5rem` | |

Status colors (not shadcn vars — small map / Tailwind classes): success
`#34D399` (emerald-400), warning `#FBBF24` (amber-400).

## B. `lib/platforms.ts` (reference)
```ts
import type { IconType } from 'react-icons';
import { SiSpotify, SiYoutube, SiSoundcloud, SiInstagram, SiTiktok, SiX } from 'react-icons/si';

export type PlatformKey = 'spotify' | 'youtube' | 'soundcloud' | 'instagram' | 'tiktok' | 'x';

export interface PlatformMeta {
  key: PlatformKey;
  label: string;
  color: string;             // brand hex (icon tint)
  Icon: IconType;
  scraped: boolean;          // x is manual-only
  linkField?: PlatformKey;   // key in artist.social_links (scraped platforms)
  metric: { field: string; label: string };           // primary count column
  extra?: { field: string; label: string };           // e.g. tiktok likes
  sub?: { titleField: string; valueField: string; valueLabel: string }; // top track/video
}

export const PLATFORMS: PlatformMeta[] = [
  { key: 'spotify', label: 'Spotify', color: '#1DB954', Icon: SiSpotify, scraped: true, linkField: 'spotify',
    metric: { field: 'monthly_listeners', label: 'Monthly listeners' } },
  { key: 'youtube', label: 'YouTube', color: '#FF0000', Icon: SiYoutube, scraped: true, linkField: 'youtube',
    metric: { field: 'youtube_subscribers', label: 'Subscribers' },
    sub: { titleField: 'youtube_top_video_title', valueField: 'youtube_top_video_views', valueLabel: 'views' } },
  { key: 'soundcloud', label: 'SoundCloud', color: '#FF5500', Icon: SiSoundcloud, scraped: true, linkField: 'soundcloud',
    metric: { field: 'soundcloud_followers', label: 'Followers' },
    sub: { titleField: 'soundcloud_top_track', valueField: 'soundcloud_top_track_plays', valueLabel: 'plays' } },
  { key: 'instagram', label: 'Instagram', color: '#E1306C', Icon: SiInstagram, scraped: true, linkField: 'instagram',
    metric: { field: 'instagram_followers', label: 'Followers' } },
  { key: 'tiktok', label: 'TikTok', color: '#FE2C55', Icon: SiTiktok, scraped: true, linkField: 'tiktok',
    metric: { field: 'tiktok_followers', label: 'Followers' },
    extra: { field: 'tiktok_likes', label: 'likes' } },
  { key: 'x', label: 'X', color: '#E7E9EA', Icon: SiX, scraped: false,
    metric: { field: 'x_followers', label: 'Followers (manual)' } },
];

export const SCRAPED_PLATFORMS = PLATFORMS.filter((p) => p.scraped); // SourcesPanel iterates these
```

## C. `lib/format.ts` (reference)
```ts
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');

export const formatCompact = (n?: number | null) => (n == null ? '—' : compact.format(n)); // 2.5M
export const formatFull = (n?: number | null) => (n == null ? '—' : full.format(n));        // 2,492,265 (use in title=)

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
```

## D. Component contracts
```ts
// score is 0..200 (utils/score.ts). Ring fill = min(score,200)/200; cyan accent.
ScoreBadge({ score, breakdown, size }: { score: number; breakdown?: string; size?: 'sm' | 'lg' });
PlatformIcon({ platform, className }: { platform: PlatformKey; className?: string });
StatTile({ platform, artist }: { platform: PlatformMeta; artist: Artist });   // Icon+label+formatCompact (title=formatFull)+sub/extra
MetricGrid({ artist }: { artist: Artist });                                   // PLATFORMS -> StatTile, responsive
ArtistCard({ artist, onDeleted }: { artist: Artist; onDeleted: (id: string) => void });
SourcesPanel({ artist, onScraped }: { artist: Artist; onScraped: (a: Artist) => void }); // POST /api/scrape
StatusChip({ status, error }: { status: 'ok' | 'error' | 'cached'; error?: string | null });
FreshnessBadge({ iso }: { iso?: string | null });                             // "updated 2h ago"
EmptyState({ title, action }: { title: string; action?: React.ReactNode });
```

## E. Wireframes

Home card (`ArtistCard`):
```
┌──────────────────────────────────────────────┐
│ (avatar)  BKTHERULA                      ⋯    │  name + menu (Edit/Delete)
│           [rap] [atlanta]            ◯ 87     │  genre Badges + ScoreBadge
│  ───────────────────────────────────────      │
│   2.5M    297K   119K   768K   634K           │  brand-icon stat row (compact)
│   ♪Spot   ▶YT    ☁SC    ◉IG    ♫TT            │
│                                  View profile→ │
└──────────────────────────────────────────────┘
```

Artist detail:
```
←Back
╭ hero ──────────────────────────────────────╮
│ (avatar) BKTHERULA        ◯ Score 87        │
│          [rap][atlanta]   ▶Spotify  Edit ⋯  │
╰─────────────────────────────────────────────╯
╭ MetricGrid (StatTiles) ─────────────────────╮
│ [♪ Spotify 2.5M] [▶ YouTube 297K · top…]    │
│ [☁ SC 119K · top…] [◉ IG 768K] [♫ TT 634K]  │
│ [𝕏 X 12K (manual)]                           │
╰──────────────────────────────────────────────╯
╭ SourcesPanel ───────────────────────────────╮
│ spotify   [______url______] ✓ updated 2h ago│
│ youtube   [______url______] ✓ updated 2h ago│
│ …  ☐ force refresh         [ Scrape now ]    │
╰──────────────────────────────────────────────╯
```

Table: sticky dark header; columns `Artist | Score | Followers | Monthly | YT | IG |
TikTok | links`; client-sortable; row hover; click → detail; horizontal scroll on mobile.

## F. Per-page acceptance criteria

- **Home:** responsive 1/2/3-col grid; skeleton cards while loading; `EmptyState`
  + CTA when none; delete via `Dialog` + toast; card shows avatar, name, genre
  badges, score, compact metric row. No inline styles.
- **Detail:** hero + `ScoreBadge` (breakdown in tooltip); `MetricGrid` covers all 6
  platforms incl. manual X; `SourcesPanel` scrapes and shows status + freshness;
  edit form restyled and still PATCHes only edited fields; delete → home.
- **Table:** sortable columns incl. the new metrics; sticky header; row → detail.
- **Search / Add:** restyled inputs/buttons; loading + toasts; add flows unchanged.
- **Global:** dark tokens applied; Geist font; `Sonner` mounted; `AppShell` nav with
  active states + mobile `Sheet`; `tsc --noEmit` / `npm run build` clean; every
  prior behavior (search, add, edit, delete, scrape) intact.
