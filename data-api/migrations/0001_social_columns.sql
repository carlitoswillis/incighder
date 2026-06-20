-- Migration 0001: cross-platform scraping columns on `artists`.
--
-- schema.sql is the canonical full definition, but apply_schema.py DROPs &
-- recreates (i.e. wipes data). Use this idempotent migration to add the columns
-- WITHOUT losing existing rows:
--
--   docker compose exec -T db psql -U postgres -d incighder \
--       < data-api/migrations/0001_social_columns.sql

ALTER TABLE artists ADD COLUMN IF NOT EXISTS youtube_subscribers BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS youtube_top_video_title VARCHAR(255);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS youtube_top_video_views BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS soundcloud_followers BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS soundcloud_top_track VARCHAR(255);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS soundcloud_top_track_plays BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS instagram_followers BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS tiktok_followers BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS tiktok_likes BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS x_followers BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS social_links JSONB;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS scrape_meta JSONB;

-- Counts can exceed INTEGER's 2.1B limit (e.g. YouTube views), so ensure BIGINT.
-- (Widens columns an earlier version of this migration may have created as INTEGER.)
ALTER TABLE artists ALTER COLUMN monthly_listeners TYPE BIGINT;
ALTER TABLE artists ALTER COLUMN youtube_subscribers TYPE BIGINT;
ALTER TABLE artists ALTER COLUMN youtube_top_video_views TYPE BIGINT;
ALTER TABLE artists ALTER COLUMN soundcloud_followers TYPE BIGINT;
ALTER TABLE artists ALTER COLUMN soundcloud_top_track_plays TYPE BIGINT;
ALTER TABLE artists ALTER COLUMN instagram_followers TYPE BIGINT;
ALTER TABLE artists ALTER COLUMN tiktok_followers TYPE BIGINT;
ALTER TABLE artists ALTER COLUMN tiktok_likes TYPE BIGINT;
ALTER TABLE artists ALTER COLUMN x_followers TYPE BIGINT;
