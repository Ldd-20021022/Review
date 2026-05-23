"""DeepSeek V4 Pro API client — direct HTTP via httpx (OpenAI-compatible API)."""
import json
import logging
from typing import Dict, List, Optional
import httpx
from ..config import settings

logger = logging.getLogger(__name__)

_client = None


def get_client() -> Optional[httpx.Client]:
    """Return configured httpx client, or None if API key is not set."""
    global _client
    if _client is not None:
        return _client
    if not settings.DEEPSEEK_API_KEY:
        logger.warning("DEEPSEEK_API_KEY not configured, AI features disabled")
        return None
    _client = httpx.Client(
        base_url=settings.DEEPSEEK_BASE_URL,
        headers={
            "Authorization": "Bearer " + settings.DEEPSEEK_API_KEY,
            "Content-Type": "application/json",
        },
        timeout=httpx.Timeout(60.0),
    )
    return _client


def chat(
    messages: List[Dict],
    temperature: float = 0.3,
    max_tokens: int = 16384,
    stream: bool = False,
) -> Optional[str]:
    """Send a chat completion request to DeepSeek. Returns response text or None on failure."""
    client = get_client()
    if client is None:
        return None
    try:
        resp = client.post(
            "/chat/completions",
            json={
                "model": settings.DEEPSEEK_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": stream,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error("DeepSeek API error: %s", e)
        return None


def chat_with_system(
    prompt: str,
    system: str = "You are a helpful assistant.",
    temperature: float = 0.3,
    max_tokens: int = 16384,
) -> Optional[str]:
    """Convenience wrapper: single-turn chat with system prompt."""
    return chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temperature, max_tokens=max_tokens)


def chat_structured(
    prompt: str,
    system: str,
    temperature: float = 0.2,
    max_tokens: int = 16384,
) -> Optional[dict]:
    """Send a prompt and expect a JSON response. Returns parsed dict or None."""
    full_system = system + "\n\nYou MUST respond with valid JSON only, no markdown fences, no extra text."
    text = chat_with_system(prompt, full_system, temperature=temperature, max_tokens=max_tokens)
    if text is None:
        return None
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Failed to parse structured response as JSON: %s", text[:200])
        return None
