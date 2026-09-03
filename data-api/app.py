from flask import Flask, request, jsonify
import subprocess
import collections
import functools
import hmac
import json
import os
import shutil
import sys
import atexit
import tempfile
import threading
import time
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
    Next.js proxies send.

    Fails CLOSED: an unset DATA_API_SECRET used to mean "open", which is a
    misconfiguration away from publishing an unauthenticated /agent_turn to the
    internet. Set DATA_API_SECRET in the repo-root .env for local dev too — the
    Next side (src/lib/data-api.ts) reads the same file."""
    if request.path == '/health':
        return None
    secret = os.getenv('DATA_API_SECRET')
    if not secret:
        return jsonify({'error': 'server misconfigured: DATA_API_SECRET unset'}), 503
    presented = request.headers.get('X-Data-Api-Secret') or ''
    if not hmac.compare_digest(presented, secret):
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


# /agent_turn, /web_search and /extract_doc each spawn a real Claude Code
# process per request, so a leaked shared secret would otherwise buy unmetered
# use of this machine's subscription. Two independent brakes, both GLOBAL rather
# than per-caller: every request arrives from Vercel through one cloudflared
# tunnel, so remote_addr is the tunnel for everyone and per-IP buckets would be
# meaningless.
CLAUDE_RATE_LIMIT = int(os.getenv('CLAUDE_RATE_LIMIT', '20'))     # per window
CLAUDE_RATE_WINDOW = float(os.getenv('CLAUDE_RATE_WINDOW', '60')) # seconds
CLAUDE_MAX_CONCURRENT = int(os.getenv('CLAUDE_MAX_CONCURRENT', '2'))
# Hard ceiling per turn. This CLI has no --max-turns; --max-budget-usd is the
# equivalent bound, and it is enforced even on subscription auth (the CLI still
# accounts list-price cost per turn).
CLAUDE_MAX_BUDGET_USD = os.getenv('CLAUDE_MAX_BUDGET_USD', '0.75')

_rate_lock = threading.Lock()
_rate_hits: collections.deque = collections.deque()
_agent_slots = threading.BoundedSemaphore(max(1, CLAUDE_MAX_CONCURRENT))


def _rate_limited():
    """Sliding window over the last CLAUDE_RATE_WINDOW seconds. Returns the
    seconds to wait when over the limit, else None (and records the hit)."""
    if CLAUDE_RATE_LIMIT <= 0:
        return None
    now = time.monotonic()
    with _rate_lock:
        cutoff = now - CLAUDE_RATE_WINDOW
        while _rate_hits and _rate_hits[0] < cutoff:
            _rate_hits.popleft()
        if len(_rate_hits) >= CLAUDE_RATE_LIMIT:
            return max(1, int(_rate_hits[0] + CLAUDE_RATE_WINDOW - now) + 1)
        _rate_hits.append(now)
        return None


def _claude_guarded(fn):
    """Rate-limit and concurrency-cap a route that spawns the Claude CLI.

    One shared budget across every such route: they all draw on the same
    subscription on the same machine, so limiting them separately would just
    move a leaked-secret abuser from /agent_turn to /web_search."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        retry_after = _rate_limited()
        if retry_after:
            return (jsonify({'error': 'rate limited'}), 429,
                    {'Retry-After': str(retry_after)})
        # Non-blocking: queueing here would pile requests up behind the ~150s
        # subprocess timeout and exhaust gunicorn's 8 threads.
        if not _agent_slots.acquire(blocking=False):
            return (jsonify({'error': 'agent busy'}), 429, {'Retry-After': '10'})
        try:
            return fn(*args, **kwargs)
        finally:
            _agent_slots.release()
    return wrapper


@app.route('/agent_turn', methods=['POST'])
@_claude_guarded
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
            '--model', str(body.get('model') or os.getenv('GLO_CLI_MODEL', 'sonnet')),
            # Blackout the headless session's own capabilities: without this the
            # model can go hunting in its real environment (observed live: it
            # ran ToolSearch, found only unrelated MCP tools, and refused).
            # Defence in depth, because this process is reachable from the
            # public internet through the tunnel: --tools '' removes the
            # built-in set, --allowed-tools '' leaves the permission allowlist
            # empty so nothing re-enables one, --permission-prompts none denies
            # (rather than hangs on) anything that would still ask, and
            # --restricted drops the command/code-running tools and ignores
            # user/project settings files so a stray ~/.claude settings file
            # cannot widen any of it.
            '--tools', '', '--allowed-tools', '', '--restricted',
            '--permission-prompts', 'none', '--strict-mcp-config',
            # Per-turn ceiling. This CLI has no --max-turns; --max-budget-usd is
            # the equivalent bound and is enforced on subscription auth too.
            '--max-budget-usd', str(CLAUDE_MAX_BUDGET_USD)]
    if body.get('schema'):
        args += ['--json-schema', json.dumps(body['schema'])]
    if body.get('system'):
        args += ['--append-system-prompt', str(body['system'])]
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


