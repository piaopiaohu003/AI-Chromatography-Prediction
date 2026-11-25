"""Local account system with scrypt password hashing and file-backed sessions."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

COOKIE_NAME = "chromai_session"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
DB_PATH = Path(
    os.getenv("CHROM_USER_DB")
    or (Path(tempfile.gettempdir()) / "chromai-users.json")
)
USERNAME_RE = re.compile(r"^[\w\u4e00-\u9fa5.-]{3,24}$", re.UNICODE)
DEFAULT_PREFERENCES = {
    "default_phase": "reversed",
    "default_organic": "ACN",
    "default_detector": "UV",
    "default_temperature_c": 30,
}
PHASE_ORGANICS = {
    "reversed": ["ACN", "MeOH", "THF", "EtOH"],
    "normal": ["IPA", "EtOAc", "THF", "EtOH"],
}
MAX_FAVORITES = 30
MAX_LITERATURE_TOPICS = 12


class AuthError(Exception):
    """Raised for validation or authentication failures."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _empty_store() -> dict:
    return {"version": 1, "users": [], "sessions": {}}


def _bootstrap_demo() -> None:
    """Pre-seed the demo account on cold start.

    Deployments run on ephemeral filesystems (runtime /tmp) — every
    redeployment wipes the user database. We want the documented demo /
    ChromAI2026 credentials to still work, so we create the demo user
    lazily whenever it is missing from the store.
    """

    DEMO_USER = os.getenv("CHROM_DEMO_USER") or "demo"
    DEMO_PASS = os.getenv("CHROM_DEMO_PASS") or "ChromAI2026"
    try:
        _normalize_username(DEMO_USER)
        _normalize_password(DEMO_PASS)
    except AuthError:
        return
    store = _load_store()
    if any(
        u.get("username", "").lower() == DEMO_USER.lower()
        for u in store.get("users", [])
        if isinstance(u, dict)
    ):
        return
    salt = secrets.token_hex(16)
    demo_id = str(uuid.uuid4())
    favorites = [
        {
            "id": str(uuid.uuid4()),
            "name": "梯度筛查 · C18 150mm",
            "phase": "reversed",
            "conditions": {
                "phase": "reversed", "mode": "gradient", "organic": "ACN", "aqueous": "water",
                "gradient": [
                    {"time_min": 0, "percent_b": 5, "percent_c": 0, "percent_d": 0},
                    {"time_min": 20, "percent_b": 95, "percent_c": 0, "percent_d": 0},
                    {"time_min": 25, "percent_b": 95, "percent_c": 0, "percent_d": 0},
                ],
                "flow_ml_min": 1, "temperature_c": 30, "ph": 2.5, "wavelength_nm": 254,
                "column": {"length_mm": 150, "inner_diameter_mm": 4.6, "particle_um": 5, "porosity": 0.65, "chemistry": "c18"},
                "dwell_volume_ml": 1, "injection_volume_ul": 10, "total_time_min": 30, "noise_mau": 0.15,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "name": "等度 50% · 快速分离",
            "phase": "reversed",
            "conditions": {
                "phase": "reversed", "mode": "isocratic", "organic": "ACN", "aqueous": "water",
                "percent_b": 50,
                "flow_ml_min": 1, "temperature_c": 30, "ph": 2.5, "wavelength_nm": 254,
                "column": {"length_mm": 100, "inner_diameter_mm": 4.6, "particle_um": 3.5, "porosity": 0.65, "chemistry": "c18"},
                "dwell_volume_ml": 0.8, "injection_volume_ul": 10, "total_time_min": 10, "noise_mau": 0.15,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    store["users"].append({
        "id": demo_id,
        "username": DEMO_USER,
        "salt": salt,
        "password_hash": _hash_password(DEMO_PASS, salt),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "preferences": {**DEFAULT_PREFERENCES},
        "favorites": favorites,
        "literature_watch": [],
    })
    _save_store(store)


_bootstrap_demo()


def _load_store() -> dict:
    try:
        data = json.loads(DB_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _empty_store()
    if not isinstance(data, dict) or not isinstance(data.get("users"), list):
        return _empty_store()
    if not isinstance(data.get("sessions"), dict):
        data["sessions"] = {}
    return data


def _save_store(store: dict) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = DB_PATH.with_name(f"{DB_PATH.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DB_PATH)


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "created_at": user["created_at"],
    }


def _normalize_username(value: object) -> str:
    username = str(value).strip() if value is not None else ""
    if not USERNAME_RE.match(username):
        raise AuthError("用户名需为 3–24 位字母、数字、中文、下划线、点或短横线")
    return username


def _normalize_password(value: object) -> str:
    password = str(value) if value is not None else ""
    if not 8 <= len(password) <= 64:
        raise AuthError("密码长度需为 8–64 位")
    return password


def _hash_password(password: str, salt: str) -> str:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=bytes.fromhex(salt),
        n=2 ** 14,
        r=8,
        p=1,
        dklen=64,
    ).hex()


def _prune_sessions(store: dict) -> None:
    now = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    for token in list(store["sessions"]):
        session = store["sessions"].get(token)
        if not session or int(session.get("expires_at", 0)) <= now:
            store["sessions"].pop(token, None)


def _issue_session(store: dict, user_id: str) -> str:
    _prune_sessions(store)
    token = secrets.token_hex(32)
    store["sessions"][token] = {
        "user_id": user_id,
        "expires_at": int(datetime.now(tz=timezone.utc).timestamp() * 1000)
        + SESSION_TTL_SECONDS * 1000,
    }
    return token


def register(username_value: object, password_value: object) -> tuple[dict, str]:
    username = _normalize_username(username_value)
    password = _normalize_password(password_value)
    store = _load_store()
    _prune_sessions(store)
    if any(user["username"].lower() == username.lower() for user in store["users"]):
        raise AuthError("该用户名已被注册", 409)
    salt = secrets.token_hex(16)
    user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "salt": salt,
        "password_hash": _hash_password(password, salt),
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
        "preferences": dict(DEFAULT_PREFERENCES),
        "favorites": [],
    }
    store["users"].append(user)
    token = _issue_session(store, user["id"])
    _save_store(store)
    return _public_user(user), token


def login(username_value: object, password_value: object) -> tuple[dict, str]:
    username = str(username_value).strip() if username_value is not None else ""
    password = str(password_value) if password_value is not None else ""
    if not username or not password:
        raise AuthError("请输入用户名和密码")
    store = _load_store()
    user = next(
        (item for item in store["users"] if item["username"].lower() == username.lower()),
        None,
    )
    salt = user["salt"] if user else "00" * 16
    expected = user["password_hash"] if user else "00" * 64
    actual = _hash_password(password, salt)
    if not user or not secrets.compare_digest(expected, actual):
        raise AuthError("用户名或密码错误", 401)
    _prune_sessions(store)
    token = _issue_session(store, user["id"])
    _save_store(store)
    return _public_user(user), token


def current_user(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    store = _load_store()
    session = store["sessions"].get(token)
    if not session:
        return None
    now = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    if int(session.get("expires_at", 0)) <= now:
        store["sessions"].pop(token, None)
        _save_store(store)
        return None
    user = next((item for item in store["users"] if item["id"] == session["user_id"]), None)
    return _public_user(user) if user else None


def logout(token: Optional[str]) -> None:
    if not token:
        return
    store = _load_store()
    if store["sessions"].pop(token, None) is not None:
        _save_store(store)


def _ensure_account(user: dict) -> dict:
    if not isinstance(user.get("preferences"), dict):
        user["preferences"] = dict(DEFAULT_PREFERENCES)
    else:
        merged = dict(DEFAULT_PREFERENCES)
        merged.update(user["preferences"])
        user["preferences"] = merged
    if not isinstance(user.get("favorites"), list):
        user["favorites"] = []
    if not isinstance(user.get("literature_watch"), list):
        user["literature_watch"] = []
    return user


def _find_user(store: dict, user_id: str) -> dict:
    user = next((item for item in store["users"] if item["id"] == user_id), None)
    if not user:
        raise AuthError("用户不存在", 404)
    return _ensure_account(user)


def _normalize_preferences(patch: object) -> dict:
    if not isinstance(patch, dict):
        raise AuthError("偏好设置格式不正确")
    phase = patch.get("default_phase")
    if phase not in PHASE_ORGANICS:
        phase = DEFAULT_PREFERENCES["default_phase"]
    options = PHASE_ORGANICS[phase]
    organic = patch.get("default_organic")
    if organic not in options:
        organic = options[0]
    detector = patch.get("default_detector")
    if detector not in ("UV", "MS"):
        detector = DEFAULT_PREFERENCES["default_detector"]
    try:
        temperature = int(round(float(patch.get("default_temperature_c", 30))))
    except (TypeError, ValueError):
        temperature = DEFAULT_PREFERENCES["default_temperature_c"]
    temperature = max(15, min(60, temperature))
    return {
        "default_phase": phase,
        "default_organic": organic,
        "default_detector": detector,
        "default_temperature_c": temperature,
    }


def get_account(user_id: str) -> dict:
    store = _load_store()
    user = _find_user(store, user_id)
    return {
        "user": _public_user(user),
        "preferences": dict(user["preferences"]),
        "favorites": [dict(item) for item in user["favorites"]],
        "literature_topics": [_literature_topic_meta(item) for item in user["literature_watch"]],
    }


def update_preferences(user_id: str, patch: object) -> dict:
    preferences = _normalize_preferences(patch)
    store = _load_store()
    user = _find_user(store, user_id)
    user["preferences"] = preferences
    _save_store(store)
    return dict(preferences)


def change_password(
    user_id: str,
    current_token: Optional[str],
    current_password: object,
    new_password: object,
) -> None:
    store = _load_store()
    user = _find_user(store, user_id)
    given = str(current_password) if current_password is not None else ""
    if not secrets.compare_digest(user["password_hash"], _hash_password(given, user["salt"])):
        raise AuthError("当前密码不正确")
    password = _normalize_password(new_password)
    if password == given:
        raise AuthError("新密码不能与当前密码相同")
    salt = secrets.token_hex(16)
    user["salt"] = salt
    user["password_hash"] = _hash_password(password, salt)
    for token in list(store["sessions"]):
        session = store["sessions"].get(token) or {}
        if session.get("user_id") == user_id and token != current_token:
            store["sessions"].pop(token, None)
    _save_store(store)


def add_favorite(user_id: str, payload: object) -> dict:
    if not isinstance(payload, dict):
        raise AuthError("收藏内容格式不正确")
    name = str(payload.get("name") or "").strip()
    if not name or len(name) > 40:
        raise AuthError("收藏名称需为 1–40 个字符")
    conditions = payload.get("conditions")
    if not isinstance(conditions, dict):
        raise AuthError("缺少色谱条件")
    if len(json.dumps(conditions, ensure_ascii=False)) > 60000:
        raise AuthError("收藏的色谱条件过大")
    store = _load_store()
    user = _find_user(store, user_id)
    if len(user["favorites"]) >= MAX_FAVORITES:
        raise AuthError(f"最多保存 {MAX_FAVORITES} 个收藏")
    favorite = {
        "id": str(uuid.uuid4()),
        "name": name,
        "phase": "normal" if payload.get("phase") == "normal" else "reversed",
        "conditions": conditions,
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    user["favorites"].insert(0, favorite)
    _save_store(store)
    return {"favorite": dict(favorite)}


def delete_favorite(user_id: str, favorite_id: str) -> dict:
    store = _load_store()
    user = _find_user(store, user_id)
    for index, item in enumerate(user["favorites"]):
        if item.get("id") == favorite_id:
            user["favorites"].pop(index)
            _save_store(store)
            return {"ok": True, "id": favorite_id}
    raise AuthError("收藏不存在", 404)


def _literature_topic_meta(topic: dict) -> dict:
    return {
        "id": topic["id"],
        "name": topic["name"],
        "query": topic["query"],
        "created_at": topic.get("created_at"),
        "last_scan_at": topic.get("last_scan_at"),
        "new_count": len(topic.get("new_ids") or []),
        "items_count": len(topic.get("items") or []),
        "last_error": topic.get("last_error"),
    }


def _normalize_literature_topic(payload: object) -> tuple[str, str]:
    if not isinstance(payload, dict):
        raise AuthError("监控主题格式不正确")
    name = str(payload.get("name") or "").strip()
    query = str(payload.get("query") or "").strip()
    if not name or len(name) > 40:
        raise AuthError("主题名称需为 1–40 个字符")
    if len(query) < 2 or len(query) > 160:
        raise AuthError("检索式需为 2–160 个字符")
    return name, query


def list_literature_topics(user_id: str) -> dict:
    store = _load_store()
    user = _find_user(store, user_id)
    return {"topics": [_literature_topic_meta(item) for item in user["literature_watch"]]}


def add_literature_topic(user_id: str, payload: object) -> dict:
    name, query = _normalize_literature_topic(payload)
    store = _load_store()
    user = _find_user(store, user_id)
    if len(user["literature_watch"]) >= MAX_LITERATURE_TOPICS:
        raise AuthError(f"最多创建 {MAX_LITERATURE_TOPICS} 个文献监控主题")
    if any(item["query"].lower() == query.lower() for item in user["literature_watch"]):
        raise AuthError("已存在相同检索式的监控主题", 409)
    topic = {
        "id": f"lit_{uuid.uuid4().hex[:12]}",
        "name": name,
        "query": query,
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
        "last_scan_at": None,
        "seen_ids": [],
        "items": [],
        "new_ids": [],
        "last_error": None,
    }
    user["literature_watch"].insert(0, topic)
    _save_store(store)
    return {"topic": _literature_topic_meta(topic)}


def delete_literature_topic(user_id: str, topic_id: str) -> dict:
    store = _load_store()
    user = _find_user(store, user_id)
    for index, item in enumerate(user["literature_watch"]):
        if item.get("id") == topic_id:
            user["literature_watch"].pop(index)
            _save_store(store)
            return {"ok": True, "id": topic_id}
    raise AuthError("监控主题不存在", 404)


def get_literature_topic(user_id: str, topic_id: str) -> dict:
    store = _load_store()
    user = _find_user(store, user_id)
    topic = next((item for item in user["literature_watch"] if item["id"] == topic_id), None)
    if not topic:
        raise AuthError("监控主题不存在", 404)
    return {
        "topic": _literature_topic_meta(topic),
        "items": [dict(item) for item in (topic.get("items") or [])],
        "seen_ids": list(topic.get("seen_ids") or []),
    }


def save_literature_scan(
    user_id: str, topic_id: str, scan: Optional[dict], error_message: Optional[str] = None
) -> dict:
    store = _load_store()
    user = _find_user(store, user_id)
    topic = next((item for item in user["literature_watch"] if item["id"] == topic_id), None)
    if not topic:
        raise AuthError("监控主题不存在", 404)
    if scan:
        topic["last_scan_at"] = scan["scanned_at"]
        topic["seen_ids"] = scan["seen_ids"]
        topic["items"] = scan["items"]
        topic["new_ids"] = scan["new_ids"]
        topic["last_error"] = None
    else:
        topic["last_scan_at"] = datetime.now(tz=timezone.utc).isoformat()
        topic["last_error"] = str(error_message or "扫描失败")[:200]
        topic["new_ids"] = []
    _save_store(store)
    return {
        "topic": _literature_topic_meta(topic),
        "items": scan["items"] if scan else (topic.get("items") or []),
        "new_count": scan["new_count"] if scan else 0,
    }
