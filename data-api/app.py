from flask import Flask, request, jsonify
import subprocess
import json
import os
import sys
import atexit
import traceback

from scrape_service import scrape_artist, clear_platform, metric_history
from scrapers.discovery import discover_links
from link_preview import link_preview
from scrapers.base import shutdown as _scraper_shutdown

app = Flask(__name__)
atexit.register(_scraper_shutdown)

@app.route('/insert_artist', methods=['POST'])
def insert_artist():
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    try:
        process = subprocess.run(
            ['python', 'insert_artist_from_json.py'],
            input=json.dumps(data), text=True, capture_output=True, check=True
        )
        return jsonify(json.loads(process.stdout)), 200
    except subprocess.CalledProcessError as e:
        print(f"Subprocess error (insert_artist): STDOUT: {e.stdout}, STDERR: {e.stderr}", file=sys.stderr)
        return jsonify({'error': e.stderr.strip() if e.stderr else 'Unknown subprocess error'}), 500
    except json.JSONDecodeError as json_e:
        print(f"JSON decode error (insert_artist): {json_e}. Raw stdout: {process.stdout}, Raw stderr: {process.stderr}", file=sys.stderr)
        return jsonify({'error': 'Invalid JSON response from script'}), 500
    except Exception as e:
        print(f"Unexpected error (insert_artist): {e}", file=sys.stderr)
        return jsonify({'error': str(e)}), 500

@app.route('/spotify_search', methods=['GET'])
def spotify_search():
    query = request.args.get('q')
    if not query:
        return jsonify({'error': 'Missing search query'}), 400

    try:
        process = subprocess.run(
            ['python', 'spotify_search.py'],
            input=query, text=True, capture_output=True, check=True
        )
        return jsonify(json.loads(process.stdout)), 200
    except subprocess.CalledProcessError as e:
        print(f"Subprocess error (spotify_search): STDOUT: {e.stdout}, STDERR: {e.stderr}", file=sys.stderr)
        return jsonify({'error': e.stderr.strip() if e.stderr else 'Unknown subprocess error'}), 500
    except json.JSONDecodeError as json_e:
        print(f"JSON decode error (spotify_search): {json_e}. Raw stdout: {process.stdout}, Raw stderr: {process.stderr}", file=sys.stderr)
        return jsonify({'error': 'Invalid JSON response from script'}), 500
    except Exception as e:
        print(f"Unexpected error (spotify_search): {e}", file=sys.stderr)
        return jsonify({'error': str(e)}), 500

@app.route('/scrape', methods=['POST'])
def scrape():
    data = request.json or {}
    artist_id = data.get('artist_id')
    if not artist_id:
        return jsonify({'error': 'artist_id is required'}), 400
    try:
        result = scrape_artist(
            artist_id,
            links=data.get('links') or {},
            force=bool(data.get('force')),
        )
        return jsonify(result), 200
    except LookupError:
        return jsonify({'error': 'Artist not found'}), 404
    except Exception as e:
        print(f"Scrape error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': str(e)}), 500

@app.route('/discover', methods=['POST'])
def discover():
    data = request.json or {}
    name = data.get('name')
    if not name:
        return jsonify({'error': 'name is required'}), 400
    try:
        candidates = discover_links(name, data.get('platforms'))
        return jsonify({'candidates': candidates}), 200
    except Exception as e:
        print(f"Discover error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': str(e)}), 500

@app.route('/preview', methods=['GET'])
def preview():
    url = request.args.get('url')
    if not url:
        return jsonify({}), 200
    try:
        return jsonify(link_preview(url)), 200
    except Exception as e:
        print(f"Preview error: {e}", file=sys.stderr)
        return jsonify({}), 200

@app.route('/history', methods=['GET'])
def history():
    artist_id = request.args.get('artist_id')
    if not artist_id:
        return jsonify({'error': 'artist_id is required'}), 400
    try:
        return jsonify(metric_history(artist_id)), 200
    except Exception as e:
        print(f"History error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return jsonify({}), 200

@app.route('/clear_source', methods=['POST'])
def clear_source():
    data = request.json or {}
    artist_id = data.get('artist_id')
    platform = data.get('platform')
    if not artist_id or not platform:
        return jsonify({'error': 'artist_id and platform are required'}), 400
    try:
        return jsonify({'artist': clear_platform(artist_id, platform)}), 200
    except LookupError:
        return jsonify({'error': 'Artist not found'}), 404
    except Exception as e:
        print(f"Clear source error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Ensure the Flask app is accessible from outside the container
    app.run(host='0.0.0.0', port=5000)
