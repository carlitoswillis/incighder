from flask import Flask, request, jsonify
import subprocess
import json
import os
import sys

app = Flask(__name__)

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

if __name__ == '__main__':
    # Ensure the Flask app is accessible from outside the container
    app.run(host='0.0.0.0', port=5000)