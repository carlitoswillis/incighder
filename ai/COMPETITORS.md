# Competitive Landscape

PURPOSE: Who else serves the artist/label/A&R analytics market, what they do well, and where Incighder can realistically differentiate. Informs roadmap priorities.

## Last reviewed: 2026-06-25

## The incumbents
The market is dominated by three mature SaaS platforms. We will not out-breadth them on platform/chart/radio coverage (that's years of data partnerships) — differentiation has to come from positioning.

### Songstats — the closest analog (scouted in depth)
- **Who**: artists, labels, managers, A&R — the same customer as Incighder, far more mature.
- **Coverage**: Spotify, Apple Music, Amazon, Deezer, YouTube, TikTok, Instagram, Facebook, Shazam, SoundCloud, TIDAL, iTunes, Beatport, Traxsource, 1001Tracklists, plus radio.
- **Signature features**: real-time activity **alerts** (playlist/chart hits → push), **Radiostats** (50k+ stations incl. SiriusXM royalties — unique), **Socialstats** (IG/TikTok/YT/FB growth, launched ~June 2026), Apple Watch + mobile apps, full-catalog tracking, reports, marketing recommendations.
- **Pricing**: Premium from ~€11.99/mo (artist), ~€19.99/mo (label); range ~$12.99–$129.99/mo. **A&R scouting/discovery gated to the ~$100/mo professional tier.**
- **Positioning**: cheapest entry point, mobile-first, real-time alerts; strong for electronic/dance (Beatport/Traxsource/1001Tracklists) + radio.

### Chartmetric
- Best-in-class **discovery & advanced filtering**; the A&R scouting leader.

### Soundcharts
- Deepest **professional reporting** and **team collaboration** features.

## Shared weaknesses (openings)
1. **None integrate Spotify-for-Artists private dashboards** — monthly listeners, save rate, source-of-streams live there. Incighder's public-page monthly-listeners scrape is directionally the right instinct.
2. **Data freshness lags** across all three (hours-to-a-day delays, stale follower counts).
3. **Discovery is paywalled/immature** (Songstats gates it at ~$100/mo; Chartmetric leads but charges).
4. **All are SaaS subscriptions** — no local-first / self-hosted / own-your-data option.

## Where Incighder can win
- **Local-first, free, self-hosted, own-your-data** — genuinely distinct for indie artists / budget small labels.
- **A&R discovery as a free first-class feature** (`/discover`, Last.fm) — they gate this.
- **A single weighted cross-platform traction score** as the headline — none lead with this. (On our roadmap.)
- **Change alerts** — they have it, we don't. Our `metric_snapshots` table is already the foundation; a "notify when a metric jumps X%" worker is within reach. Pairs naturally with the scheduled auto-scrape backlog item.

## Most valuable gaps we lack vs them
- Change/threshold **alerts** (foundation exists via `metric_snapshots`).
- **Playlist / chart placement** tracking (we have none).

Sources: songstats.com, songstats.com/pricing, orphiq.com/resources/music-analytics-platforms-compared, lab.songstats.com (Socialstats launch), resources.onestowatch.com (Songstats reviews).
