"""Artist discovery: seed artist -> similar artists (Last.fm) enriched with Spotify.

Last.fm's `artist.getSimilar` provides the free, reliable similarity graph that
Spotify's deprecated related-artists endpoint used to. Each similar name is then
enriched via the existing Spotify search so results match the shape the rest of
the app already renders/inserts, and via `artist.getInfo` for Last.fm global
stats (listeners / playcount / tags).

CLI contract mirrors spotify_search.py: read the seed name from stdin, print
`{"artists": {"items": [...]}}` to stdout.
"""

import os
import sys
import json
import traceback

import requests

from spotify_search import get_spotify_client

LASTFM_API = "http://ws.audioscrobbler.com/2.0/"
MAX_SIMILAR = 12


def _lastfm(method, **params):
    key = os.getenv("LAST_FM_API_KEY") or os.getenv("LASTFM_API_KEY")
    if not key:
        print(json.dumps({"error": "LAST_FM_API_KEY is not configured."}), file=sys.stderr)
        sys.exit(1)
    resp = requests.get(
        LASTFM_API,
        params={"method": method, "api_key": key, "format": "json", **params},
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"Last.fm error {data['error']}: {data.get('message')}")
    return data


def _lastfm_stats(name):
    """Best-effort global listeners/playcount/tags for one artist."""
    try:
        info = _lastfm("artist.getInfo", artist=name).get("artist", {})
        stats = info.get("stats", {})
        tags = [t["name"] for t in info.get("tags", {}).get("tag", [])][:3]
        return {
            "lastfm_listeners": int(stats.get("listeners") or 0) or None,
            "lastfm_playcount": int(stats.get("playcount") or 0) or None,
            "lastfm_tags": tags,
        }
    except Exception:
        return {"lastfm_listeners": None, "lastfm_playcount": None, "lastfm_tags": []}


def _spotify_enrich(sp, name):
    """Resolve a name to its best Spotify match in the simplified app shape."""
    results = sp.search(q=name, type="artist", limit=1)
    items = results.get("artists", {}).get("items", [])
    if not items:
        return None
    item = items[0]

    top_track_name = top_track_popularity = top_track_id = None
    top_tracks = sp.artist_top_tracks(item["id"])
    if top_tracks and top_tracks["tracks"]:
        top_track = top_tracks["tracks"][0]
        top_track_name = top_track["name"]
        top_track_popularity = top_track["popularity"]
        top_track_id = top_track["id"]

    return {
        "id": item["id"],
        "name": item["name"],
        "images": item["images"],
        "genres": item["genres"],
        "popularity": item["popularity"],
        "followers": item["followers"],
        "external_urls": item["external_urls"],
        "top_track_name": top_track_name,
        "top_track_popularity": top_track_popularity,
        "top_track_id": top_track_id,
    }


def similar_artists(sp, seed):
    data = _lastfm("artist.getSimilar", artist=seed, limit=MAX_SIMILAR, autocorrect=1)
    similar = data.get("similarartists", {}).get("artist", [])

    items = []
    for entry in similar:
        name = entry.get("name")
        if not name:
            continue
        try:
            enriched = _spotify_enrich(sp, name)
        except Exception as e:
            print(f"Spotify enrich failed for {name}: {e}", file=sys.stderr)
            enriched = None
        if not enriched:
            continue
        enriched["match"] = float(entry.get("match") or 0)
        enriched.update(_lastfm_stats(name))
        items.append(enriched)

    return {"artists": {"items": items}}


if __name__ == "__main__":
    seed = sys.stdin.read().strip()
    if not seed:
        print(json.dumps({"error": "Missing seed artist name"}), file=sys.stderr)
        sys.exit(1)
    try:
        client = get_spotify_client()
        print(json.dumps(similar_artists(client, seed)))
    except Exception as e:
        print(json.dumps({"error": f"Similar-artists error: {e}"}), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
