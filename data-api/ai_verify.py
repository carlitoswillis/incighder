"""LLM verification via Google Gemini.

Judges whether a discovered social profile actually belongs to the artist, catching
wrong auto-linked accounts. Calls the Gemini generateContent API using GOOGLE_AI_API_KEY.
Best-effort: if the key is missing or the API is unreachable the caller treats the
result as unverified and keeps the guess.
"""
from __future__ import annotations

import json
import os
import time

import requests

GEMINI_API_KEY = os.getenv("GOOGLE_AI_API_KEY") or os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

_SYSTEM = (
    "You verify whether a social media profile belongs to a given music artist. "
    "Reply ONLY with compact JSON: "
    '{"match": true or false, "confidence": number 0..1, "reason": short string}.'
)


def verify_account(artist: str, platform: str, profile_text: str) -> dict | None:
    """Return {match, confidence, reason} or None if the model is unavailable."""
    if not GEMINI_API_KEY:
        return None

    prompt = (
        f"Artist: {artist}\nPlatform: {platform}\n"
        f"Candidate profile info: {profile_text}\n\n"
        "Is this the artist's own official/personal account?"
    )
    payload = {
        "system_instruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    try:
        resp = None
        # gemini-2.5-flash intermittently returns 503 UNAVAILABLE under load; retry a few times.
        for attempt in range(3):
            resp = requests.post(
                GEMINI_URL, params={"key": GEMINI_API_KEY}, json=payload, timeout=60
            )
            if resp.status_code != 503:
                break
            time.sleep(1.5 * (attempt + 1))
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
        return {
            "match": bool(data.get("match")),
            "confidence": max(0.0, min(1.0, float(data.get("confidence", 0)))),
            "reason": str(data.get("reason", ""))[:200],
        }
    except Exception:
        return None
