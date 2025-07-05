
import sys
import json
from scrapeArtistData import insert_artist_data_from_json

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python insert_artist_from_json.py <json_data>"}))
        sys.exit(1)

    try:
        artist_json_data = json.loads(sys.argv[1])
        success = insert_artist_data_from_json(artist_json_data)
        if success:
            print(json.dumps({"message": "Artist data inserted successfully"}))
        else:
            print(json.dumps({"error": "Failed to insert artist data"}))
            sys.exit(1)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON data provided"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
