"""Password-reset mailer built on the stdlib smtplib.

Configuration via environment variables:
  CHROM_SMTP_URL  smtp://[user:pass@]host[:port]  or  smtps://... (implicit TLS)
  CHROM_MAIL_FROM envelope/header sender (default: URL user or chromai@<host>)

If CHROM_SMTP_URL is unset, send_mail() returns {"sent": False} and the
caller exposes the reset token through a debug channel instead.
"""

from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from typing import Any


def _config_from_env() -> dict[str, Any] | None:
    raw = (os.getenv("CHROM_SMTP_URL") or "").strip()
    if not raw:
        return None
    if not raw.startswith(("smtp://", "smtps://")):
        raw = f"smtp://{raw}"
    from urllib.parse import urlparse, unquote

    parsed = urlparse(raw)
    use_tls = parsed.scheme == "smtps"
    user = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (465 if use_tls else 25)
    sender = os.getenv("CHROM_MAIL_FROM") or (user if "@" in user else f"chromai@{host}")
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "tls": use_tls,
        "from": sender,
    }


def send_mail(*, to: str, subject: str, text: str) -> dict[str, Any]:
    cfg = _config_from_env()
    if cfg is None:
        return {"sent": False, "reason": "smtp-not-configured"}

    message = EmailMessage()
    message["From"] = cfg["from"]
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)

    cls = smtplib.SMTP_SSL if cfg["tls"] else smtplib.SMTP
    with cls(cfg["host"], cfg["port"], timeout=8) as smtp:
        smtp.ehlo("chromai.local")
        if cfg["user"]:
            smtp.login(cfg["user"], cfg["password"])
        smtp.send_message(message)
    return {"sent": True}


__all__ = ["send_mail"]
