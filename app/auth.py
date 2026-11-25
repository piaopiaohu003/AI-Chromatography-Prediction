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


class AuthError(Exception):
    """Raised for validation or authentication failures."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _empty_store() -> dict:
    return {"version": 1, "users": [], "sessions": {}}


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
