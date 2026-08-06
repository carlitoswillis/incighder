CREATE TABLE IF NOT EXISTS artists (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    -- Visitor curation: only rows with is_public = 1 are shown to
    -- non-admin visitors of the deployed site.
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    -- Biography: fetched from Last.fm or hand-written for artists with no
    -- scrapeable presence. bio_source: 'lastfm' | 'manual'.
    bio TEXT NULL,
    bio_source VARCHAR(32) NULL,
    -- Optional roster separation (e.g. 'glogang'). NULL = main artist list;
    -- grouped rows appear only on /g/<group_name>.
    group_name VARCHAR(64) NULL,
    -- Manual list position (lower = higher); NULL sorts after all pinned rows.
    sort_order INT NULL,
    followers INTEGER NULL,
    popularity INTEGER NULL,
    genres TEXT NULL,
    images JSON NULL,
    external_urls JSON NULL,
    monthly_listeners BIGINT NULL,
    spotify_id VARCHAR(255) NULL,
    youtube_id VARCHAR(255) NULL,
    top_track_id VARCHAR(255) NULL,
    top_track_name VARCHAR(255) NULL,
    top_track_popularity INTEGER NULL,
    top_track_plays BIGINT NULL,

    -- Cross-platform scraping metrics (see ai/SCRAPING_PLAN.md).
    -- Counts are BIGINT: views/plays/likes routinely exceed INTEGER's 2.1B cap.
    youtube_subscribers BIGINT NULL,
    youtube_total_views BIGINT NULL,
    youtube_video_count INTEGER NULL,
    youtube_top_video_title VARCHAR(255) NULL,
    youtube_top_video_views BIGINT NULL,
    soundcloud_followers BIGINT NULL,
    soundcloud_track_count INTEGER NULL,
    soundcloud_top_track VARCHAR(255) NULL,
    soundcloud_top_track_plays BIGINT NULL,
    instagram_followers BIGINT NULL,
    instagram_posts INTEGER NULL,
    instagram_verified BOOLEAN NULL,
    tiktok_followers BIGINT NULL,
    twitch_followers BIGINT NULL,
    tiktok_likes BIGINT NULL,
    tiktok_video_count INTEGER NULL,
    x_followers BIGINT NULL,
    social_links JSON NULL,
    scrape_meta JSON NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS albums (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    release_date VARCHAR(255),
    total_tracks INTEGER,
    images JSON,
    external_urls JSON,
    artist_id VARCHAR(255),
    FOREIGN KEY (artist_id) REFERENCES artists(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tracks (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_ms INTEGER,
    popularity INTEGER,
    explicit BOOLEAN,
    external_urls JSON,
    album_id VARCHAR(255),
    artist_id VARCHAR(255),
    FOREIGN KEY (album_id) REFERENCES albums(id),
    FOREIGN KEY (artist_id) REFERENCES artists(id)
) ENGINE=InnoDB;

-- Per-account metric snapshots for growth-over-time tracking. account_key ties a
-- data point to the specific linked profile, so switching to a different account
-- starts a fresh timeline instead of registering a fake jump.
CREATE TABLE IF NOT EXISTS metric_snapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    artist_id VARCHAR(255),
    platform VARCHAR(32) NOT NULL,
    account_key VARCHAR(255),
    value BIGINT,
    captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    INDEX idx_snapshots_lookup (artist_id, platform, captured_at)
) ENGINE=InnoDB;

-- Tiny shared key/value config. Currently holds `data_api_url`: the public
-- (tunnel) URL of the home-run data-api, published by ./go_live.sh so the
-- deployed frontend can find it without a redeploy.
CREATE TABLE IF NOT EXISTS app_config (
    k VARCHAR(64) PRIMARY KEY,
    v TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Campaign/event tracking: a dated marker (release, video, announcement, ...)
-- overlaid on metric_snapshots so the app can answer "what did this moment do
-- to the numbers?". Impact is computed at read time, not stored.
-- event_artists is the source of truth for who an event applies to (an event
-- can span many people — e.g. a group video); events.artist_id is legacy and
-- mirrors the first tagged person.
CREATE TABLE IF NOT EXISTS events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    artist_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    event_type VARCHAR(32) NULL,
    url VARCHAR(512) NULL,
    happened_at DATE NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
    INDEX idx_events_artist (artist_id, happened_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_artists (
    event_id BIGINT NOT NULL,
    artist_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (event_id, artist_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Per-post/per-video data (IG recent posts, YT recent uploads) so the stats
-- agent can cite specific posts. Keyed per artist so two artists sharing a
-- post never collide. scrape_service also creates this table lazily (no
-- migration framework), so prod TiDB and local MySQL self-heal on first write.
CREATE TABLE IF NOT EXISTS artist_posts (
    artist_id VARCHAR(255) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    post_id VARCHAR(128) NOT NULL,
    url VARCHAR(512) NULL,
    caption TEXT NULL,
    is_video TINYINT(1) NULL,
    posted_at TIMESTAMP NULL,
    likes BIGINT NULL,
    comments BIGINT NULL,
    views BIGINT NULL,
    thumbnail_url TEXT NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (artist_id, platform, post_id),
    INDEX idx_posts_artist (artist_id, platform, posted_at),
    CONSTRAINT fk_posts_artist FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    -- Collation must match artists.id (utf8mb4_unicode_ci) or the FK is
    -- rejected: TiDB's database default is utf8mb4_bin, which is incompatible.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