# Enforced shape of an /extract_doc reply (mirrors Extraction in
# src/lib/knowledge/extract.ts, snake_case).
_EXTRACT_SCHEMA = {
    'type': 'object',
    'properties': {
        'title': {'type': 'string'},
        'text': {'type': 'string'},
        'summary': {'type': 'string'},
        'tags': {'type': 'array', 'items': {'type': 'string'}},
        'suggested_artist': {'type': ['string', 'null']},
    },
    'required': ['title', 'text', 'summary', 'tags', 'suggested_artist'],
}


# Big knowledgebase originals live on this machine's disk, not in TiDB —
# Vercel caps request bodies at ~4.5MB and TiDB caps row size, so files over
# the blob threshold are stored here and only their extracted text is in the
# DB. Filenames are opaque uuids; kb_items.file_path holds the basename.
_KB_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'kb')
_KB_NAME_RE = None  # compiled lazily


def _kb_safe_name(name):
    global _KB_NAME_RE
    import re as _re
    if _KB_NAME_RE is None:
        _KB_NAME_RE = _re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')
    return bool(name) and '..' not in name and bool(_KB_NAME_RE.match(name))


@app.route('/kb_store', methods=['POST'])
def kb_store():
    """Store a large knowledgebase original on this machine's disk. Body:
    {data_b64, file_name?}; reply {path, size} where path is the opaque
    basename to persist in kb_items.file_path."""
    import base64 as _base64
    import uuid as _uuid
    body = request.get_json(silent=True) or {}
    data_b64 = body.get('data_b64')
    if not isinstance(data_b64, str) or not data_b64:
        return jsonify({'error': 'data_b64 required'}), 400
    if len(data_b64) > 33 * 1024 * 1024:  # ~24MB decoded, base64-inflated
        return jsonify({'error': 'file too large'}), 413
    try:
        data = _base64.b64decode(data_b64)
    except Exception:
        return jsonify({'error': 'data_b64 is not valid base64'}), 400
    if not data:
        return jsonify({'error': 'file is empty'}), 400
    ext = os.path.splitext(str(body.get('file_name') or ''))[1][:16]
    if not _kb_safe_name(f'x{ext}' if ext else 'x'):
        ext = ''
    name = f'{_uuid.uuid4().hex}{ext}'
    os.makedirs(_KB_UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(_KB_UPLOAD_DIR, name), 'wb') as f:
        f.write(data)
    return jsonify({'path': name, 'size': len(data)}), 200


@app.route('/kb_file/<name>', methods=['GET'])
def kb_file(name):
    """Serve a disk-stored knowledgebase original by its opaque basename.
    The Next file route proxies this and applies auth + safe headers."""
    if not _kb_safe_name(name):
        return jsonify({'error': 'bad name'}), 400
    path = os.path.join(_KB_UPLOAD_DIR, name)
    if not os.path.isfile(path):
        return jsonify({'error': 'not found'}), 404
    with open(path, 'rb') as f:
        data = f.read()
    return app.response_class(data, mimetype='application/octet-stream')


@app.route('/kb_file/<name>', methods=['DELETE'])
def kb_file_delete(name):
    """Remove a disk-stored original (called when its kb item is deleted)."""
    if not _kb_safe_name(name):
        return jsonify({'error': 'bad name'}), 400
    path = os.path.join(_KB_UPLOAD_DIR, name)
    if os.path.isfile(path):
        os.unlink(path)
    return jsonify({'ok': True}), 200


# Enforced shape of a /web_search reply (mirrors WEB_SEARCH_SCHEMA in
# src/lib/agent/web-search.ts).
_WEB_SEARCH_SCHEMA = {
    'type': 'object',
    'properties': {
        'results': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'title': {'type': 'string'},
                    'url': {'type': 'string'},
                    'snippet': {'type': 'string'},
                },
                'required': ['title', 'url', 'snippet'],
            },
        },
        'note': {'type': ['string', 'null']},
    },
    'required': ['results', 'note'],
}


