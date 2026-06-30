from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac, sha256
from hmac import compare_digest
from secrets import token_bytes, token_urlsafe

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import PortalPlan, PortalSession, PortalUser

PORTAL_SESSION_COOKIE = "geoatlas_portal_session"
PASSWORD_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = token_bytes(16).hex()
    digest = pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PASSWORD_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt, digest = password_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    candidate = pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        int(iterations),
    ).hex()
    return compare_digest(candidate, digest)


def hash_session_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def ensure_free_plan(db: Session) -> PortalPlan:
    plan = db.scalar(select(PortalPlan).where(PortalPlan.code == "free"))
    if plan is not None:
        return plan
    plan = PortalPlan(
        code="free",
        name="Free",
        description="Developer access for evaluation and low-volume integration.",
        monthly_price_inr=0,
        requests_per_minute=30,
        monthly_request_limit=5000,
        max_api_keys=2,
        active=True,
        public_visible=True,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def bootstrap_portal_admin(db: Session) -> None:
    settings = get_settings()
    ensure_free_plan(db)
    if not settings.portal_admin_email or not settings.portal_admin_password:
        return
    existing = db.scalar(
        select(PortalUser).where(
            func.lower(PortalUser.email) == settings.portal_admin_email.lower()
        )
    )
    if existing is not None:
        if not existing.is_admin:
            existing.is_admin = True
            db.commit()
        return
    free_plan = ensure_free_plan(db)
    db.add(
        PortalUser(
            full_name=settings.portal_admin_name,
            email=settings.portal_admin_email.lower(),
            organization="GeoAtlas",
            password_hash=hash_password(settings.portal_admin_password),
            plan_id=free_plan.id,
            is_admin=True,
            active=True,
            billing_status="active",
        )
    )
    db.commit()


def create_portal_session(db: Session, user: PortalUser, response: Response) -> str:
    settings = get_settings()
    raw_token = token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.portal_session_days)
    db.add(
        PortalSession(
            user_id=user.id,
            token_hash=hash_session_token(raw_token),
            expires_at=expires_at,
            last_used_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    response.set_cookie(
        PORTAL_SESSION_COOKIE,
        raw_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.portal_session_days * 24 * 60 * 60,
        expires=int(expires_at.timestamp()),
        path="/",
    )
    return raw_token


def clear_portal_session(
    db: Session,
    response: Response,
    session_token: str | None,
) -> None:
    if session_token:
        session = db.scalar(
            select(PortalSession).where(
                PortalSession.token_hash == hash_session_token(session_token)
            )
        )
        if session is not None:
            db.delete(session)
            db.commit()
    response.delete_cookie(PORTAL_SESSION_COOKIE, path="/")


def current_portal_user(
    db: Session,
    session_token: str | None,
) -> PortalUser | None:
    if not session_token:
        return None
    now = datetime.now(timezone.utc)
    session = db.scalar(
        select(PortalSession).where(
            PortalSession.token_hash == hash_session_token(session_token),
            PortalSession.expires_at > now,
        )
    )
    if session is None:
        return None
    user = db.get(PortalUser, session.user_id)
    if user is None or not user.active:
        return None
    session.last_used_at = now
    db.commit()
    return user


def require_portal_user(
    session_token: str | None = Cookie(default=None, alias=PORTAL_SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> PortalUser:
    user = current_portal_user(db, session_token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return user


def require_portal_admin(
    user: PortalUser = Depends(require_portal_user),
) -> PortalUser:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required.",
        )
    return user
