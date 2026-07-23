CREATE TABLE IF NOT EXISTS artists (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
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
