-- Migration 0003: per-account metric snapshots for growth-over-time tracking.
-- Apply without wiping data:
--   docker compose exec -T db psql -U postgres -d incighder \
--       < data-api/migrations/0003_growth_snapshots.sql

CREATE TABLE IF NOT EXISTS metric_snapshots (
    id SERIAL PRIMARY KEY,
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    account_key VARCHAR(255),
    value BIGINT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
    ON metric_snapshots (artist_id, platform, captured_at);
