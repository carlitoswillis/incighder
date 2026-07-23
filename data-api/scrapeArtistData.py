
import os
import sys
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import pymysql
from pymysql.constants import FIELD_TYPE
import json
from urllib.parse import urlparse, parse_qs, unquote

from dotenv import load_dotenv

# Standalone scripts (apply_schema.py, flush_db.py) import this module directly
# without going through app.py, so load .env here; find_dotenv walks up to the
# repo root. override=False keeps real environment variables authoritative.
load_dotenv()


# Decode MySQL JSON columns into Python objects on read, matching the behaviour
# psycopg2 gave us for json/jsonb columns (callers expect dict/list, not raw text).
_CONV = pymysql.converters.conversions.copy()
_CONV[FIELD_TYPE.JSON] = lambda v: json.loads(v) if v else None


def _truthy(val):
    return str(val or "").strip().lower() in ("1", "true", "yes", "require", "required", "on")


def _db_config():
    """Connection settings, env-overridable. Defaults target a local MySQL.

    DATABASE_URL (mysql://user:pass@host:port/dbname?ssl=true) wins when set —
    one variable to point the whole stack at a hosted DB (TiDB Serverless,
    Aiven, etc.). Individual DB_* vars still work and fill any gaps. TLS turns
    on via ?ssl=true / ?sslmode=require in the URL or DB_SSL=true in the env.
    """
    url = os.getenv("DATABASE_URL", "").strip()
    host = os.getenv("DB_HOST", os.getenv("PGHOST", "127.0.0.1"))
    port = os.getenv("DB_PORT", "3306")
    user = os.getenv("DB_USER", os.getenv("PGUSER", "incighder"))
    password = os.getenv("DB_PASSWORD", os.getenv("PGPASSWORD", "password"))
    database = os.getenv("DB_NAME", os.getenv("PGDATABASE", "incighder"))
    use_ssl = _truthy(os.getenv("DB_SSL"))

    if url:
        parsed = urlparse(url)
        host = parsed.hostname or host
        port = parsed.port or port
        user = unquote(parsed.username) if parsed.username else user
        password = unquote(parsed.password) if parsed.password else password
        database = parsed.path.lstrip("/") or database
        query = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
        if _truthy(query.get("ssl")) or _truthy(query.get("sslmode")) or _truthy(query.get("ssl-mode")):
            use_ssl = True

    cfg = dict(
        host=host,
        port=int(port),
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        conv=_CONV,
    )
    if use_ssl:
        # Verified TLS against the system/certifi CA bundle — what hosted MySQL
        # providers (TiDB Serverless, Aiven, PlanetScale) expect.
        ca = os.getenv("DB_SSL_CA")
        if not ca:
            try:
                import certifi

                ca = certifi.where()
            except ImportError:
                ca = None
        cfg.update(ssl_verify_cert=True, ssl_verify_identity=True)
        if ca:
            cfg["ssl_ca"] = ca
    return cfg


def get_db_connection():
    """Establishes a connection to the MySQL database."""
    try:
        return pymysql.connect(**_db_config())
    except pymysql.Error as e:
        print(f"Error connecting to database: {e}")
        return None

def get_spotify_client():
    """Initializes the Spotify client using environment variables for credentials."""
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("Error: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables must be set.")
        return None

    client_credentials_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
    return spotipy.Spotify(client_credentials_manager=client_credentials_manager)

# --- Core Functions ---
def get_artist_data(sp, artist_id=None, artist_name=None):
    """Fetches artist data from Spotify by ID or name."""
    if artist_id:
        try:
            return sp.artist(artist_id)
        except Exception as e:
            print(f"Error fetching artist by ID {artist_id}: {e}")
            return None
    elif artist_name:
        results = sp.search(q=f'artist:{artist_name}', type='artist', limit=1)
        items = results['artists']['items']
        if len(items) > 0:
            return items[0]
        else:
            return None
    return None

import uuid

def insert_artist_data(conn, artist_data):
    """Inserts artist data into the 'artists' table."""
    if not artist_data or not conn:
        return

    # Use provided ID (e.g. Spotify ID) or generate a new UUID for manual entries
    artist_id = artist_data.get('id') or str(uuid.uuid4())
    spotify_id = artist_data.get('spotify_id') or (artist_data.get('id') if 'id' in artist_data else None)

    sql = """
    INSERT INTO artists (id, name, followers, popularity, genres, images, external_urls, monthly_listeners, spotify_id, top_track_id, top_track_name, top_track_popularity)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        followers = VALUES(followers),
        popularity = VALUES(popularity),
        genres = VALUES(genres),
        images = VALUES(images),
        external_urls = VALUES(external_urls),
        monthly_listeners = VALUES(monthly_listeners),
        spotify_id = VALUES(spotify_id),
        top_track_id = VALUES(top_track_id),
        top_track_name = VALUES(top_track_name),
        top_track_popularity = VALUES(top_track_popularity);
    """

    try:
        followers_total = artist_data.get('followers', {}).get('total') if isinstance(artist_data.get('followers'), dict) else artist_data.get('followers')
        
        with conn.cursor() as cur:
            print(f"Executing SQL: {sql}", file=sys.stderr)
            cur.execute(sql, (
                artist_id,
                artist_data.get('name'),
                followers_total,
                artist_data.get('popularity'),
                json.dumps(artist_data.get('genres')) if artist_data.get('genres') is not None else None,
                json.dumps(artist_data.get('images')) if artist_data.get('images') is not None else None,
                json.dumps(artist_data.get('external_urls')) if artist_data.get('external_urls') is not None else None,
                artist_data.get('monthly_listeners'),
                spotify_id,
                artist_data.get('top_track_id'),
                artist_data.get('top_track_name'),
                artist_data.get('top_track_popularity')
            ))
        conn.commit()
        print(f"SQL execution successful. Rows affected: {cur.rowcount}", file=sys.stderr)
        return True
    except pymysql.Error as e:
        print(f"Database error: {e}", file=sys.stderr)
        conn.rollback()
        return False

def insert_artist_data_from_json(artist_json_data):
    """Inserts artist data from a JSON object into the 'artists' table."""
    conn = None
    try:
        conn = get_db_connection()
        if conn:
            success = insert_artist_data(conn, artist_json_data)
            return success
        return False
    except Exception as e:
        print(f"Error in insert_artist_data_from_json: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False
    finally:
        if conn:
            conn.close()

# --- Main Execution ---
# if __name__ == "__main__":
#     # Example: Fetch data for a specific artist
#     artist_to_find_id = "3FurXFst81m9HZGWlczFcb"

#     print("Connecting to Spotify and database...")
#     spotify_client = get_spotify_client()
#     db_connection = get_db_connection()

#     if spotify_client and db_connection:
#         print(f"Searching for artist with ID: {artist_to_find_id}...")
#         artist_info = get_artist_data(spotify_client, artist_id=artist_to_find_id)

#         if artist_info:
#             insert_artist_data(db_connection, artist_info)
#         else:
#             print(f"Artist with ID '{artist_to_find_id}' not found on Spotify.")

#         # Clean up
#         db_connection.close()
#         print("Process finished.")
