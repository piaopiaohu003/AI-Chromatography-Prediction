"""Thin OpenAI-compatible client used for AI method design.

The client works with any provider exposing /chat/completions (OpenAI, DeepSeek,
Moonshot, Qwen/DashScope compatible mode, local vLLM/Ollama gateways, ...).
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Dict, List, Optional

import requests

DEFAULT_BASE_URL = (
    os.getenv("CHROM_AI_BASE_URL")
    or os.getenv("OPENAI_BASE_URL")
    or "https://api.deepseek.com/v1"
)
DEFAULT_MODEL = (
    os.getenv("CHROM_AI_MODEL")
    or os.getenv("OPENAI_MODEL")
    or "deepseek-chat"
)


class AIError(RuntimeError):
    pass


def resolve_config(override: Optional[Dict] = None) -> Dict:
    override = override or {}
    base_url = (override.get("base_url") or "").strip() or DEFAULT_BASE_URL
    model = (override.get("model") or "").strip() or DEFAULT_MODEL
    api_key = (override.get("api_key") or "").strip() or os.getenv("CHROM_AI_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
    return {
        "base_url": base_url.rstrip("/"),
        "model": model,
        "api_key": api_key,
        "configured": bool(api_key),
    }


def public_status(override: Optional[Dict] = None) -> Dict:
    config = resolve_config(override)
    return {
        "configured": config["configured"],
        "model": config["model"],
        "base_url": config["base_url"],
        "source": "api" if config["configured"] else "rule",
    }


def _endpoint(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if re.search(r"/v\d+[a-z0-9_-]*$", base, re.IGNORECASE):
        return base + "/chat/completions"
    return base + "/v1/chat/completions"


def _post(config: Dict, payload: Dict) -> Dict:
    url = _endpoint(config["base_url"])
    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "Content-Type": "application/json",
    }
    data = dict(payload)
    data["model"] = config["model"]
    try:
        response = requests.post(url, headers=headers, json=data, timeout=90)
    except requests.RequestException as exc:  # network / proxy problems
        raise AIError(f"网络请求失败：{exc}") from exc
    return {"url": url, "headers": headers, "payload": data, "response": response}


def chat(
    config: Dict,
    messages: List[Dict],
    temperature: float = 0.2,
    json_mode: bool = True,
    max_tokens: int = 2000,
) -> str:
    if not config.get("configured"):
        raise AIError("未配置 API Key")

    payload: Dict = {
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    result = _post(config, payload)
    response = result["response"]

    # Some providers reject response_format; retry once without it.
    if response.status_code in (400, 404, 422) and json_mode:
        payload.pop("response_format", None)
        result = _post(config, payload)
        response = result["response"]

    if response.status_code >= 400:
        detail = response.text[:400]
        raise AIError(f"大模型接口返回 {response.status_code}：{detail}")

    try:
        data = response.json()
    except ValueError as exc:
        raise AIError("大模型返回内容不是合法 JSON") from exc

    try:
        message = data["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIError("大模型响应结构异常") from exc

    content = message.get("content") or ""
    if not content and message.get("reasoning_content"):
        content = message["reasoning_content"]
    if not content.strip():
        raise AIError("大模型返回空内容")
    return content


def extract_json(text: str) -> Dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", cleaned):
        try:
            parsed, _ = decoder.raw_decode(cleaned[match.start():])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    raise AIError("无法从大模型输出中解析 JSON")


def test_connection(config: Dict) -> Dict:
    started = time.time()
    content = chat(
        config,
        [
            {"role": "system", "content": "You are a connectivity probe. Reply with OK only."},
            {"role": "user", "content": "ping"},
        ],
        temperature=0.0,
        json_mode=False,
        max_tokens=16,
    )
    return {
        "ok": True,
        "message": content.strip()[:120],
        "latency_ms": int((time.time() - started) * 1000),
    }
