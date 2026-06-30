from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac, sha256
from hmac import compare_digest
from secrets import token_hex, token_urlsafe

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import PortalPlan, PortalSession, PortalUser

PORTAL_SESSION_COOKIE = "geoatlas_portal_session"


def hash_password(password: str) -> str:
    salt = token_hex(16)
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 390000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    if "$" not in encoded:
        return False
    salt, digest = encoded.split("$", 1)
    current = pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 390000).hex()
    return compare_digest(current, digest)


def hash_session_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def ensure_free_plan(db: Session) -> PortalPlan:
    plan = db.scalar(select(PortalPlan).where(PortalPlan.code == "free"))
    if plan is not None:
        return plan
    plan = PortalPlan(
        code="free",
        name="Free",
        description="Starter access for developers evaluating the GeoAtlas commercial API.",
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
    if not settings.admin_email or not settings.admin_password:
        return
    existing = db.scalar(
        select(PortalUser).where(func.lower(PortalUser.email) == settings.admin_email.lower())
    )
    if existing is not None:
        return
    free_plan = db.scalar(select(PortalPlan).where(PortalPlan.code == "free"))
    db.add(
        PortalUser(
            full_name=settings.admin_name,
            email=settings.admin_email.lower(),
            organization="GeoAtlas",
            password_hash=hash_password(settings.admin_password),
            plan_id=free_plan.id if free_plan else None,
            is_admin=True,
            active=True,
            billing_status="active",
        )
    )
    db.commit()


def create_session(db: Session, user: PortalUser, response: Response) -> str:
    settings = get_settings()
    token = token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.session_days)
    db.add(
        PortalSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=expires_at,
            last_used_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    response.set_cookie(
        PORTAL_SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.session_days * 24 * 60 * 60,
        expires=int(expires_at.timestamp()),
        path="/",
    )
    return token


def clear_session(db: Session, response: Response, session_token: str | None) -> None:
    if session_token:
        session = db.scalar(
            select(PortalSession).where(PortalSession.token_hash == hash_session_token(session_token))
        )
        if session is not None:
            db.delete(session)
            db.commit()
    response.delete_cookie(PORTAL_SESSION_COOKIE, path="/")


def current_user(db: Session, session_token: str | None) -> PortalUser | None:
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
    session.last_used_at = now
    db.commit()
    user = db.get(PortalUser, session.user_id)
    if user is None or not user.active:
        return None
    return user


def require_user(
    session_token: str | None = Cookie(default=None, alias=PORTAL_SESSION_COOKIE),
    db: Session = Depends(lambda: None),
) -> PortalUser:
    raise RuntimeError("require_user dependency must be overridden with a real db dependency")


def require_admin(user: PortalUser = Depends(lambda: None)) -> PortalUser:
    raise RuntimeError("require_admin dependency must be overridden with a real user dependency")


def build_require_user(get_db_dependency):
    def _require_user(
        session_token: str | None = Cookie(default=None, alias=PORTAL_SESSION_COOKIE),
        db: Session = Depends(get_db_dependency),
    ) -> PortalUser:
        user = current_user(db, session_token)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
        return user

    return _require_user


def build_require_admin(require_user_dependency):
    def _require_admin(user: PortalUser = Depends(require_user_dependency)) -> PortalUser:
        if not user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
        return user

    return _require_admin
