FROM python:3.11-slim-bookworm

WORKDIR /app

# Install Python deps first for better layer caching.
COPY data-api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Chromium + its OS dependencies, for the Playwright-based scrapers
# (Instagram/TikTok, and the Spotify monthly-listeners fallback).
RUN playwright install --with-deps chromium

# curl kept for parity with the previous image / container debugging.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY data-api/apply_schema.py .
COPY data-api/app.py .
COPY data-api/spotify_search.py .
COPY data-api/insert_artist_from_json.py .
COPY data-api/scrapers ./scrapers
COPY data-api/schema.sql .

CMD ["python", "app.py"]
