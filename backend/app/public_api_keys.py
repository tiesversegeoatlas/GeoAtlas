from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone
from hashlib import sha256
from secrets import token_urlsafe
from threading import Lock
from time import monotonic

from fastapi import Depends, Header, HTTPException, Response, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import PublicApiKey

public_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_request_windows: dict[str, deque[float]] = defaultdict(deque)
_request_windows_lock = Lock()


def hash_public_api_key(raw_key: str) -> str:
    return sha256(raw_key.encode("utf-8")).hexdigest()


def generate_plaintext_public_api_key() -> str:
    return f"geoatlas_live_{token_urlsafe(32)}"


def create_public_api_key(
    db: Session,
    name: str,
    *,
    requests_per_minute: int,
    monthly_request_limit: int,
) -> tuple[PublicApiKey, str]:
    raw_key = generate_plaintext_public_api_key()
    key = PublicApiKey(
        name=name,
        key_prefix=raw_key[:20],
        key_hash=hash_public_api_key(raw_key),
        requests_per_minute=max(1, requests_per_minute),
        monthly_request_limit=max(1, monthly_request_limit),
        usage_month=datetime.now(timezone.utc).strftime("%Y-%m"),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return key, raw_key


def require_public_api_key(
    response: Response,
    x_api_key: str | None = Security(public_api_key_header),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PublicApiKey | None:
    return validate_public_api_key(db, response, x_api_key, authorization)


def validate_public_api_key(
    db: Session,
    response: Response,
    x_api_key: str | None,
    authorization: str | None,
) -> PublicApiKey | None:
    settings = get_settings()
    if not settings.public_api_auth_required:
        response.headers["X-RateLimit-Policy"] = "anonymous-development"
        return None
    raw_key = x_api_key
    if not raw_key and authorization and authorization.lower().startswith("bearer "):
        raw_key = authorization[7:].strip()
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    key_hash = hash_public_api_key(raw_key)
    key = db.scalar(
        select(PublicApiKey).where(
            PublicApiKey.key_hash == key_hash,
            PublicApiKey.active.is_(True),
        )
    )
    if key is None:
        raise HTTPException(status_code=401, detail="Invalid API key.")

    now_tick = monotonic()
    with _request_windows_lock:
        window = _request_windows[key_hash]
        while window and window[0] <= now_tick - 60:
            window.popleft()
        if len(window) >= key.requests_per_minute:
            retry_after = max(1, int(60 - (now_tick - window[0])))
            raise HTTPException(
                status_code=429,
                detail="Per-minute API quota exceeded.",
                headers={"Retry-After": str(retry_after)},
            )
        window.append(now_tick)
        remaining = max(0, key.requests_per_minute - len(window))

    now = datetime.now(timezone.utc)
    usage_month = now.strftime("%Y-%m")
    if key.usage_month != usage_month:
        key.usage_month = usage_month
        key.monthly_request_count = 0
    if key.monthly_request_count >= key.monthly_request_limit:
        raise HTTPException(status_code=429, detail="Monthly API quota exceeded.")
    key.monthly_request_count += 1
    key.last_used_at = now
    db.commit()
    response.headers["X-RateLimit-Limit"] = str(key.requests_per_minute)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-Monthly-Limit"] = str(key.monthly_request_limit)
    response.headers["X-Monthly-Remaining"] = str(
        max(0, key.monthly_request_limit - key.monthly_request_count)
    )
    return key
