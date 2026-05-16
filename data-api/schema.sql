
CREATE TABLE artists (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    followers INTEGER NULL,
    popularity INTEGER NULL,
    genres TEXT NULL,
    images JSON NULL,
    external_urls JSON NULL,
    monthly_listeners INTEGER NULL,
    spotify_id VARCHAR(255) NULL,
    youtube_id VARCHAR(255) NULL,
    top_track_id VARCHAR(255) NULL,
    top_track_name VARCHAR(255) NULL,
    top_track_popularity INTEGER NULL
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