@app.route('/web_search', methods=['POST'])
@_claude_guarded
def web_search():
    """Web search via this machine's logged-in Claude Code CLI and its
    WebSearch tool — the deployed site's bridge for the agent's web_search
    tool (provider chain step 2 in src/lib/agent/web-search.ts). Body:
    {query, limit?}; reply {results: [{title, url, snippet}], note}."""
    body = request.get_json(silent=True) or {}
    query = str(body.get('query') or '').strip()[:400]
    if not query:
        return jsonify({'error': 'query required'}), 400
    try:
        limit = max(1, min(8, int(body.get('limit') or 5)))
    except (TypeError, ValueError):
        limit = 5
    claude = _claude_bin()
    if not claude:
        return jsonify({'error': 'claude CLI not found on the data-api host'}), 503
    prompt = (
        f'Search the web for: {query}\n'
        f'Use the WebSearch tool (one or two queries as needed). Return the {limit} '
        'most relevant, current results. Real source URLs only — never '
        'search-engine or redirect links. Each snippet is 1-2 sentences of what '
        'that page actually says that is relevant to the query. Set `note` to a '
        'one-sentence overall takeaway across results, or null.'
    )
    args = [claude, '-p', '--output-format', 'json',
            '--model', os.getenv('GLO_CLI_MODEL', 'sonnet'),
            '--strict-mcp-config', '--allowedTools', 'WebSearch',
            '--permission-prompts', 'none',
            '--max-budget-usd', str(CLAUDE_MAX_BUDGET_USD),
            '--json-schema', json.dumps(_WEB_SEARCH_SCHEMA)]
    try:
        # Neutral cwd so the run never loads this repo's agent context.
        proc = subprocess.run(args, input=prompt, capture_output=True, text=True,
                              timeout=110, cwd=tempfile.gettempdir())
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'claude CLI timed out'}), 504
    if proc.returncode != 0:
        return jsonify({'error': f'claude exited {proc.returncode}: {proc.stderr.strip()[:300]}'}), 502
    try:
        envelope = json.loads(proc.stdout)
    except ValueError:
        return jsonify({'error': 'claude returned non-JSON output'}), 502
    result = envelope.get('result') if isinstance(envelope, dict) else None
    if not isinstance(result, str) or (isinstance(envelope, dict) and envelope.get('is_error')):
        return jsonify({'error': 'claude returned an error envelope'}), 502
    import re as _re
    try:
        return jsonify(json.loads(_re.sub(r'^```(?:json)?\s*|\s*```$', '', result.strip()))), 200
    except ValueError:
        return jsonify({'error': 'claude returned non-JSON results despite the schema'}), 502


