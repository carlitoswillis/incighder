"""Local-LLM verification via Ollama (free, private).

Judges whether a discovered social profile actually belongs to the artist, catching
wrong auto-linked accounts. Reaches the host's Ollama at OLLAMA_URL (default
host.docker.internal:11434 so the Dockerized data-api can call it). Best-effort: if
Ollama is unreachable the caller treats the result as unverified and keeps the guess.
"""
from __future__ import annotations

import json
import os

import requests

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:14b")

_SYSTEM = (
    "You verify whether a social media profile belongs to a given music artist. "
    "Reply ONLY with compact JSON: "
    '{"match": true or false, "confidence": number 0..1, "reason": short string}.'
)


def verify_account(artist: str, platform: str, profile_text: str) -> dict | None:
    """Return {match, confidence, reason} or None if the model is unavailable."""
    prompt = (
        f"Artist: {artist}\nPlatform: {platform}\n"
        f"Candidate profile info: {profile_text}\n\n"
        "Is this the artist's own official/personal account?"
    )
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "format": "json",
                "stream": False,
                "options": {"temperature": 0},
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = json.loads(resp.json()["message"]["content"])
        return {
            "match": bool(data.get("match")),
            "confidence": max(0.0, min(1.0, float(data.get("confidence", 0)))),
            "reason": str(data.get("reason", ""))[:200],
        }
    except Exception:
        return None
