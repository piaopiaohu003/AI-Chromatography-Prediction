"""ChromAI account store abstraction (Python side).

Two backends behind a single sync API:
  - FileBackend  : JSON file on local disk (existing behaviour, default)
  - RedisBackend : single JSON blob key in Redis (enabled when REDIS_URL or
                   REDIS_HOST is set and we can PING the server)

Backend is chosen deterministically at module import time:
  1. If REDIS_URL or REDIS_HOST is set and Redis PING succeeds → RedisBackend
  2. Otherwise → FileBackend

No third-party pip dependency is required: we first attempt ``import redis``
(if the environment happens to have it installed), otherwise we fall back to
a tiny inline RESP2 client built on top of :mod:`socket`.  If even the socket
connect fails (e.g. Redis is unreachable) we fall back to the file store.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import ssl
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger("chromai.store")

KEY_PREFIX = (os.getenv("CHROM_REDIS_KEY_PREFIX") or "chromai").rstrip(":")
DB_KEY = f"{KEY_PREFIX}:v1:db"


def _empty_store() -> dict[str, Any]:
    return {"version": 1, "users": [], "sessions": {}, "password_resets": {}}


# ---------------------------------------------------------------------------
# File backend
# ---------------------------------------------------------------------------

class _FileBackend:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def load(self) -> dict[str, Any]:
        try:
            raw = self.db_path.read_text(encoding="utf-8")
            data = json.loads(raw)
        except (OSError, ValueError):
            return _empty_store()
        if not isinstance(data, dict) or not isinstance(data.get("users"), list):
            return _empty_store()
        if not isinstance(data.get("sessions"), dict):
            data["sessions"] = {}
        if not isinstance(data.get("password_resets"), dict):
            data["password_resets"] = {}
        return data

    def save(self, store: dict[str, Any]) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.db_path.with_name(f"{self.db_path.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.db_path)


# ---------------------------------------------------------------------------
# Tiny inline RESP2 client
# ---------------------------------------------------------------------------

class _Resp2Error(Exception):
    pass


class _TinyRedis:
    def __init__(
        self,
        host: str,
        port: int = 6379,
        password: str | None = None,
        db: int = 0,
        tls: bool = False,
        connect_timeout: float = 1.5,
        command_timeout: float = 1.5,
    ) -> None:
        self.host = host
        self.port = port
        self.password = password
        self.db = db
        self.tls = tls
        self.connect_timeout = connect_timeout
        self.command_timeout = command_timeout
        self._sock: socket.socket | None = None

    @classmethod
    def parse_url(cls, url: str) -> dict[str, Any]:
        u = url.strip()
        if not u.startswith(("redis://", "rediss://")):
            u = f"redis://{u}"
        tls = u.startswith("rediss://")
        # Minimal URL parse — no urllib because of possible edge cases.
        rest = u[len("rediss://") if tls else len("redis://"):]
        password = None
        if "@" in rest:
            auth, rest = rest.rsplit("@", 1)
            password = auth
        host_port, _, path = rest.partition("/")
        host, _, port_s = host_port.partition(":")
        host = host or "127.0.0.1"
        port = int(port_s) if port_s else (6380 if tls else 6379)
        db = 0
        if path and path.isdigit():
            db = int(path)
        return {"host": host, "port": port, "password": password, "db": db, "tls": tls}

    def connect(self) -> None:
        if self._sock is not None:
            return
        s = socket.create_connection((self.host, self.port), timeout=self.connect_timeout)
        if self.tls:
            ctx = ssl.create_default_context()
            s = ctx.wrap_socket(s, server_hostname=self.host)
        s.settimeout(self.command_timeout)
        self._sock = s
        if self.password:
            self._raw(["AUTH", self.password])
        if self.db:
            self._raw(["SELECT", str(self.db)])

    def close(self) -> None:
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None

    def command(self, *args: str) -> Any:
        self.connect()
        return self._raw(list(args))

    # -- low level --

    def _raw(self, args: list[str]) -> Any:
        assert self._sock is not None
        parts = [f"*{len(args)}\r\n".encode()]
        for a in args:
            data = str(a).encode("utf-8")
            parts.append(f"${len(data)}\r\n".encode())
            parts.append(data)
            parts.append(b"\r\n")
        self._sock.sendall(b"".join(parts))
        return self._read_reply()

    def _recv_exact(self, n: int) -> bytes:
        assert self._sock is not None
        buf = b""
        while len(buf) < n:
            chunk = self._sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("redis socket closed")
            buf += chunk
        return buf

    def _read_line(self) -> bytes:
        assert self._sock is not None
        buf = b""
        while True:
            # Peek first
            try:
                idx = buf.index(b"\r\n")
                return buf[:idx]
            except ValueError:
                pass
            chunk = self._sock.recv(4096)
            if not chunk:
                raise ConnectionError("redis socket closed")
            buf += chunk

    def _read_reply(self) -> Any:
        line = self._read_line()
        prefix = line[:1]
        body = line[1:]
        if prefix == b"+":
            return body.decode("utf-8")
        if prefix == b"-":
            raise _Resp2Error(f"Redis ERR {body.decode('utf-8', errors='replace')}")
        if prefix == b":":
            return int(body)
        if prefix == b"$":
            length = int(body)
            if length == -1:
                return None
            raw = self._recv_exact(length + 2)
            return raw[:length].decode("utf-8")
        if prefix == b"*":
            count = int(body)
            if count == -1:
                return None
            return [self._read_reply() for _ in range(count)]
        raise _Resp2Error(f"unknown RESP prefix: {prefix!r}")


# ---------------------------------------------------------------------------
# Redis backend
# ---------------------------------------------------------------------------

class _RedisBackend:
    def __init__(self, client: Any, key: str) -> None:
        self.client = client
        self.key = key

    def load(self) -> dict[str, Any]:
        raw = self.client.command("GET", self.key)
        if not raw:
            return _empty_store()
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            return _empty_store()
        if not isinstance(data, dict) or not isinstance(data.get("users"), list):
            return _empty_store()
        if not isinstance(data.get("sessions"), dict):
            data["sessions"] = {}
        if not isinstance(data.get("password_resets"), dict):
            data["password_resets"] = {}
        return data

    def save(self, store: dict[str, Any]) -> None:
        self.client.command("SET", self.key, json.dumps(store, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------

def _build_backend() -> tuple[Any, str]:
    """Return (backend, label).  Always succeeds — worst case is a file store."""
    db_path = Path(
        os.getenv("CHROM_USER_DB")
        or os.path.join(tempfile.gettempdir(), "chromai-users.json")
    )

    opts: dict[str, Any] | None = None
    label: str | None = None

    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        opts = _TinyRedis.parse_url(redis_url)
        label = f"{opts['host']}:{opts['port']}"
    elif os.getenv("REDIS_HOST"):
        opts = {
            "host": os.getenv("REDIS_HOST"),
            "port": int(os.getenv("REDIS_PORT") or 6379),
            "password": os.getenv("REDIS_PASSWORD") or None,
            "db": int(os.getenv("REDIS_DB") or 0),
            "tls": os.getenv("REDIS_TLS") in ("1", "true"),
        }
        label = f"{opts['host']}:{opts['port']}"

    if opts is None:
        log.info("[chromai.store] File store active: %s", db_path)
        return _FileBackend(db_path), "file"

    # --- Try the official redis-py first (if installed) --------------------
    try:
        import redis as _redis  # type: ignore
    except ImportError:
        _redis = None  # type: ignore

    if _redis is not None:
        try:
            redis_url = os.getenv("REDIS_URL")
            if redis_url:
                r = _redis.from_url(redis_url)
            else:
                r = _redis.Redis(
                    host=opts["host"], port=opts["port"],
                    password=opts["password"], db=opts["db"],
                    ssl=opts["tls"],
                    socket_connect_timeout=1.5, socket_timeout=1.5,
                )
            r.ping()
            log.info("[chromai.store] Redis store active (redis-py) at %s (key=%s)", label, DB_KEY)
            return _RedisBackend(r, DB_KEY), f"redis({label})"
        except Exception as exc:  # noqa: BLE001
            log.warning("[chromai.store] redis-py failed (%s), trying inline RESP2", exc)

    # --- Fall back to inline RESP2 socket client --------------------------
    try:
        client = _TinyRedis(**opts)
        client.connect()
        client.command("PING")
        log.info("[chromai.store] Redis store active (inline RESP2) at %s (key=%s)", label, DB_KEY)
        return _RedisBackend(client, DB_KEY), f"redis-inline({label})"
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "[chromai.store] Redis unavailable (%s), falling back to file store: %s",
            exc, db_path,
        )
        try:
            client.close()  # type: ignore[name-defined]
        except Exception:  # noqa: BLE001
            pass

    log.info("[chromai.store] File store active: %s", db_path)
    return _FileBackend(db_path), "file"


_BACKEND, BACKEND_LABEL = _build_backend()


def load_store() -> dict[str, Any]:
    return _BACKEND.load()


def save_store(store: dict[str, Any]) -> None:
    _BACKEND.save(store)


__all__ = ["load_store", "save_store", "BACKEND_LABEL", "DB_KEY"]
