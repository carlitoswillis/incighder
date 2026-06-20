-- Migration 0001: cross-platform scraping columns on `artists`.
--
-- schema.sql is the canonical full definition, but apply_schema.py DROPs &
-- recreates (i.e. wipes data). Use this idempotent migration to add the columns
-- WITHOUT losing existing rows:
--
--   docker compose exec -T db psql -U postgres -d incighder \
--       < data-api/migrations/0001_social_columns.sql

ALTER TABLE artists ADD COLUMN IF NOT EXISTS youtube_subscribers INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS youtube_top_video_title VARCHAR(255);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS youtube_top_video_views INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS soundcloud_followers INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS soundcloud_top_track VARCHAR(255);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS soundcloud_top_track_plays INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS instagram_followers INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS tiktok_followers INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS tiktok_likes INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS x_followers INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS social_links JSONB;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS scrape_meta JSONB;
