import sys
import json
import traceback
from scrapeArtistData import insert_artist_data_from_json

if __name__ == "__main__":
    try:
        # Read JSON data from stdin
        artist_json_data = json.load(sys.stdin)
        success = insert_artist_data_from_json(artist_json_data)
        if success:
            print(json.dumps({"message": "Artist data inserted successfully"}))
        else:
            print(json.dumps({"error": "Failed to insert artist data"}))
            sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON data provided: {e}"}), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)