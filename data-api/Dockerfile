FROM python:3.9-slim-buster

WORKDIR /app

COPY data-api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y curl

COPY data-api/apply_schema.py .
COPY data-api/app.py .
COPY data-api/spotify_search.py .
COPY data-api/insert_artist_from_json.py .
COPY schema.sql .


CMD ["python", "app.py"]