@app.route('/extract_doc', methods=['POST'])
@_claude_guarded
def extract_doc():
    """Extract text/metadata from an uploaded document or image using this
    machine's logged-in Claude Code CLI (subscription auth) — the deployed
    site's bridge for the knowledgebase upload flow (provider chain step 2 in
    src/lib/knowledge/extract.ts). Body: {mime, data_b64, file_name?}; reply
    matches the Extraction shape (snake_case suggested_artist). Unlike
    /agent_turn the session keeps the Read tool — that's how the model sees
    the file — so no `--tools ''` blackout here."""
    import base64 as _base64
    body = request.get_json(silent=True) or {}
    data_b64 = body.get('data_b64')
    mime = str(body.get('mime') or 'application/octet-stream')
    file_name = str(body.get('file_name') or '')
    if not isinstance(data_b64, str) or not data_b64:
        return jsonify({'error': 'data_b64 required'}), 400
    if len(data_b64) > 12 * 1024 * 1024:  # ~8MB decoded, base64-inflated
        return jsonify({'error': 'file too large'}), 413
    try:
        data = _base64.b64decode(data_b64)
    except Exception:
        return jsonify({'error': 'data_b64 is not valid base64'}), 400
    if not data:
        return jsonify({'error': 'file is empty'}), 400
    if len(data) > 8 * 1024 * 1024:
        return jsonify({'error': 'file too large'}), 413
    claude = _claude_bin()
    if not claude:
        return jsonify({'error': 'claude CLI not found on the data-api host'}), 503

    # Correct extension so the CLI's Read tool recognizes the format.
    import mimetypes as _mimetypes
    suffix = (os.path.splitext(file_name)[1]
              or {'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg',
                  'image/webp': '.webp', 'image/gif': '.gif', 'text/plain': '.txt'}.get(mime)
              or _mimetypes.guess_extension(mime) or '.bin')
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.close()
        # realpath so the prompt path matches the path-scoped Read rule below
        # (macOS /var is a symlink to /private/var).
        tmp_path = os.path.realpath(tmp.name)
        prompt = (
            f'Read the file at {tmp_path} with the Read tool. Transcribe ALL visible '
            'text verbatim and completely — every slide, page, and region, including '
            'numbers, tables, and contact info — as `text`. Then produce `title`, a '
            '2-3 sentence `summary`, 3-8 lowercase `tags`, and `suggested_artist`: '
            'the primary artist/person name if evident from the content, else null.'
        )
        # Read stays enabled (that's how the model sees the file) but is scoped
        # to the temp file only (`Read(//abs/path)` permission-rule syntax) —
        # uploaded documents are untrusted, and an unscoped Read would let
        # injected instructions pull host files (.env etc.) into the result.
        args = [claude, '-p', '--output-format', 'json',
                '--model', os.getenv('GLO_CLI_MODEL', 'sonnet'),
                '--strict-mcp-config', '--allowedTools', f'Read(/{tmp_path})',
                '--permission-prompts', 'none',
                '--max-budget-usd', str(CLAUDE_MAX_BUDGET_USD),
                '--json-schema', json.dumps(_EXTRACT_SCHEMA)]
        try:
            # Neutral cwd so the run never loads this repo's agent context.
            proc = subprocess.run(args, input=prompt, capture_output=True, text=True,
                                  timeout=150, cwd=tempfile.gettempdir())
        except subprocess.TimeoutExpired:
            return jsonify({'error': 'claude CLI timed out'}), 504
    finally:
        os.unlink(tmp.name)
    if proc.returncode != 0:
        return jsonify({'error': f'claude exited {proc.returncode}: {proc.stderr.strip()[:300]}'}), 502
    try:
        envelope = json.loads(proc.stdout)
    except ValueError:
        return jsonify({'error': 'claude returned non-JSON output'}), 502
    result = envelope.get('result') if isinstance(envelope, dict) else None
    if not isinstance(result, str) or (isinstance(envelope, dict) and envelope.get('is_error')):
        return jsonify({'error': 'claude returned an error envelope'}), 502
    # `result` is schema-conformant JSON per --json-schema; strip optional
    # ```json fences the model sometimes wraps around it (see cli-provider.ts).
    import re as _re
    try:
        return jsonify(json.loads(_re.sub(r'^```(?:json)?\s*|\s*```$', '', result.strip()))), 200
    except ValueError:
        return jsonify({'error': 'claude returned a non-JSON extraction despite the schema'}), 502


_whisper = None
_whisper_lock = None


def _whisper_transcribe(audio_bytes: bytes, mime: str):
    """Local open-source STT (faster-whisper base.en, int8) — offline, no
    quota, <1s per utterance once warm. Returns text or None on failure.
    PyAV decodes whatever the browser recorded (webm/opus, mp4/AAC, wav)."""
    global _whisper, _whisper_lock
    import threading as _threading
    if _whisper_lock is None:
        _whisper_lock = _threading.Lock()
    from faster_whisper import WhisperModel
    suffix = {'audio/mp4': '.m4a', 'audio/mpeg': '.mp3', 'audio/wav': '.wav'}.get(mime, '.webm')
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(audio_bytes)
        tmp.close()
        with _whisper_lock:  # one shared model; requests are short
            if _whisper is None:
                _whisper = WhisperModel(os.getenv('GLO_STT_MODEL', 'base.en'),
                                        compute_type='int8')
            segments, _info = _whisper.transcribe(tmp.name)
            return ' '.join(s.text.strip() for s in segments).strip()
    finally:
        os.unlink(tmp.name)


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """Speech-to-text for GLO's mic (bridged from the Vercel
    /api/agent/transcribe route). Primary: local faster-whisper — offline, no
    quota. Fallback: Gemini (free-tier daily caps 429 under real use). Body:
    {mime, audio_b64}; reply {text}."""
    import ai_verify
    body = request.get_json(silent=True) or {}
    audio_b64 = body.get('audio_b64')
    mime = str(body.get('mime') or 'audio/webm')
    if not isinstance(audio_b64, str) or not audio_b64:
        return jsonify({'error': 'audio_b64 required'}), 400
    if len(audio_b64) > 12 * 1024 * 1024:  # ~8MB of audio, base64-inflated
        return jsonify({'error': 'audio too large'}), 413

    try:
        import base64 as _base64
        text = _whisper_transcribe(_base64.b64decode(audio_b64), mime)
        if text is not None:
            return jsonify({'text': text}), 200
    except Exception as e:
        print(f"faster-whisper failed, falling back to Gemini: {e}", file=sys.stderr)

    if not ai_verify.GEMINI_API_KEY:
        return jsonify({'error': 'transcription unavailable (whisper failed, no Gemini key)'}), 502
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
        # Key in a header, not the URL — request errors log the URL verbatim.
        resp = _requests.post(ai_verify.GEMINI_URL,
                              headers={'x-goog-api-key': ai_verify.GEMINI_API_KEY},
                              json=payload, timeout=45)
        resp.raise_for_status()
        parts = resp.json()['candidates'][0]['content'].get('parts') or []
        text = ''.join(p.get('text', '') for p in parts).strip()
        return jsonify({'text': text}), 200
    except Exception as e:
        print(f"Transcription error: {e}", file=sys.stderr)
        return jsonify({'error': 'transcription failed'}), 502


