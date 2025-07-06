
import os
import sys
import json
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv

# Load environment variables from .env file in the parent directory
load_dotenv(dotenv_path='../.env')

def get_spotify_client():
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

    if not client_id or not client_secret:
        print(json.dumps({"error": "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables must be set."}), file=sys.stderr)
        sys.exit(1)

    client_credentials_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
    return spotipy.Spotify(client_credentials_manager=client_credentials_manager)

def search_artist(sp, query):
    try:
        results = sp.search(q=query, type='artist', limit=5)
        # Return only the necessary fields to keep the payload small
        simplified_results = []
        for item in results['artists']['items']:
            simplified_results.append({
                'id': item['id'],
                'name': item['name'],
                'images': item['images'],
                'genres': item['genres'],
                'popularity': item['popularity'],
                'followers': item['followers'],
                'external_urls': item['external_urls']
            })
        return {"artists": {"items": simplified_results}}
    except Exception as e:
        print(json.dumps({"error": f"Spotify API error: {e}"}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python spotify_search.py <artist_name>"}), file=sys.stderr)
        sys.exit(1)

    artist_name_query = sys.argv[1]
    spotify_client = get_spotify_client()
    if spotify_client:
        search_results = search_artist(spotify_client, artist_name_query)
        print(json.dumps(search_results))
