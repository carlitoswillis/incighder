from flask import Flask, request, jsonify
import subprocess
import json
import os

app = Flask(__name__)

@app.route('/insert_artist', methods=['POST'])
def insert_artist():
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    try:
        # Assuming insert_artist_from_json.py can take JSON string as an argument
        # or we modify it to read from stdin
        process = subprocess.run(
            ['python', 'insert_artist_from_json.py'],
            input=json.dumps(data), text=True, capture_output=True, check=True
        )
        return jsonify(json.loads(process.stdout)), 200
    except subprocess.CalledProcessError as e:
        return jsonify({'error': e.stderr}), 500
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON response from script'}), 500

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
        return jsonify({'error': e.stderr}), 500
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON response from script'}), 500

if __name__ == '__main__':
    # Ensure the Flask app is accessible from outside the container
    app.run(host='0.0.0.0', port=5000)