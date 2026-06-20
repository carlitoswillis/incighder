
CREATE TABLE artists (
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

    -- Cross-platform scraping metrics (see ai/SCRAPING_PLAN.md).
    -- Counts are BIGINT: views/plays/likes routinely exceed INTEGER's 2.1B cap.
    youtube_subscribers BIGINT NULL,
    youtube_top_video_title VARCHAR(255) NULL,
    youtube_top_video_views BIGINT NULL,
    soundcloud_followers BIGINT NULL,
    soundcloud_top_track VARCHAR(255) NULL,
    soundcloud_top_track_plays BIGINT NULL,
    instagram_followers BIGINT NULL,
    tiktok_followers BIGINT NULL,
    tiktok_likes BIGINT NULL,
    x_followers BIGINT NULL,
    social_links JSONB NULL,
    scrape_meta JSONB NULL
);

CREATE TABLE albums (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    release_date VARCHAR(255),
    total_tracks INTEGER,
    images JSONB,
    external_urls JSONB,
    artist_id VARCHAR(255) REFERENCES artists(id)
);

CREATE TABLE tracks (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_ms INTEGER,
    popularity INTEGER,
    explicit BOOLEAN,
    external_urls JSONB,
    album_id VARCHAR(255) REFERENCES albums(id),
    artist_id VARCHAR(255) REFERENCES artists(id)
);
