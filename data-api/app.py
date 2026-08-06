from flask import Flask, request, jsonify
import subprocess
import json
import os
import shutil
import sys
import atexit
import tempfile
import traceback

# Load repo-root .env so API keys / DB settings are available when run natively
# (in Docker these came from compose's env_file). Searches parent dirs for .env.
from dotenv import load_dotenv
load_dotenv()

from scrape_service import scrape_artist, refresh_artist, clear_platform, metric_history
from scrapers.discovery import discover_links
from link_preview import link_preview
from scrapers.base import shutdown as _scraper_shutdown

app = Flask(__name__)
atexit.register(_scraper_shutdown)

@app.before_request
def _require_shared_secret():
    """The cloudflared tunnel makes this API publicly reachable, so every
    request (except the liveness probe) must present the shared secret the
    Next.js proxies send. No DATA_API_SECRET configured = open (local dev)."""
    secret = os.getenv('DATA_API_SECRET')
    if not secret or request.path == '/health':
        return None
    if request.headers.get('X-Data-Api-Secret') != secret:
        return jsonify({'error': 'unauthorized'}), 401


@app.route('/health', methods=['GET'])
def health():
    """Liveness probe — the deployed site pings this to show the 'home data
    server offline' banner."""
    return jsonify({'ok': True}), 200

def _claude_bin():
    """pm2's PATH usually lacks ~/.local/bin, where the Claude Code installer
    puts the binary — resolve explicitly before giving up."""
    found = shutil.which('claude')
    if found:
        return found
    fallback = os.path.expanduser('~/.local/bin/claude')
    return fallback if os.access(fallback, os.X_OK) else None


@app.route('/agent_turn', methods=['POST'])
def agent_turn():
    """One GLO model turn on this machine's logged-in Claude Code CLI
    (subscription auth), so the deployed site needs no API key. Called by the
    Vercel /api/agent route through the tunnel; request/envelope shapes match
    src/lib/agent/cli-provider.ts. Guarded by the shared secret like every
    other route; gunicorn's --timeout 180 leaves headroom for the 150s cap."""
    body = request.get_json(silent=True) or {}
    prompt = body.get('prompt')
    if not isinstance(prompt, str) or not prompt.strip():
        return jsonify({'error': 'prompt required'}), 400
    claude = _claude_bin()
    if not claude:
        return jsonify({'error': 'claude CLI not found on the data-api host'}), 501
    args = [claude, '-p', '--output-format', 'json',
            '--model', str(body.get('model') or os.getenv('GLO_CLI_MODEL', 'sonnet'))]
    if body.get('schema'):
        args += ['--json-schema', json.dumps(body['schema'])]
    if body.get('resume_session_id'):
        args += ['--resume', str(body['resume_session_id'])]
    try:
        # Neutral cwd so the run never loads this repo's agent context.
        proc = subprocess.run(args, input=prompt, capture_output=True, text=True,
                              timeout=150, cwd=tempfile.gettempdir())
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'claude CLI timed out'}), 504
    if proc.returncode != 0:
        return jsonify({'error': f'claude exited {proc.returncode}: {proc.stderr.strip()[:300]}'}), 502
    try:
        return jsonify(json.loads(proc.stdout)), 200
    except ValueError:
        return jsonify({'error': 'claude returned non-JSON output'}), 502


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """Speech-to-text bridge for GLO's mic: the Vercel /api/agent/transcribe
    route forwards audio here when its own runtime has no Gemini key, so the
    deployed site transcribes using this machine's .env. Body:
    {mime, audio_b64}; reply {text}."""
    import ai_verify
    if not ai_verify.GEMINI_API_KEY:
        return jsonify({'error': 'no Gemini key configured on the data-api host'}), 501
    body = request.get_json(silent=True) or {}
    audio_b64 = body.get('audio_b64')
    mime = str(body.get('mime') or 'audio/webm')
    if not isinstance(audio_b64, str) or not audio_b64:
        return jsonify({'error': 'audio_b64 required'}), 400
    if len(audio_b64) > 12 * 1024 * 1024:  # ~8MB of audio, base64-inflated
        return jsonify({'error': 'audio too large'}), 413
    payload = {
        'contents': [{'role': 'user', 'parts': [
            {'text': ('Transcribe this audio verbatim. Return ONLY the spoken words as '
                      'plain text — no quotes, no commentary, no timestamps. If there is '
                      'no intelligible speech, return an empty string.')},
            {'inline_data': {'mime_type': mime, 'data': audio_b64}},
        ]}],
        'generationConfig': {'temperature': 0, 'maxOutputTokens': 1024,
                             'thinkingConfig': {'thinkingBudget': 0}},
    }
    try:
        import requests as _requests
        resp = _requests.post(ai_verify.GEMINI_URL, params={'key': ai_verify.GEMINI_API_KEY},
                              json=payload, timeout=45)
        resp.raise_for_status()
        parts = resp.json()['candidates'][0]['content'].get('parts') or []
        text = ''.join(p.get('text', '') for p in parts).strip()
        return jsonify({'text': text}), 200
    except Exception as e:
        print(f"Transcription error: {e}", file=sys.stderr)
        return jsonify({'error': 'transcription failed'}), 502