_kokoro = None
_kokoro_lock = None


def _kokoro_tts(text: str):
    """Local open-source TTS (Kokoro-82M via ONNX, Apache-2.0): phenomenal
    naturalness, fully offline, no quota. Returns WAV bytes or None when the
    model files aren't downloaded (see data-api/models/). Lazy-loads once
    (~0.6s) and keeps the session in memory; renders ~3x real-time on CPU."""
    global _kokoro, _kokoro_lock
    import threading as _threading
    if _kokoro_lock is None:
        _kokoro_lock = _threading.Lock()
    model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
    model = os.path.join(model_dir, 'kokoro-v1.0.onnx')
    voices = os.path.join(model_dir, 'voices-v1.0.bin')
    if not (os.path.exists(model) and os.path.exists(voices)):
        return None
    import io
    import wave as _wave
    import numpy as _np
    from kokoro_onnx import Kokoro
    voice = os.getenv('GLO_TTS_KOKORO_VOICE', 'bf_emma')
    speed = float(os.getenv('GLO_TTS_SPEED', '1.05'))
    with _kokoro_lock:  # serialize: one shared ONNX session
        if _kokoro is None:
            _kokoro = Kokoro(model, voices)
        samples, sr = _kokoro.create(text, voice=voice, speed=speed)
    buf = io.BytesIO()
    with _wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((_np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
    return buf.getvalue()


def _edge_tts(text: str):
    """Microsoft Edge neural voices (free, unofficial endpoint) — the most
    human-sounding free option; en-GB-SoniaNeural by default. mp3 bytes."""
    import asyncio
    import edge_tts
    voice = os.getenv('GLO_TTS_VOICE', 'en-GB-SoniaNeural')
    out = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
    out.close()
    try:
        asyncio.run(edge_tts.Communicate(text, voice).save(out.name))
        with open(out.name, 'rb') as f:
            return f.read() or None
    finally:
        os.unlink(out.name)


@app.route('/speak', methods=['POST'])
def speak():
    """Text-to-speech for GLO's spoken replies. Engine order is configurable
    via GLO_TTS_ENGINE ('edge' default — most human; 'kokoro' — fully offline
    open-source); whichever isn't primary is the fallback, then Gemini TTS
    last (tiny free-tier daily quota — observed 429ing under normal use).
    Body {text}; reply audio/mpeg (edge) or audio/wav (kokoro/Gemini)."""
    from flask import Response as _Response
    body = request.get_json(silent=True) or {}
    text = str(body.get('text') or '').strip()[:2000]
    if not text:
        return jsonify({'error': 'text required'}), 400

    engines = {
        'edge': (_edge_tts, 'audio/mpeg'),
        'kokoro': (_kokoro_tts, 'audio/wav'),
    }
    primary = os.getenv('GLO_TTS_ENGINE', 'edge')
    order = [primary] + [e for e in engines if e != primary]
    for name in order:
        render, mime = engines.get(name) or (None, None)
        if not render:
            continue
        try:
            audio = render(text)
            if audio:
                return _Response(audio, mimetype=mime)
            print(f"{name} tts produced no audio, trying next engine", file=sys.stderr)
        except Exception as e:
            print(f"{name} tts failed, trying next engine: {e}", file=sys.stderr)

    return _gemini_tts(text)


def _gemini_tts(text: str):
    """Fallback TTS via Gemini (tiny free-tier daily quota). audio/wav."""
    import ai_verify
    import re as _re
    import struct as _struct
    import base64 as _base64
    from flask import Response as _Response
    if not ai_verify.GEMINI_API_KEY:
        return jsonify({'error': 'speech synthesis unavailable (edge-tts failed, no Gemini key)'}), 502
    model = os.getenv('GLO_TTS_MODEL', 'gemini-2.5-flash-preview-tts')
    voice = os.getenv('GLO_TTS_GEMINI_VOICE', 'Despina')
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
        # Key goes in a header, not the URL — errors log the URL verbatim.
        resp = _requests.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            headers={'x-goog-api-key': ai_verify.GEMINI_API_KEY}, json=payload, timeout=45)
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
