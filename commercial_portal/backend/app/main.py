from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from hashlib import sha256
from secrets import token_urlsafe

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.auth import (
    PORTAL_SESSION_COOKIE,
    bootstrap_portal_admin,
    build_require_admin,
    build_require_user,
    clear_session,
    create_session,
    current_user,
    ensure_free_plan,
    hash_password,
    normalize_email,
    verify_password,
)
from app.config import get_settings
from app.database import Base, engine, get_db
from app.models import PortalApiKey, PortalInvoice, PortalPlan, PortalUser, PublicApiKey
from app.schemas import (
    PortalAdminOverviewResponse,
    PortalApiKeyResponse,
    PortalCreateApiKeyRequest,
    PortalDashboardResponse,
    PortalInvoiceCreateRequest,
    PortalInvoiceResponse,
    PortalLoginRequest,
    PortalPlanResponse,
    PortalPlanUpsertRequest,
    PortalRegisterRequest,
    PortalUserAdminUpdateRequest,
    PortalUserResponse,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with Session(bind=engine) as db:
        ensure_free_plan(db)
        bootstrap_portal_admin(db)
    yield


app = FastAPI(
    title="GeoAtlas Commercial Portal API",
    version="1.0.0",
    description="Standalone commercial developer portal for the GeoAtlas public API.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

require_user = build_require_user(get_db)
require_admin = build_require_admin(require_user)


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


def _plan_response(plan: PortalPlan | None) -> PortalPlanResponse | None:
    return PortalPlanResponse.model_validate(plan) if plan else None


def _user_response(user: PortalUser, plan: PortalPlan | None) -> PortalUserResponse:
    return PortalUserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        organization=user.organization,
        is_admin=user.is_admin,
        active=user.active,
        billing_status=user.billing_status,
        created_at=user.created_at,
        plan=_plan_response(plan),
    )


def _invoice_response(invoice: PortalInvoice) -> PortalInvoiceResponse:
    return PortalInvoiceResponse.model_validate(invoice)


def _api_key_response(mapping: PortalApiKey, key: PublicApiKey, *, plaintext_key: str | None = None) -> PortalApiKeyResponse:
    return PortalApiKeyResponse(
        id=mapping.id,
        label=mapping.label,
        key_prefix=key.key_prefix,
        active=mapping.active and key.active,
        created_at=mapping.created_at,
        revoked_at=mapping.revoked_at,
        requests_per_minute=key.requests_per_minute,
        monthly_request_limit=key.monthly_request_limit,
        monthly_request_count=key.monthly_request_count,
        plaintext_key=plaintext_key,
    )


def _key_rows(db: Session, user_id: str) -> list[tuple[PortalApiKey, PublicApiKey]]:
    return list(
        db.execute(
            select(PortalApiKey, PublicApiKey)
            .join(PublicApiKey, PortalApiKey.public_api_key_id == PublicApiKey.id)
            .where(PortalApiKey.user_id == user_id)
            .order_by(desc(PortalApiKey.created_at))
        ).all()
    )


def _dashboard(db: Session, user: PortalUser) -> PortalDashboardResponse:
    plan = db.get(PortalPlan, user.plan_id) if user.plan_id else None
    api_keys = [_api_key_response(mapping, key) for mapping, key in _key_rows(db, user.id)]
    invoices = [
        _invoice_response(invoice)
        for invoice in db.scalars(
            select(PortalInvoice).where(PortalInvoice.user_id == user.id).order_by(desc(PortalInvoice.issued_at))
        )
    ]
    return PortalDashboardResponse(
        user=_user_response(user, plan),
        plan=_plan_response(plan),
        api_keys=api_keys,
        invoices=invoices,
        hidden_admin_slug=settings.hidden_admin_slug if user.is_admin else None,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/portal/register", response_model=PortalDashboardResponse)
def register(payload: PortalRegisterRequest, response: Response, db: Session = Depends(get_db)) -> PortalDashboardResponse:
    email = normalize_email(payload.email)
    existing = db.scalar(select(PortalUser).where(func.lower(PortalUser.email) == email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    free_plan = ensure_free_plan(db)
    user = PortalUser(
        full_name=payload.full_name.strip(),
        email=email,
        organization=payload.organization.strip() if payload.organization else None,
        password_hash=hash_password(payload.password),
        plan_id=free_plan.id,
        is_admin=False,
        active=True,
        billing_status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(
        PortalInvoice(
            user_id=user.id,
            plan_code=free_plan.code,
            amount_inr=0,
            currency="INR",
            status="free",
            notes="Account created on the GeoAtlas commercial API portal.",
        )
    )
    db.commit()
    create_session(db, user, response)
    return _dashboard(db, user)


@app.post("/api/v1/portal/login", response_model=PortalDashboardResponse)
def login(payload: PortalLoginRequest, response: Response, db: Session = Depends(get_db)) -> PortalDashboardResponse:
    email = normalize_email(payload.email)
    user = db.scalar(select(PortalUser).where(func.lower(PortalUser.email) == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.active:
        raise HTTPException(status_code=403, detail="This account is inactive.")
    create_session(db, user, response)
    return _dashboard(db, user)


@app.post("/api/v1/portal/logout")
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=PORTAL_SESSION_COOKIE),
    db: Session = Depends(get_db),
    _: PortalUser = Depends(require_user),
) -> dict[str, str]:
    clear_session(db, response, session_token)
    return {"status": "ok"}


@app.get("/api/v1/portal/me", response_model=PortalDashboardResponse)
def me(user: PortalUser = Depends(require_user), db: Session = Depends(get_db)) -> PortalDashboardResponse:
    return _dashboard(db, user)


@app.get("/api/v1/portal/plans", response_model=list[PortalPlanResponse])
def plans(db: Session = Depends(get_db)) -> list[PortalPlanResponse]:
    rows = list(
        db.scalars(
            select(PortalPlan)
            .where(PortalPlan.public_visible.is_(True), PortalPlan.active.is_(True))
            .order_by(PortalPlan.monthly_price_inr, PortalPlan.name)
        )
    )
    return [PortalPlanResponse.model_validate(row) for row in rows]


@app.post("/api/v1/portal/api-keys", response_model=PortalApiKeyResponse)
def create_key(
    payload: PortalCreateApiKeyRequest,
    user: PortalUser = Depends(require_user),
    db: Session = Depends(get_db),
) -> PortalApiKeyResponse:
    plan = db.get(PortalPlan, user.plan_id) if user.plan_id else ensure_free_plan(db)
    active_key_count = int(
        db.scalar(
            select(func.count()).select_from(PortalApiKey).where(PortalApiKey.user_id == user.id, PortalApiKey.active.is_(True))
        ) or 0
    )
    if active_key_count >= plan.max_api_keys:
        raise HTTPException(status_code=400, detail=f"{plan.name} tier allows only {plan.max_api_keys} active key(s).")
    key, plaintext = create_public_api_key(
        db,
        payload.label,
        requests_per_minute=plan.requests_per_minute,
        monthly_request_limit=plan.monthly_request_limit,
    )
    mapping = PortalApiKey(user_id=user.id, public_api_key_id=key.id, label=payload.label, active=True)
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return _api_key_response(mapping, key, plaintext_key=plaintext)


@app.post("/api/v1/portal/api-keys/{key_id}/revoke")
def revoke_key(key_id: str, user: PortalUser = Depends(require_user), db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.execute(
        select(PortalApiKey, PublicApiKey)
        .join(PublicApiKey, PortalApiKey.public_api_key_id == PublicApiKey.id)
        .where(PortalApiKey.id == key_id, PortalApiKey.user_id == user.id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="API key not found.")
    mapping, key = row
    mapping.active = False
    mapping.revoked_at = datetime.now(timezone.utc)
    key.active = False
    db.commit()
    return {"status": "revoked"}


@app.get("/api/v1/portal-admin/overview", response_model=PortalAdminOverviewResponse)
def admin_overview(_: PortalUser = Depends(require_admin), db: Session = Depends(get_db)) -> PortalAdminOverviewResponse:
    return PortalAdminOverviewResponse(
        total_users=int(db.scalar(select(func.count()).select_from(PortalUser)) or 0),
        active_users=int(db.scalar(select(func.count()).select_from(PortalUser).where(PortalUser.active.is_(True))) or 0),
        total_api_keys=int(db.scalar(select(func.count()).select_from(PortalApiKey)) or 0),
        active_api_keys=int(db.scalar(select(func.count()).select_from(PortalApiKey).where(PortalApiKey.active.is_(True))) or 0),
        monthly_revenue_inr=int(db.scalar(select(func.coalesce(func.sum(PortalInvoice.amount_inr), 0)).where(PortalInvoice.status.in_(["paid", "open", "free"]))) or 0),
        total_invoices=int(db.scalar(select(func.count()).select_from(PortalInvoice)) or 0),
        hidden_admin_slug=settings.hidden_admin_slug,
    )


@app.get("/api/v1/portal-admin/users", response_model=list[PortalUserResponse])
def admin_users(_: PortalUser = Depends(require_admin), db: Session = Depends(get_db)) -> list[PortalUserResponse]:
    users = list(db.scalars(select(PortalUser).order_by(desc(PortalUser.created_at))))
    plans = {plan.id: plan for plan in db.scalars(select(PortalPlan))}
    return [_user_response(user, plans.get(user.plan_id) if user.plan_id else None) for user in users]


@app.post("/api/v1/portal-admin/users/{user_id}", response_model=PortalUserResponse)
def admin_update_user(
    user_id: str,
    payload: PortalUserAdminUpdateRequest,
    _: PortalUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PortalUserResponse:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if payload.plan_id is not None:
        plan = db.get(PortalPlan, payload.plan_id)
        if plan is None:
            raise HTTPException(status_code=404, detail="Plan not found.")
        user.plan_id = plan.id
    if payload.billing_status is not None:
        user.billing_status = payload.billing_status
    if payload.active is not None:
        user.active = payload.active
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    db.commit()
    db.refresh(user)
    plan = db.get(PortalPlan, user.plan_id) if user.plan_id else None
    return _user_response(user, plan)


@app.get("/api/v1/portal-admin/plans", response_model=list[PortalPlanResponse])
def admin_plans(_: PortalUser = Depends(require_admin), db: Session = Depends(get_db)) -> list[PortalPlanResponse]:
    return [PortalPlanResponse.model_validate(plan) for plan in db.scalars(select(PortalPlan).order_by(PortalPlan.monthly_price_inr, PortalPlan.name))]


@app.post("/api/v1/portal-admin/plans", response_model=PortalPlanResponse)
def admin_create_plan(payload: PortalPlanUpsertRequest, _: PortalUser = Depends(require_admin), db: Session = Depends(get_db)) -> PortalPlanResponse:
    if db.scalar(select(PortalPlan).where(PortalPlan.code == payload.code)):
        raise HTTPException(status_code=409, detail="A plan with this code already exists.")
    plan = PortalPlan(**payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return PortalPlanResponse.model_validate(plan)


@app.post("/api/v1/portal-admin/plans/{plan_id}", response_model=PortalPlanResponse)
def admin_update_plan(plan_id: str, payload: PortalPlanUpsertRequest, _: PortalUser = Depends(require_admin), db: Session = Depends(get_db)) -> PortalPlanResponse:
    plan = db.get(PortalPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    duplicate = db.scalar(select(PortalPlan).where(PortalPlan.code == payload.code, PortalPlan.id != plan_id))
    if duplicate:
        raise HTTPException(status_code=409, detail="Another plan already uses this code.")
    for field, value in payload.model_dump().items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    return PortalPlanResponse.model_validate(plan)


@app.delete("/api/v1/portal-admin/plans/{plan_id}")
def admin_delete_plan(plan_id: str, _: PortalUser = Depends(require_admin), db: Session = Depends(get_db)) -> dict[str, str]:
    plan = db.get(PortalPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    if plan.code == "free":
        raise HTTPException(status_code=400, detail="The system Free plan cannot be deleted.")
    assigned_users = int(
        db.scalar(
            select(func.count()).select_from(PortalUser).where(PortalUser.plan_id == plan.id)
        ) or 0
    )
    if assigned_users:
        raise HTTPException(
            status_code=409,
            detail=f"Reassign {assigned_users} user(s) before deleting this plan.",
        )
    db.delete(plan)
    db.commit()
    return {"status": "deleted"}


@app.get("/api/v1/portal-admin/api-keys", response_model=list[PortalApiKeyResponse])
def admin_api_keys(_: PortalUser = Depends(require_admin), db: Session = Depends(get_db)) -> list[PortalApiKeyResponse]:
    rows = db.execute(
        select(PortalApiKey, PublicApiKey).join(PublicApiKey, PortalApiKey.public_api_key_id == PublicApiKey.id).order_by(desc(PortalApiKey.created_at))
    ).all()
    return [_api_key_response(mapping, key) for mapping, key in rows]


@app.get("/api/v1/portal-admin/invoices", response_model=list[PortalInvoiceResponse])
def admin_invoices(_: PortalUser = Depends(require_admin), db: Session = Depends(get_db)) -> list[PortalInvoiceResponse]:
    return [_invoice_response(invoice) for invoice in db.scalars(select(PortalInvoice).order_by(desc(PortalInvoice.issued_at)))]


@app.post("/api/v1/portal-admin/invoices", response_model=PortalInvoiceResponse)
def admin_create_invoice(
    payload: PortalInvoiceCreateRequest,
    _: PortalUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PortalInvoiceResponse:
    user = db.get(PortalUser, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    invoice = PortalInvoice(
        user_id=user.id,
        plan_code=payload.plan_code,
        amount_inr=payload.amount_inr,
        currency="INR",
        status=payload.status,
        notes=payload.notes,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)