@app.route('/speak', methods=['POST'])
def speak():
    """Text-to-speech bridge for GLO's spoken replies: Gemini TTS in a natural
    British delivery, using this machine's key when the Vercel runtime has
    none. Body {text}; reply audio/wav (Gemini returns raw 16-bit mono PCM,
    wrapped in a WAV header here)."""
    import ai_verify
    import re as _re
    import struct as _struct
    import base64 as _base64
    from flask import Response as _Response
    if not ai_verify.GEMINI_API_KEY:
        return jsonify({'error': 'no Gemini key configured on the data-api host'}), 501
    body = request.get_json(silent=True) or {}
    text = str(body.get('text') or '').strip()[:2000]
    if not text:
        return jsonify({'error': 'text required'}), 400
    model = os.getenv('GLO_TTS_MODEL', 'gemini-2.5-flash-preview-tts')
    voice = os.getenv('GLO_TTS_VOICE', 'Despina')
    style = os.getenv('GLO_TTS_STYLE',
                      'Read this aloud as a poised British woman with a natural, warm '
                      'English accent — conversational and unhurried, like a sharp '
                      'manager briefing a friend')
    payload = {
        'contents': [{'role': 'user', 'parts': [{'text': f'{style}: {text}'}]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}},
        },
    }
    try:
        import requests as _requests
        resp = _requests.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            params={'key': ai_verify.GEMINI_API_KEY}, json=payload, timeout=45)
        resp.raise_for_status()
        parts = resp.json()['candidates'][0]['content'].get('parts') or []
        inline = next((p['inlineData'] for p in parts if p.get('inlineData')), None)
        if not inline or not inline.get('data'):
            return jsonify({'error': 'speech service returned no audio'}), 502
        pcm = _base64.b64decode(inline['data'])
        m = _re.search(r'rate=(\d+)', inline.get('mimeType') or '')
        rate = int(m.group(1)) if m else 24000
        header = (b'RIFF' + _struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt '
                  + _struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * 2, 2, 16)
                  + b'data' + _struct.pack('<I', len(pcm)))
        return _Response(header + pcm, mimetype='audio/wav')
    except Exception as e:
        print(f"Speech synthesis error: {e}", file=sys.stderr)
        return jsonify({'error': 'speech synthesis failed'}), 502


@app.route('/insert_artist', methods=['POST'])
def insert_artist():
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    try:
        process = subprocess.run(
            [sys.executable, 'insert_artist_from_json.py'],
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
            [sys.executable, 'spotify_search.py'],
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

@app.route('/similar_artists', methods=['GET'])
def similar_artists_route():
    query = request.args.get('q')
    if not query:
        return jsonify({'error': 'Missing seed artist name'}), 400

    try:
        process = subprocess.run(
            [sys.executable, 'similar_artists.py'],
            input=query, text=True, capture_output=True, check=True
        )
        return jsonify(json.loads(process.stdout)), 200
    except subprocess.CalledProcessError as e:
        print(f"Subprocess error (similar_artists): STDOUT: {e.stdout}, STDERR: {e.stderr}", file=sys.stderr)
        return jsonify({'error': e.stderr.strip() if e.stderr else 'Unknown subprocess error'}), 500
    except json.JSONDecodeError as json_e:
        print(f"JSON decode error (similar_artists): {json_e}. Raw stdout: {process.stdout}, Raw stderr: {process.stderr}", file=sys.stderr)
        return jsonify({'error': 'Invalid JSON response from script'}), 500
    except Exception as e:
        print(f"Unexpected error (similar_artists): {e}", file=sys.stderr)
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

@app.route('/refresh_artist', methods=['POST'])
def refresh_artist_route():
    data = request.json or {}
    artist_id = data.get('artist_id')
    if not artist_id:
        return jsonify({'error': 'artist_id is required'}), 400
    try:
        return jsonify(refresh_artist(
            artist_id,
            force=bool(data.get('force')),
            # Opt-out: omitted means discover, matching the historical behaviour.
            discover=data.get('discover', True) is not False,
        )), 200
    except LookupError:
        return jsonify({'error': 'Artist not found'}), 404
    except Exception as e:
        print(f"Refresh error: {e}", file=sys.stderr)
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
    # PORT is what cloud hosts (Render, Fly, ...) inject; DATA_API_PORT matches
    # the local dev convention in start_dev.sh.
    port = int(os.getenv('PORT', os.getenv('DATA_API_PORT', '5050')))
    app.run(host='0.0.0.0', port=port)
