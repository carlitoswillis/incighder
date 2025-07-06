
import os
import sys
import json
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import traceback


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
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    query = sys.stdin.read().strip()
    spotify_client = get_spotify_client()
    if spotify_client:
        search_results = search_artist(spotify_client, query)
        print(json.dumps(search_results))
