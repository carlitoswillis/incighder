-- Migration 0002: expanded per-platform metrics (top-song plays, totals, counts).
-- Apply without wiping data:
--   docker compose exec -T db psql -U postgres -d incighder \
--       < data-api/migrations/0002_more_metrics.sql

ALTER TABLE artists ADD COLUMN IF NOT EXISTS top_track_plays BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS youtube_total_views BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS youtube_video_count INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS soundcloud_track_count INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS instagram_posts INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS instagram_verified BOOLEAN;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS tiktok_video_count INTEGER;
