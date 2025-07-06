
import os
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import psycopg2
import json


def get_db_connection():
    """Establishes a connection to the PostgreSQL database."""
    try:
        conn = psycopg2.connect(
            host=os.getenv("PGHOST", "db"),
            database="incighder",
            user="postgres",
            password="password" # Be cautious with hardcoded passwords in production
        )
        return conn
    except psycopg2.Error as e:
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

def insert_artist_data(conn, artist_data):
    """Inserts artist data into the 'artists' table."""
    if not artist_data or not conn:
        return

    sql = """
    INSERT INTO artists (id, name, followers, popularity, genres, images, external_urls, monthly_listeners)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        followers = EXCLUDED.followers,
        popularity = EXCLUDED.popularity,
        genres = EXCLUDED.genres,
        images = EXCLUDED.images,
        external_urls = EXCLUDED.external_urls,
        monthly_listeners = EXCLUDED.monthly_listeners;
    """

    try:
        with conn.cursor() as cur:
            print(f"Executing SQL: {sql}", file=sys.stderr)
            print(f"With values: {(
                artist_data['id'],
                artist_data['name'],
                artist_data['followers']['total'],
                artist_data['popularity'],
                json.dumps(artist_data['genres']),
                json.dumps(artist_data['images']),
                json.dumps(artist_data['external_urls']),
                None # monthly_listeners will be null initially
            )}", file=sys.stderr)
            cur.execute(sql, (
                artist_data['id'],
                artist_data['name'],
                artist_data['followers']['total'],
                artist_data['popularity'],
                json.dumps(artist_data['genres']),
                json.dumps(artist_data['images']),
                json.dumps(artist_data['external_urls']),
                None # monthly_listeners will be null initially
            ))
        conn.commit()
        print(f"SQL execution successful. Rows affected: {cur.rowcount}", file=sys.stderr)
        return True
    except psycopg2.Error as e:
        print(f"Database error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
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
