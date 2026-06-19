from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdminApiKey


def hash_admin_key(raw_key: str) -> str:
    return sha256(raw_key.encode("utf-8")).hexdigest()


def generate_plaintext_admin_key() -> str:
    return f"geoatlas_admin_{token_urlsafe(32)}"


def create_admin_key(db: Session, name: str) -> tuple[AdminApiKey, str]:
    raw_key = generate_plaintext_admin_key()
    key = AdminApiKey(name=name, key_hash=hash_admin_key(raw_key), active=True)
    db.add(key)
    db.commit()
    db.refresh(key)
    return key, raw_key


def validate_admin_key(db: Session, raw_key: str | None) -> bool:
    if not raw_key:
        return False
    key_hash = hash_admin_key(raw_key)
    admin_key = db.scalar(
        select(AdminApiKey).where(
            AdminApiKey.key_hash == key_hash,
            AdminApiKey.active.is_(True),
        )
    )
    if not admin_key:
        return False
    now = datetime.now(timezone.utc)
    last_used_at = admin_key.last_used_at
    if last_used_at is not None and last_used_at.tzinfo is None:
        last_used_at = last_used_at.replace(tzinfo=timezone.utc)
    if last_used_at is None or now - last_used_at >= timedelta(minutes=5):
        admin_key.last_used_at = now
        db.commit()
    return True
