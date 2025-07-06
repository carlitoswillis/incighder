
CREATE TABLE artists (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    followers INTEGER,
    popularity INTEGER,
    genres TEXT,
    images JSON,
    external_urls JSON,
    monthly_listeners INTEGER,
    top_track_id VARCHAR(255),
    top_track_name VARCHAR(255),
    top_track_popularity INTEGER
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
