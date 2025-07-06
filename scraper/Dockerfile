FROM python:3.9-slim-buster

WORKDIR /app

COPY scraper/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y curl

COPY scraper/apply_schema.py .
COPY scraper/app.py .
COPY scraper/spotify_search.py .
COPY scraper/insert_artist_from_json.py .
COPY schema.sql .


CMD ["python", "app.py"]