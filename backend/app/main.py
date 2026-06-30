from pathlib import Path
import re
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy import case, delete, desc, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.admin_keys import validate_admin_key
from app.ai_pipeline import PROMPT_VERSION
from app.ai_runner import shutdown_ai_runner
from app.ai_scheduler import start_ai_scheduler, stop_ai_scheduler
from app.analytics import event_matches_filters, generate_event_statistics
from app.article_utils import infer_location_candidates, sanitize_location_hints
from app.config import get_settings
from app.collection_scheduler import start_collection_scheduler, stop_collection_scheduler
from app.database import Base, SessionLocal, engine, get_db
from app.feed_utils import FeedError
from app.headless_search import HeadlessNewsSearcher
from app.ingestion_runner import schedule_ingestion, shutdown_ingestion_runner
from app.models import (
    AIAnalysisJob,
    AISuggestion,
    AIWorkerHeartbeat,
    EventCandidate,
    ExternalSource,
    IngestionJob,
    NormalizedItem,
    NormalizedItemLocation,
    PortalApiKey,
    PortalInvoice,
    PortalPlan,
    PortalSession,
    PortalUser,
    PublicApiKey,
    RawFetchedItem,
)
from app.portal_auth import (
    PORTAL_SESSION_COOKIE,
    bootstrap_portal_admin,
    clear_portal_session,
    create_portal_session,
    current_portal_user,
    ensure_free_plan,
    hash_password,
    require_portal_admin,
    require_portal_user,
    verify_password,
)
from app.public_api_keys import create_public_api_key, require_public_api_key
from app.public_content import (
    public_location_hint,
    sanitize_public_text,
    sanitize_public_url,
)
from app.schemas import (
    AIAnalysisJobResponse,
    AIAnalyzeRequest,
    AIAnalyzeResponse,
    AIProgressResponse,
    AIReviewRequest,
    AISuggestionResponse,
    DetectRequest,
    DetectResponse,
    IngestResponse,
    JobResponse,
    PublicEvent,
    PublicItem,
    PublicItemsResponse,
    PublicLocation,
    PublicOverview,
    PublicSource,
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
    SourceBulkImportRequest,
    SourceBulkImportResponse,
    SourceCreate,
    SourceDuplicateCheckRequest,
    SourceDuplicateCheckResponse,
    SourceHealthCheckResponse,
    SourceMarkRequest,
    SourcePurgeResponse,
    SourceResponse,
    SourceUpdate,
)
from app.services import bulk_create_sources, check_source_health, create_ingestion_job, create_source, detect_source, find_duplicate_source, url_fingerprints

settings = get_settings()

app = FastAPI(
    title="GeoAtlas Intelligence API",
    description="Independent, versioned global news and risk-intelligence API.",
    version="1.0.0",
    contact={"name": "GeoAtlas API Support"},
    license_info={"name": "Commercial"},
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.admin_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Total-Count",
        "X-Limit",
        "X-Offset",
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-Monthly-Limit",
        "X-Monthly-Remaining",
        "Retry-After",
    ],
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def database_error_detail(exc: SQLAlchemyError) -> str:
    message = str(exc).lower()
    if isinstance(exc, OperationalError) and (
        "max clients reached" in message
        or "too many clients" in message
        or "emaxconnsession" in message
    ):
        return "Database is temporarily busy. Please retry shortly."
    return "Database is temporarily unavailable."


@app.get("/openapi.json", include_in_schema=False)
def public_openapi_schema() -> JSONResponse:
    public_paths = {
        "/health",
        "/ready",
        "/api/v1",
    }
    public_routes = [
        route
        for route in app.routes
        if getattr(route, "path", "").startswith("/api/v1/public/")
        or getattr(route, "path", "") in public_paths
    ]
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=public_routes,
    )
    return JSONResponse(schema)


@app.get("/docs", include_in_schema=False)
def public_api_docs():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{app.title} - API documentation",
    )


@app.middleware("http")
async def add_api_headers(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    try:
        response = await call_next(request)
    except SQLAlchemyError as exc:
        response = JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": database_error_detail(exc)},
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/v1/public/"):
        response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=120"
    return response


@app.on_event("startup")
def initialize_database() -> None:
    try:
        Base.metadata.create_all(bind=engine)
        app.state.database_ready = True
        app.state.database_error = None
        with SessionLocal() as db:
            ensure_free_plan(db)
            bootstrap_portal_admin(db)
            active_job_ids = list(
                db.scalars(
                    select(IngestionJob.id).where(IngestionJob.status.in_(["queued", "running"]))
                )
            )
            active_ai_jobs = list(
                db.scalars(
                    select(AIAnalysisJob).where(
                        AIAnalysisJob.status.in_(["dispatched", "running"])
                    )
                )
            )
            for ai_job in active_ai_jobs:
                ai_job.status = "queued"
                ai_job.started_at = None
            if active_ai_jobs:
                db.commit()
        for job_id in active_job_ids:
            schedule_ingestion(job_id)
        start_collection_scheduler()
        start_ai_scheduler()
    except SQLAlchemyError as exc:
        app.state.database_ready = False
        app.state.database_error = str(exc)


@app.on_event("shutdown")
def stop_ingestion_runner() -> None:
    stop_collection_scheduler()
    stop_ai_scheduler()
    shutdown_ingestion_runner()
    shutdown_ai_runner()


def require_admin(x_admin_key: str | None = Header(default=None), db: Session = Depends(get_db)) -> None:
    try:
        is_valid = validate_admin_key(db, x_admin_key)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Admin key validation database unavailable.") from exc
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing admin API key.")


def source_or_404(db: Session, source_id: str) -> ExternalSource:
    source = db.get(ExternalSource, source_id)
    if not source or source.archived:
        raise HTTPException(status_code=404, detail="Source not found.")
    return source


def source_including_archived_or_404(db: Session, source_id: str) -> ExternalSource:
    source = db.get(ExternalSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found.")
    return source


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _portal_plan_response(plan: PortalPlan | None) -> PortalPlanResponse | None:
    if plan is None:
        return None
    return PortalPlanResponse.model_validate(plan)


def _portal_user_response(user: PortalUser, plan: PortalPlan | None) -> PortalUserResponse:
    return PortalUserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        organization=user.organization,
        is_admin=user.is_admin,
        active=user.active,
        billing_status=user.billing_status,
        created_at=user.created_at,
        plan=_portal_plan_response(plan),
    )


def _portal_api_key_response(
    mapping: PortalApiKey,
    key: PublicApiKey,
    *,
    plaintext_key: str | None = None,
) -> PortalApiKeyResponse:
    return PortalApiKeyResponse(
        id=mapping.id,
        label=mapping.label,
        key_prefix=key.key_prefix,
        active=mapping.active and key.active,
        requests_per_minute=key.requests_per_minute,
        monthly_request_limit=key.monthly_request_limit,
        monthly_request_count=key.monthly_request_count,
        usage_month=key.usage_month,
        created_at=mapping.created_at,
        last_used_at=key.last_used_at,
        plaintext_key=plaintext_key,
    )


def _portal_invoice_response(invoice: PortalInvoice) -> PortalInvoiceResponse:
    return PortalInvoiceResponse.model_validate(invoice)


def _portal_key_rows(db: Session, user_id: str) -> list[tuple[PortalApiKey, PublicApiKey]]:
    return list(
        db.execute(
            select(PortalApiKey, PublicApiKey)
            .join(PublicApiKey, PortalApiKey.public_api_key_id == PublicApiKey.id)
            .where(PortalApiKey.user_id == user_id)
            .order_by(desc(PortalApiKey.created_at))
        )
    )


def _portal_dashboard_response(db: Session, user: PortalUser) -> PortalDashboardResponse:
    plan = db.get(PortalPlan, user.plan_id) if user.plan_id else None
    api_keys = [
        _portal_api_key_response(mapping, key)
        for mapping, key in _portal_key_rows(db, user.id)
    ]
    invoices = [
        _portal_invoice_response(invoice)
        for invoice in db.scalars(
            select(PortalInvoice)
            .where(PortalInvoice.user_id == user.id)
            .order_by(desc(PortalInvoice.issued_at))
            .limit(20)
        )
    ]
    return PortalDashboardResponse(
        user=_portal_user_response(user, plan),
        plan=_portal_plan_response(plan),
        api_keys=api_keys,
        invoices=invoices,
        hidden_admin_slug=settings.portal_hidden_admin_slug if user.is_admin else None,
    )


@app.post("/api/v1/portal/register", response_model=PortalDashboardResponse)
def portal_register(payload: PortalRegisterRequest, response: Response, db: Session = Depends(get_db)) -> PortalDashboardResponse:
    ensure_free_plan(db)
    email = _normalize_email(payload.email)
    existing = db.scalar(select(PortalUser).where(func.lower(PortalUser.email) == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    is_first_user = not bool(db.scalar(select(func.count()).select_from(PortalUser)) or 0)
    free_plan = db.scalar(select(PortalPlan).where(PortalPlan.code == "free"))
    if free_plan is None:
        free_plan = ensure_free_plan(db)
    user = PortalUser(
        full_name=payload.full_name.strip(),
        email=email,
        organization=(payload.organization or "").strip() or None,
        password_hash=hash_password(payload.password),
        plan_id=free_plan.id,
        is_admin=is_first_user,
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
            amount_inr=free_plan.monthly_price_inr,
            currency="INR",
            status="free" if free_plan.monthly_price_inr == 0 else "open",
            notes="Account created on the GeoAtlas commercial API portal.",
        )
    )
    db.commit()
    create_portal_session(db, user, response)
    return _portal_dashboard_response(db, user)


@app.post("/api/v1/portal/login", response_model=PortalDashboardResponse)
def portal_login(payload: PortalLoginRequest, response: Response, db: Session = Depends(get_db)) -> PortalDashboardResponse:
    email = _normalize_email(payload.email)
    user = db.scalar(select(PortalUser).where(func.lower(PortalUser.email) == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.active:
        raise HTTPException(status_code=403, detail="This account is inactive.")
    create_portal_session(db, user, response)
    return _portal_dashboard_response(db, user)


@app.post("/api/v1/portal/logout")
def portal_logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=PORTAL_SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> dict:
    clear_portal_session(db, response, session_token)
    return {"status": "signed_out"}


@app.get("/api/v1/portal/me", response_model=PortalDashboardResponse)
def portal_me(user: PortalUser = Depends(require_portal_user), db: Session = Depends(get_db)) -> PortalDashboardResponse:
    return _portal_dashboard_response(db, user)


@app.get("/api/v1/portal/plans", response_model=list[PortalPlanResponse])
def portal_plans(db: Session = Depends(get_db)) -> list[PortalPlanResponse]:
    plans = list(
        db.scalars(
            select(PortalPlan)
            .where(PortalPlan.public_visible.is_(True), PortalPlan.active.is_(True))
            .order_by(PortalPlan.monthly_price_inr, PortalPlan.name)
        )
    )
    return [PortalPlanResponse.model_validate(plan) for plan in plans]


@app.post("/api/v1/portal/api-keys", response_model=PortalApiKeyResponse)
def portal_create_api_key(
    payload: PortalCreateApiKeyRequest,
    user: PortalUser = Depends(require_portal_user),
    db: Session = Depends(get_db),
) -> PortalApiKeyResponse:
    plan = db.get(PortalPlan, user.plan_id) if user.plan_id else ensure_free_plan(db)
    active_key_count = int(
        db.scalar(
            select(func.count())
            .select_from(PortalApiKey)
            .where(PortalApiKey.user_id == user.id, PortalApiKey.active.is_(True))
        )
        or 0
    )
    if plan and active_key_count >= plan.max_api_keys:
        raise HTTPException(status_code=400, detail="API key limit reached for this plan.")
    key, plaintext = create_public_api_key(
        db,
        payload.label.strip(),
        requests_per_minute=(plan.requests_per_minute if plan else settings.public_api_default_rpm),
        monthly_request_limit=(plan.monthly_request_limit if plan else settings.public_api_default_monthly_limit),
    )
    mapping = PortalApiKey(
        user_id=user.id,
        public_api_key_id=key.id,
        label=payload.label.strip(),
        active=True,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return _portal_api_key_response(mapping, key, plaintext_key=plaintext)


@app.post("/api/v1/portal/api-keys/{key_id}/revoke")
def portal_revoke_api_key(
    key_id: str,
    user: PortalUser = Depends(require_portal_user),
    db: Session = Depends(get_db),
) -> dict:
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
def portal_admin_overview(
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> PortalAdminOverviewResponse:
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    return PortalAdminOverviewResponse(
        total_users=int(db.scalar(select(func.count()).select_from(PortalUser)) or 0),
        active_users=int(db.scalar(select(func.count()).select_from(PortalUser).where(PortalUser.active.is_(True))) or 0),
        total_api_keys=int(db.scalar(select(func.count()).select_from(PortalApiKey)) or 0),
        active_api_keys=int(db.scalar(select(func.count()).select_from(PortalApiKey).where(PortalApiKey.active.is_(True))) or 0),
        monthly_requests=int(
            db.scalar(
                select(func.coalesce(func.sum(PublicApiKey.monthly_request_count), 0))
                .where(PublicApiKey.usage_month == current_month)
            )
            or 0
        ),
        monthly_revenue_inr=int(
            db.scalar(
                select(func.coalesce(func.sum(PortalInvoice.amount_inr), 0))
                .where(PortalInvoice.status.in_(["paid", "open", "free"]))
            )
            or 0
        ),
        total_invoices=int(db.scalar(select(func.count()).select_from(PortalInvoice)) or 0),
        hidden_admin_slug=settings.portal_hidden_admin_slug,
    )


@app.get("/api/v1/portal-admin/users", response_model=list[PortalUserResponse])
def portal_admin_users(
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> list[PortalUserResponse]:
    users = list(db.scalars(select(PortalUser).order_by(desc(PortalUser.created_at))))
    plans = {plan.id: plan for plan in db.scalars(select(PortalPlan))}
    return [_portal_user_response(user, plans.get(user.plan_id) if user.plan_id else None) for user in users]


@app.post("/api/v1/portal-admin/users/{user_id}", response_model=PortalUserResponse)
def portal_admin_update_user(
    user_id: str,
    payload: PortalUserAdminUpdateRequest,
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> PortalUserResponse:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if payload.plan_id:
        plan = db.get(PortalPlan, payload.plan_id)
        if plan is None:
            raise HTTPException(status_code=404, detail="Plan not found.")
        user.plan_id = plan.id
    user.billing_status = payload.billing_status
    user.active = payload.active
    user.is_admin = payload.is_admin
    db.commit()
    db.refresh(user)
    plan = db.get(PortalPlan, user.plan_id) if user.plan_id else None
    return _portal_user_response(user, plan)


@app.get("/api/v1/portal-admin/plans", response_model=list[PortalPlanResponse])
def portal_admin_plans(
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> list[PortalPlanResponse]:
    return [PortalPlanResponse.model_validate(plan) for plan in db.scalars(select(PortalPlan).order_by(PortalPlan.monthly_price_inr, PortalPlan.name))]


@app.post("/api/v1/portal-admin/plans", response_model=PortalPlanResponse)
def portal_admin_create_plan(
    payload: PortalPlanUpsertRequest,
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> PortalPlanResponse:
    existing = db.scalar(select(PortalPlan).where(PortalPlan.code == payload.code))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Plan code already exists.")
    plan = PortalPlan(**payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return PortalPlanResponse.model_validate(plan)


@app.post("/api/v1/portal-admin/plans/{plan_id}", response_model=PortalPlanResponse)
def portal_admin_update_plan(
    plan_id: str,
    payload: PortalPlanUpsertRequest,
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> PortalPlanResponse:
    plan = db.get(PortalPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    duplicate = db.scalar(select(PortalPlan).where(PortalPlan.code == payload.code, PortalPlan.id != plan_id))
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="Plan code already exists.")
    for field, value in payload.model_dump().items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    return PortalPlanResponse.model_validate(plan)


@app.get("/api/v1/portal-admin/api-keys", response_model=list[PortalApiKeyResponse])
def portal_admin_api_keys(
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> list[PortalApiKeyResponse]:
    rows = db.execute(
        select(PortalApiKey, PublicApiKey)
        .join(PublicApiKey, PortalApiKey.public_api_key_id == PublicApiKey.id)
        .order_by(desc(PortalApiKey.created_at))
    )
    return [_portal_api_key_response(mapping, key) for mapping, key in rows]


@app.get("/api/v1/portal-admin/invoices", response_model=list[PortalInvoiceResponse])
def portal_admin_invoices(
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> list[PortalInvoiceResponse]:
    return [
        _portal_invoice_response(invoice)
        for invoice in db.scalars(select(PortalInvoice).order_by(desc(PortalInvoice.issued_at)))
    ]


@app.post("/api/v1/portal-admin/invoices", response_model=PortalInvoiceResponse)
def portal_admin_create_invoice(
    payload: PortalInvoiceCreateRequest,
    _: PortalUser = Depends(require_portal_admin),
    db: Session = Depends(get_db),
) -> PortalInvoiceResponse:
    user = db.get(PortalUser, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    invoice = PortalInvoice(
        user_id=user.id,
        amount_inr=payload.amount_inr,
        status=payload.status,
        plan_code=payload.plan_code,
        notes=payload.notes,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return _portal_invoice_response(invoice)


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    database_status = "ok"
    database_error = None
    try:
        db.execute(select(1))
    except SQLAlchemyError as exc:
        database_status = "error"
        database_error = str(exc).splitlines()[0]
    return {
        "status": "ok" if database_status == "ok" else "degraded",
        "database": database_status,
        "database_error": database_error,
        "service": "geoatlas-data-collection",
        "supabase": {
            "url_configured": bool(settings.supabase_url),
            "anon_key_configured": bool(settings.supabase_anon_key),
            "service_role_key_configured": bool(settings.supabase_service_role_key),
            "postgres_connection_configured": not settings.database_url.startswith("sqlite"),
        },
        "collection_scheduler": {
            "enabled": settings.scheduler_enabled,
            "poll_seconds": settings.scheduler_poll_seconds,
            "max_pending_jobs": settings.scheduler_max_pending_jobs,
            "job_timeout_seconds": settings.scheduler_job_timeout_seconds,
        },
    }


@app.get("/ready")
def readiness(db: Session = Depends(get_db)) -> dict:
    try:
        db.execute(select(1))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database is not ready.") from exc
    return {"status": "ready", "service": "geoatlas-intelligence-api", "version": app.version}


@app.get("/api/v1", tags=["service"])
def service_manifest() -> dict:
    return {
        "service": "GeoAtlas Intelligence API",
        "version": app.version,
        "documentation": "/docs",
        "openapi": "/openapi.json",
        "health": "/health",
        "readiness": "/ready",
        "authentication": "X-API-Key or Authorization: Bearer",
    }


@app.post("/api/v1/sources/detect", response_model=DetectResponse, dependencies=[Depends(require_admin)])
def detect_feed(payload: DetectRequest) -> dict:
    try:
        return detect_source(str(payload.url), payload.fetch_sample_items)
    except FeedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/sources/rss", response_model=SourceResponse, dependencies=[Depends(require_admin)])
def add_rss_source(payload: SourceCreate, db: Session = Depends(get_db)) -> ExternalSource:
    try:
        return create_source(db, payload)
    except FeedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/sources", response_model=list[SourceResponse], dependencies=[Depends(require_admin)])
def list_sources(
    response: Response,
    db: Session = Depends(get_db),
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = None,
    source_status: str | None = Query(default=None, alias="status"),
) -> list[ExternalSource]:
    filters = []
    if not include_archived:
        filters.append(ExternalSource.archived.is_(False))
    if source_status and source_status != "all":
        filters.append(ExternalSource.status == source_status)
    if q:
        like_query = f"%{q.strip()}%"
        filters.append(
            or_(
                ExternalSource.name.ilike(like_query),
                ExternalSource.feed_url.ilike(like_query),
                ExternalSource.status.ilike(like_query),
            )
        )
    total_statement = select(func.count()).select_from(ExternalSource)
    statement = select(ExternalSource).order_by(desc(ExternalSource.created_at)).offset(offset).limit(limit)
    if filters:
        total_statement = total_statement.where(*filters)
        statement = statement.where(*filters)
    total = db.scalar(total_statement) or 0
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Limit"] = str(limit)
    response.headers["X-Offset"] = str(offset)
    return list(db.scalars(statement))


@app.post("/api/v1/sources/duplicates", response_model=SourceDuplicateCheckResponse, dependencies=[Depends(require_admin)])
def check_source_duplicates(payload: SourceDuplicateCheckRequest, db: Session = Depends(get_db)) -> dict:
    sources = list(db.scalars(select(ExternalSource)))
    fingerprint_index = {}
    for source in sources:
        fingerprints = url_fingerprints(source.feed_url) | url_fingerprints(source.site_url)
        for fingerprint in fingerprints:
            fingerprint_index.setdefault(fingerprint, source)
    items = []
    for url in payload.urls:
        duplicate = next(
            (fingerprint_index[fingerprint] for fingerprint in url_fingerprints(url) if fingerprint in fingerprint_index),
            None,
        )
        matched_by = "stored-url" if duplicate else None
        if not duplicate and payload.detect_unmatched:
            try:
                detected = detect_source(url, fetch_sample_items=False)
                urls = [url]
                for candidate in detected["candidates"]:
                    urls.extend([candidate.get("feed_url"), candidate.get("site_url")])
                duplicate = find_duplicate_source(db, urls)
                matched_by = "detected-feed" if duplicate else None
            except FeedError:
                duplicate = None
        items.append(
            {
                "url": url,
                "duplicate_id": duplicate.id if duplicate else None,
                "duplicate_name": duplicate.name if duplicate else None,
                "matched_by": matched_by,
            }
        )
    return {"items": items}


@app.post("/api/v1/sources/import", response_model=SourceBulkImportResponse, dependencies=[Depends(require_admin)])
def import_sources(payload: SourceBulkImportRequest, db: Session = Depends(get_db)) -> dict:
    return bulk_create_sources(db, payload.sources)


@app.get("/api/v1/sources/{source_id}", response_model=SourceResponse, dependencies=[Depends(require_admin)])
def get_source(source_id: str, db: Session = Depends(get_db)) -> ExternalSource:
    return source_or_404(db, source_id)


@app.patch("/api/v1/sources/{source_id}", response_model=SourceResponse, dependencies=[Depends(require_admin)])
def update_source(source_id: str, payload: SourceUpdate, db: Session = Depends(get_db)) -> ExternalSource:
    source = source_or_404(db, source_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(source, key, value)
    db.commit()
    db.refresh(source)
    return source


@app.post("/api/v1/sources/{source_id}/mark", response_model=SourceResponse, dependencies=[Depends(require_admin)])
def mark_source(source_id: str, payload: SourceMarkRequest, db: Session = Depends(get_db)) -> ExternalSource:
    source = source_or_404(db, source_id)
    if payload.working:
        source.status = "active"
        source.enabled = True
        source.last_error = None
    else:
        source.status = "failing"
        source.enabled = False
        source.last_error = "Marked not working by admin."
    db.commit()
    db.refresh(source)
    return source


@app.post("/api/v1/sources/{source_id}/check-health", response_model=SourceHealthCheckResponse, dependencies=[Depends(require_admin)])
def check_source_rss_health(source_id: str, db: Session = Depends(get_db)) -> dict:
    source = source_or_404(db, source_id)
    with HeadlessNewsSearcher() as searcher:
        checked_source, working, message = check_source_health(db, source, searcher=searcher)
    return {"source": checked_source, "working": working, "message": message}


@app.delete("/api/v1/sources/{source_id}", response_model=SourceResponse, dependencies=[Depends(require_admin)])
def archive_source(source_id: str, db: Session = Depends(get_db)) -> ExternalSource:
    source = source_or_404(db, source_id)
    source.archived = True
    source.enabled = False
    source.status = "archived"
    db.commit()
    db.refresh(source)
    return source


@app.delete("/api/v1/sources/{source_id}/purge", response_model=SourcePurgeResponse, dependencies=[Depends(require_admin)])
def purge_source(source_id: str, db: Session = Depends(get_db)) -> dict:
    source_including_archived_or_404(db, source_id)
    deleted_events = db.execute(delete(EventCandidate).where(EventCandidate.source_id == source_id)).rowcount or 0
    deleted_normalized_items = db.execute(delete(NormalizedItem).where(NormalizedItem.source_id == source_id)).rowcount or 0
    deleted_raw_items = db.execute(delete(RawFetchedItem).where(RawFetchedItem.source_id == source_id)).rowcount or 0
    deleted_jobs = db.execute(delete(IngestionJob).where(IngestionJob.source_id == source_id)).rowcount or 0
    deleted_sources = db.execute(delete(ExternalSource).where(ExternalSource.id == source_id)).rowcount or 0
    db.commit()
    return {
        "source_id": source_id,
        "deleted_events": deleted_events,
        "deleted_normalized_items": deleted_normalized_items,
        "deleted_raw_items": deleted_raw_items,
        "deleted_jobs": deleted_jobs,
        "deleted_sources": deleted_sources,
    }


@app.post("/api/v1/sources/{source_id}/ingest", response_model=IngestResponse, dependencies=[Depends(require_admin)])
def ingest_source(source_id: str, db: Session = Depends(get_db)) -> dict:
    source = source_or_404(db, source_id)
    active_job = db.scalar(
        select(IngestionJob)
        .where(
            IngestionJob.source_id == source.id,
            IngestionJob.status.in_(["queued", "running"]),
        )
        .order_by(desc(IngestionJob.created_at))
        .limit(1)
    )
    if active_job:
        return {"job": active_job}
    job = create_ingestion_job(db, source)
    if not schedule_ingestion(job.id):
        job.status = "failed"
        job.error_message = "The ingestion worker is shutting down. Restart the API and try again."
        db.commit()
        db.refresh(job)
    return {"job": job}


@app.get("/api/v1/ingestion/jobs", response_model=list[JobResponse], dependencies=[Depends(require_admin)])
def list_jobs(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[IngestionJob]:
    statement = select(IngestionJob).order_by(desc(IngestionJob.created_at)).limit(limit)
    if source_id:
        statement = statement.where(IngestionJob.source_id == source_id)
    return list(db.scalars(statement))


@app.get("/api/v1/ingestion/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_admin)])
def get_job(job_id: str, db: Session = Depends(get_db)) -> IngestionJob:
    job = db.get(IngestionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.post(
    "/api/v1/ai/analyze",
    response_model=AIAnalyzeResponse,
    dependencies=[Depends(require_admin)],
)
def queue_ai_analysis(
    payload: AIAnalyzeRequest,
    db: Session = Depends(get_db),
) -> dict:
    requested_ids = list(dict.fromkeys(payload.item_ids))
    if payload.latest_limit:
        latest_ids = list(
            db.scalars(
                select(NormalizedItem.id)
                .order_by(
                    desc(NormalizedItem.published_at).nullslast(),
                    desc(NormalizedItem.created_at),
                )
                .limit(payload.latest_limit)
            )
        )
        requested_ids.extend(
            item_id for item_id in latest_ids if item_id not in requested_ids
        )
    if not requested_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide item_ids or a positive latest_limit.",
        )
    if len(requested_ids) > 100:
        raise HTTPException(status_code=400, detail="At most 100 items can be queued.")

    existing_ids = set(
        db.scalars(
            select(NormalizedItem.id).where(NormalizedItem.id.in_(requested_ids))
        )
    )
    missing_ids = [item_id for item_id in requested_ids if item_id not in existing_ids]
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Normalized item not found: {missing_ids[0]}",
        )

    jobs: list[AIAnalysisJob] = []
    for item_id in requested_ids:
        active = db.scalar(
            select(AIAnalysisJob)
            .where(
                AIAnalysisJob.normalized_item_id == item_id,
                AIAnalysisJob.status.in_(["queued", "dispatched", "running"]),
            )
            .order_by(desc(AIAnalysisJob.created_at))
            .limit(1)
        )
        if active:
            jobs.append(active)
            continue
        job = AIAnalysisJob(
            normalized_item_id=item_id,
            status="queued",
            provider=settings.ai_provider,
            model_name=(
                "geoatlas-rules-v1"
                if settings.ai_provider == "heuristic"
                else settings.ai_model
            ),
            force=payload.force,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        jobs.append(job)
    return {"jobs": jobs}


@app.get(
    "/api/v1/ai/progress",
    response_model=AIProgressResponse,
    dependencies=[Depends(require_admin)],
)
def ai_progress(db: Session = Depends(get_db)) -> dict:
    return _ai_progress(db)


@app.get(
    "/api/v1/ai/jobs",
    response_model=list[AIAnalysisJobResponse],
    dependencies=[Depends(require_admin)],
)
def list_ai_jobs(
    db: Session = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AIAnalysisJob]:
    statement = (
        select(AIAnalysisJob)
        .order_by(desc(AIAnalysisJob.created_at))
        .limit(limit)
    )
    if status_filter:
        statement = statement.where(AIAnalysisJob.status == status_filter)
    return list(db.scalars(statement))


@app.get(
    "/api/v1/ai/suggestions",
    response_model=list[AISuggestionResponse],
    dependencies=[Depends(require_admin)],
)
def list_ai_suggestions(
    db: Session = Depends(get_db),
    item_id: str | None = None,
    review_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AISuggestion]:
    statement = (
        select(AISuggestion)
        .order_by(desc(AISuggestion.created_at))
        .limit(limit)
    )
    if item_id:
        statement = statement.where(AISuggestion.normalized_item_id == item_id)
    if review_status:
        statement = statement.where(AISuggestion.status == review_status)
    return list(db.scalars(statement))


@app.post(
    "/api/v1/ai/suggestions/{suggestion_id}/review",
    response_model=AISuggestionResponse,
    dependencies=[Depends(require_admin)],
)
def review_ai_suggestion(
    suggestion_id: str,
    payload: AIReviewRequest,
    db: Session = Depends(get_db),
) -> AISuggestion:
    suggestion = db.get(AISuggestion, suggestion_id)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="AI suggestion not found.")
    suggestion.status = payload.status
    db.commit()
    db.refresh(suggestion)
    return suggestion


def _ai_progress(db: Session) -> dict:
    total_items = int(
        db.scalar(select(func.count()).select_from(NormalizedItem)) or 0
    )
    analyzed_items = int(
        db.scalar(
            select(func.count(func.distinct(AISuggestion.normalized_item_id))).where(
                AISuggestion.prompt_version == PROMPT_VERSION
            )
        )
        or 0
    )
    job_counts = dict(
        db.execute(
            select(AIAnalysisJob.status, func.count()).group_by(AIAnalysisJob.status)
        ).all()
    )
    latest_completed_at = db.scalar(
        select(func.max(AISuggestion.created_at)).where(
            AISuggestion.prompt_version == PROMPT_VERSION
        )
    )
    total_sources = int(
        db.scalar(select(func.count()).select_from(ExternalSource)) or 0
    )
    ranked_sources = int(
        db.scalar(
            select(func.count())
            .select_from(ExternalSource)
            .where(ExternalSource.ai_credibility_score.is_not(None))
        )
        or 0
    )
    queued = int(job_counts.get("queued", 0))
    dispatched = int(job_counts.get("dispatched", 0))
    running = int(job_counts.get("running", 0))
    active = dispatched + running
    recent_cutoff = datetime.now(timezone.utc) - timedelta(
        seconds=max(300, settings.ai_job_timeout_seconds * 2)
    )
    if not settings.ai_enabled:
        worker_status = "disabled"
    elif active:
        worker_status = "processing"
    elif queued and latest_completed_at and latest_completed_at >= recent_cutoff:
        worker_status = "processing"
    elif queued and latest_completed_at is None:
        worker_status = "waiting"
    elif queued:
        worker_status = "stalled"
    else:
        worker_status = "idle"
    remaining_items = max(0, total_items - analyzed_items)
    progress_percent = (
        round((analyzed_items / total_items) * 100, 1) if total_items else 100.0
    )
    heartbeat_cutoff = datetime.now(timezone.utc) - timedelta(seconds=30)
    worker_display_cutoff = datetime.now(timezone.utc) - timedelta(minutes=2)
    workers = list(
        db.scalars(
            select(AIWorkerHeartbeat)
            .where(AIWorkerHeartbeat.heartbeat_at >= worker_display_cutoff)
            .order_by(AIWorkerHeartbeat.slot)
        )
    )
    worker_payload = []
    for worker in workers:
        individual_status = worker.status
        if worker.heartbeat_at < heartbeat_cutoff and individual_status not in {
            "stopped",
            "drained",
        }:
            individual_status = "offline"
        worker_payload.append(
            {
                "worker_id": worker.worker_id,
                "worker_name": worker.worker_name,
                "slot": worker.slot,
                "process_id": worker.process_id,
                "host_name": worker.host_name,
                "status": individual_status,
                "current_job_id": worker.current_job_id,
                "completed_count": worker.completed_count,
                "failed_count": worker.failed_count,
                "cpu_percent": worker.cpu_percent,
                "available_memory_gb": worker.available_memory_gb,
                "status_message": worker.status_message,
                "started_at": worker.started_at,
                "heartbeat_at": worker.heartbeat_at,
            }
        )
    return {
        "enabled": settings.ai_enabled,
        "auto_analyze": settings.ai_auto_analyze,
        "provider": settings.ai_provider,
        "model": settings.ai_model,
        "prompt_version": PROMPT_VERSION,
        "worker_status": worker_status,
        "worker_capacity": settings.ai_worker_count,
        "adaptive_workers": False,
        "total_items": total_items,
        "analyzed_items": analyzed_items,
        "remaining_items": remaining_items,
        "progress_percent": progress_percent,
        "queued_jobs": queued,
        "dispatched_jobs": dispatched,
        "running_jobs": running,
        "successful_jobs": int(job_counts.get("success", 0)),
        "failed_jobs": int(job_counts.get("failed", 0)),
        "ranked_sources": ranked_sources,
        "total_sources": total_sources,
        "latest_completed_at": latest_completed_at,
        "workers": worker_payload,
    }


@app.get("/api/v1/public/sources", response_model=list[PublicSource], dependencies=[Depends(require_public_api_key)])
def public_sources(db: Session = Depends(get_db)) -> list[PublicSource]:
    sources = list(db.scalars(
        select(ExternalSource)
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        .order_by(ExternalSource.name)
    ))
    sources.sort(key=_source_credibility_score, reverse=True)
    return [
        PublicSource(
            id=source.id,
            name=source.name,
            feed_url=sanitize_public_url(source.feed_url) or source.feed_url,
            site_url=sanitize_public_url(source.site_url),
            credibility_score=_source_credibility_score(source),
            credibility_tier=_credibility_tier(_source_credibility_score(source)),
            last_success_at=source.last_success_at,
        )
        for source in sources
    ]


@app.get("/api/v1/public/output-sources", response_model=list[PublicSource], dependencies=[Depends(require_public_api_key)])
def public_output_sources(db: Session = Depends(get_db)) -> list[PublicSource]:
    sources = list(db.scalars(
        select(ExternalSource)
        .join(NormalizedItem, NormalizedItem.source_id == ExternalSource.id)
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        .distinct()
        .order_by(ExternalSource.name)
    ))
    sources.sort(key=_source_credibility_score, reverse=True)
    return [
        PublicSource(
            id=source.id,
            name=source.name,
            feed_url=sanitize_public_url(source.feed_url) or source.feed_url,
            site_url=sanitize_public_url(source.site_url),
            credibility_score=_source_credibility_score(source),
            credibility_tier=_credibility_tier(_source_credibility_score(source)),
            last_success_at=source.last_success_at,
        )
        for source in sources
    ]


@app.get("/api/v1/public/items", response_model=PublicItemsResponse, dependencies=[Depends(require_public_api_key)])
def public_items(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    offset: Annotated[int, Query(ge=0)] = 0,
    include_body: bool = True,
    deduplicate: bool = True,
    since_hours: Annotated[int | None, Query(ge=1, le=168)] = None,
) -> PublicItemsResponse:
    settings = get_settings()
    require_ai_publication = bool(settings.ai_enabled and settings.ai_auto_analyze)
    ai_publication_exists = exists(
        select(AISuggestion.id).where(
            AISuggestion.normalized_item_id == NormalizedItem.id,
            AISuggestion.status.in_(["approved", "pending_review"]),
        )
    )
    candidate_limit = (
        min(max((offset + limit) * 5, 250), 500)
        if deduplicate
        else limit
    )
    cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=since_hours)
        if since_hours is not None
        else None
    )
    statement = (
        select(NormalizedItem)
        .join(NormalizedItem.source)
        .options(selectinload(NormalizedItem.source), selectinload(NormalizedItem.locations))
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        .order_by(
            desc(NormalizedItem.published_at).nullslast(),
            desc(NormalizedItem.created_at),
        )
    )
    if source_id:
        statement = statement.where(NormalizedItem.source_id == source_id)
    if cutoff is not None:
        statement = statement.where(
            func.coalesce(
                NormalizedItem.published_at,
                NormalizedItem.created_at,
            ) >= cutoff
        )
    if require_ai_publication:
        statement = statement.where(ai_publication_exists)
    statement = statement.limit(candidate_limit)
    if not deduplicate:
        statement = statement.offset(offset)
    candidates = list(db.scalars(statement))
    if deduplicate and not source_id:
        credible_statement = (
            select(NormalizedItem)
            .join(NormalizedItem.source)
            .options(
                selectinload(NormalizedItem.source),
                selectinload(NormalizedItem.locations),
            )
            .where(
                ExternalSource.enabled.is_(True),
                ExternalSource.archived.is_(False),
            )
            .order_by(
                desc(func.coalesce(
                    ExternalSource.ai_credibility_score,
                    ExternalSource.reliability_score * 100,
                )),
                desc(NormalizedItem.published_at).nullslast(),
                desc(NormalizedItem.created_at),
            )
        )
        if cutoff is not None:
            credible_statement = credible_statement.where(
                func.coalesce(
                    NormalizedItem.published_at,
                    NormalizedItem.created_at,
                ) >= cutoff
            )
        if require_ai_publication:
            credible_statement = credible_statement.where(ai_publication_exists)
        credible_candidates = list(
            db.scalars(credible_statement.limit(candidate_limit))
        )
        seen_ids = {item.id for item in candidates}
        candidates.extend(
            item for item in credible_candidates if item.id not in seen_ids
        )
    suggestions = _preferred_ai_suggestions(db, [item.id for item in candidates])
    items = (
        _deduplicate_items(candidates, suggestions)[offset:offset + limit]
        if deduplicate
        else candidates
    )
    count_statement = (
        select(func.count(NormalizedItem.id))
        .join(NormalizedItem.source)
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
    )
    if source_id:
        count_statement = count_statement.where(NormalizedItem.source_id == source_id)
    if cutoff is not None:
        count_statement = count_statement.where(
            func.coalesce(
                NormalizedItem.published_at,
                NormalizedItem.created_at,
            ) >= cutoff
        )
    if require_ai_publication:
        count_statement = count_statement.where(ai_publication_exists)
    total = int(db.scalar(count_statement) or 0)
    next_offset = offset + len(items)
    return PublicItemsResponse(
        items=[
            _public_item(
                item,
                include_body=include_body,
                suggestion=suggestions.get(item.id),
            )
            for item in items
        ],
        next_cursor=str(next_offset) if next_offset < total and items else None,
        total=total,
        offset=offset,
        limit=limit,
    )


@app.get("/api/v1/public/items/{item_id}", response_model=PublicItem, dependencies=[Depends(require_public_api_key)])
def public_item(item_id: str, db: Session = Depends(get_db)) -> PublicItem:
    settings = get_settings()
    item = db.get(NormalizedItem, item_id)
    if not item or not item.source.enabled or item.source.archived:
        raise HTTPException(status_code=404, detail="Item not found.")
    suggestion = _preferred_ai_suggestions(db, [item.id]).get(item.id)
    if settings.ai_enabled and settings.ai_auto_analyze and suggestion is None:
        raise HTTPException(status_code=404, detail="Item not found.")
    return _public_item(item, include_body=True, suggestion=suggestion)


@app.get("/api/v1/public/events", response_model=list[PublicEvent], dependencies=[Depends(require_public_api_key)])
def public_events(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    risk_hint: str | None = None,
    category: str | None = None,
    country_code: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
) -> list[PublicEvent]:
    candidate_limit = min(limit * 10, 1000)
    statement = (
        select(EventCandidate, ExternalSource.reliability_score)
        .join(ExternalSource, EventCandidate.source_id == ExternalSource.id)
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        .order_by(desc(EventCandidate.created_at))
        .limit(candidate_limit)
    )
    if source_id:
        statement = statement.where(EventCandidate.source_id == source_id)
    events = _deduplicate_events(list(db.execute(statement)))
    filtered_events = [
        event
        for event in events
        if event_matches_filters(
            event,
            risk_hint=risk_hint,
            category=category,
            country_code=country_code,
        )
    ][:limit]
    return [
        PublicEvent(
            id=event.id,
            source_id=event.source_id,
            normalized_item_id=event.normalized_item_id,
            title=sanitize_public_text(event.title) or "Untitled report",
            summary=sanitize_public_text(event.summary) or None,
            category_hints=event.category_hints,
            location_hints=[
                public_location_hint(hint)
                for hint in sanitize_location_hints(event.location_hints)
            ],
            risk_hint=event.risk_hint,
            publication_status=event.publication_status,
            created_at=event.created_at,
        )
        for event in filtered_events
    ]


@app.get("/api/v1/public/statistics", dependencies=[Depends(require_public_api_key)])
def public_statistics(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    limit: int = Query(default=1000, ge=1, le=5000),
) -> dict:
    statement = (
        select(EventCandidate, ExternalSource)
        .join(ExternalSource, EventCandidate.source_id == ExternalSource.id)
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        .order_by(desc(EventCandidate.created_at))
        .limit(limit)
    )
    if source_id:
        statement = statement.where(EventCandidate.source_id == source_id)
    return generate_event_statistics(db.execute(statement))


@app.get("/api/v1/public/overview", response_model=PublicOverview, dependencies=[Depends(require_public_api_key)])
def public_overview(db: Session = Depends(get_db)) -> PublicOverview:
    item_rows = list(
        db.execute(
            select(
                NormalizedItem.id,
                NormalizedItem.category_hints,
                NormalizedItem.location_hints,
                NormalizedItem.published_at,
                NormalizedItem.created_at,
            )
            .join(NormalizedItem.source)
            .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        )
    )
    suggestions = list(
        db.scalars(
            select(AISuggestion)
            .join(NormalizedItem, AISuggestion.normalized_item_id == NormalizedItem.id)
            .join(ExternalSource, NormalizedItem.source_id == ExternalSource.id)
            .where(
                ExternalSource.enabled.is_(True),
                ExternalSource.archived.is_(False),
                AISuggestion.status.in_(["approved", "pending_review"]),
            )
            .order_by(
                case(
                    (AISuggestion.prompt_version == PROMPT_VERSION, 0),
                    else_=1,
                ),
                case((AISuggestion.status == "approved", 0), else_=1),
                desc(AISuggestion.confidence),
                desc(AISuggestion.created_at),
            )
        )
    )
    preferred: dict[str, AISuggestion] = {}
    for suggestion in suggestions:
        preferred.setdefault(suggestion.normalized_item_id, suggestion)

    stored_country_codes = {
        str(code).upper()
        for code in db.scalars(
            select(NormalizedItemLocation.country_code)
            .join(NormalizedItem, NormalizedItemLocation.normalized_item_id == NormalizedItem.id)
            .join(ExternalSource, NormalizedItem.source_id == ExternalSource.id)
            .where(
                ExternalSource.enabled.is_(True),
                ExternalSource.archived.is_(False),
                NormalizedItemLocation.country_code.is_not(None),
            )
            .distinct()
        )
        if code
    }
    countries = set(stored_country_codes)
    daily: dict[str, list[int]] = {}
    grouped_scores: dict[str, list[int]] = {
        "Security": [],
        "Political": [],
        "Humanitarian": [],
        "Environmental": [],
    }
    high_risk = 0
    policy_events = 0
    all_scores: list[int] = []
    for item_id, category_hints, location_hints, published_at, created_at in item_rows:
        payload = preferred[item_id].output_payload if item_id in preferred else {}
        categories = [
            str(value).lower()
            for value in (category_hints or payload.get("categories") or [])
        ]
        risk_score = int(payload.get("risk_score") or _fallback_risk_score(categories))
        risk_score = max(0, min(100, risk_score))
        all_scores.append(risk_score)
        if risk_score >= 70:
            high_risk += 1
        group = _overview_category_group(categories)
        grouped_scores[group].append(risk_score)
        if group == "Political":
            policy_events += 1
        for hint in (location_hints or []) + (payload.get("locations") or []):
            if isinstance(hint, dict) and hint.get("country_code"):
                countries.add(str(hint["country_code"]).upper())
        timestamp = published_at or created_at
        day = timestamp.date().isoformat()
        daily.setdefault(day, []).append(risk_score)

    timeline = [
        {
            "date": day,
            "label": datetime.fromisoformat(day).strftime("%b %d"),
            "risk": round(sum(scores) / len(scores)),
            "events": len(scores),
        }
        for day, scores in sorted(daily.items())[-30:]
    ]
    breakdown = [
        {
            "label": label,
            "value": round(sum(scores) / len(scores)) if scores else 0,
            "count": len(scores),
        }
        for label, scores in grouped_scores.items()
    ]
    return PublicOverview(
        total_news=len(item_rows),
        high_risk_events=high_risk,
        countries_affected=len(countries),
        policy_events=policy_events,
        overall_risk=round(sum(all_scores) / len(all_scores)) if all_scores else 0,
        timeline=timeline,
        breakdown=breakdown,
        generated_at=datetime.now(timezone.utc),
    )


@app.get("/api/v1/public/export.json", dependencies=[Depends(require_public_api_key)])
def public_export(db: Session = Depends(get_db), source_id: str | None = None, limit: int = Query(default=100, ge=1, le=500)) -> dict:
    items = public_items(db=db, source_id=source_id, limit=limit, offset=0, include_body=True)
    events = public_events(db=db, source_id=source_id, limit=limit)
    return {
        "items": [item.model_dump(mode="json") for item in items.items],
        "events": [PublicEvent.model_validate(event).model_dump(mode="json") for event in events],
    }


def _public_item(
    item: NormalizedItem,
    *,
    include_body: bool = True,
    suggestion: AISuggestion | None = None,
) -> PublicItem:
    source = item.source
    ai_payload = suggestion.output_payload if suggestion else {}
    ai_confidence = float(suggestion.confidence) if suggestion else 0
    use_ai_text = bool(suggestion and ai_payload)
    use_ai_structured = bool(
        suggestion
        and (suggestion.status == "approved" or ai_confidence >= 0.78)
    )
    use_ai_location = bool(suggestion and ai_payload)
    use_ai_risk = bool(
        suggestion
        and ai_payload.get("risk_score") is not None
        and ai_payload.get("risk_level")
    )
    ai_enriched_fields: list[str] = []
    generated_summary = sanitize_public_text(
        str(ai_payload.get("summary") or "") if use_ai_text else ""
    )
    generated_content = sanitize_public_text(
        str(ai_payload.get("generated_content") or "")
        if use_ai_text
        else ""
    )

    summary = sanitize_public_text(generated_summary or item.summary) or None
    if generated_summary:
        ai_enriched_fields.append("summary")

    body = sanitize_public_text(generated_content or item.body) or None
    if include_body and generated_content:
        ai_enriched_fields.append("body")

    fresh_location_hints = (
        infer_location_candidates(item.title, body or summary)
        if include_body
        else []
    )
    stored_location_hints = sanitize_location_hints(item.location_hints)
    explicit_stored_location_hints = [
        hint
        for hint in stored_location_hints
        if hint.get("method") != "source_scope"
    ]
    ai_location_hints: list[dict] = []
    if use_ai_location and not explicit_stored_location_hints:
        ai_location = str(
            ai_payload.get("location") or ai_payload.get("country") or ""
        ).strip()
        has_verifiable_location = bool(
            ai_payload.get("country_code")
            or (
                ai_payload.get("latitude") is not None
                and ai_payload.get("longitude") is not None
            )
        )
        if ai_location and has_verifiable_location:
            ai_location_hints = [{
                "name": ai_location,
                "country_code": ai_payload.get("country_code"),
                "latitude": ai_payload.get("latitude"),
                "longitude": ai_payload.get("longitude"),
                "confidence": min(0.92, ai_confidence),
                "method": "ai_suggestion",
                "evidence": "Structured AI analysis",
            }]
            ai_enriched_fields.append("location")
    combined_location_hints = fresh_location_hints + ai_location_hints + [
        hint
        for hint in stored_location_hints
        if not any(
            str(hint.get("name", "")).lower()
            == str(fresh.get("name", "")).lower()
            for fresh in fresh_location_hints
        )
    ]
    clean_location_hints = sanitize_location_hints(combined_location_hints)
    if clean_location_hints:
        top_confidence = float(clean_location_hints[0].get("confidence") or 0)
        clean_location_hints = [
            hint
            for hint in clean_location_hints
            if float(hint.get("confidence") or 0) >= top_confidence - 0.02
        ]
    public_location_hints = [
        public_location_hint(hint)
        for hint in clean_location_hints
    ]
    clean_coordinates = {
        (round(float(hint["latitude"]), 4), round(float(hint["longitude"]), 4))
        for hint in clean_location_hints
        if hint.get("latitude") is not None and hint.get("longitude") is not None
    }
    stored_public_locations = [
        PublicLocation(
            name=location.name,
            country_code=location.country_code,
            latitude=float(location.latitude) if location.latitude is not None else None,
            longitude=float(location.longitude) if location.longitude is not None else None,
            confidence=float(location.confidence) if location.confidence is not None else None,
        )
        for location in item.locations
        if location.latitude is not None
        and location.longitude is not None
        and (
            round(float(location.latitude), 4),
            round(float(location.longitude), 4),
        )
        in clean_coordinates
    ]
    ai_public_locations = [
        PublicLocation(
            name=str(hint["name"]),
            country_code=hint.get("country_code"),
            latitude=hint.get("latitude"),
            longitude=hint.get("longitude"),
            confidence=hint.get("confidence"),
        )
        for hint in ai_location_hints
        if hint.get("latitude") is not None and hint.get("longitude") is not None
    ]
    public_locations = list(
        {
            (
                round(float(location.latitude), 4)
                if location.latitude is not None
                else None,
                round(float(location.longitude), 4)
                if location.longitude is not None
                else None,
                location.name,
            ): location
            for location in stored_public_locations + ai_public_locations
        }.values()
    )

    category_hints = item.category_hints
    if use_ai_structured and not category_hints:
        categories = [
            str(value)
            for value in (ai_payload.get("categories") or [])
            if str(value).strip()
        ]
        if categories:
            category_hints = categories
            ai_enriched_fields.append("categories")

    risk_score = (
        int(ai_payload["risk_score"])
        if use_ai_risk
        else None
    )
    urgency_score = (
        int(ai_payload["urgency_score"])
        if use_ai_risk and ai_payload.get("urgency_score") is not None
        else None
    )
    importance_score = (
        int(ai_payload["importance_score"])
        if use_ai_risk and ai_payload.get("importance_score") is not None
        else None
    )
    claim_quality_score = (
        int(ai_payload["claim_quality_score"])
        if use_ai_risk and ai_payload.get("claim_quality_score") is not None
        else None
    )
    breaking_reason = _breaking_reason(
        item,
        ai_is_breaking=(
            bool(ai_payload.get("is_breaking"))
            if use_ai_risk and "is_breaking" in ai_payload
            else None
        ),
        ai_breaking_reason=str(ai_payload.get("breaking_reason") or "")
        if use_ai_risk
        else "",
        risk_score=risk_score,
        urgency_score=urgency_score,
        importance_score=importance_score,
        risk_level=str(ai_payload.get("risk_level") or "")
        if use_ai_risk
        else "",
    )
    credibility_score = _source_credibility_score(source)
    return PublicItem(
        id=item.id,
        source=PublicSource(
            id=source.id,
            name=source.name,
            feed_url=sanitize_public_url(source.feed_url) or source.feed_url,
            site_url=sanitize_public_url(source.site_url),
            credibility_score=credibility_score,
            credibility_tier=_credibility_tier(credibility_score),
            last_success_at=source.last_success_at,
        ),
        canonical_url=sanitize_public_url(item.canonical_url),
        title=sanitize_public_text(item.title) or "Untitled report",
        summary=summary,
        body=body if include_body else None,
        image_url=sanitize_public_url(item.image_url),
        language=item.language,
        published_at=item.published_at,
        collected_at=item.created_at,
        category_hints=category_hints,
        location_hints=public_location_hints,
        locations=public_locations,
        extraction_status=item.extraction_status,
        risk_level=(
            str(ai_payload.get("risk_level"))
            if use_ai_risk
            else None
        ),
        risk_score=risk_score,
        importance_score=importance_score,
        urgency_score=urgency_score,
        claim_quality_score=claim_quality_score,
        is_breaking=bool(breaking_reason),
        breaking_reason=breaking_reason,
        credibility_score=credibility_score,
        rank_score=_item_rank_score(item, suggestion),
    )


def _preferred_ai_suggestions(
    db: Session,
    item_ids: list[str],
) -> dict[str, AISuggestion]:
    if not item_ids:
        return {}
    suggestions = list(
        db.scalars(
            select(AISuggestion)
            .where(
                AISuggestion.normalized_item_id.in_(item_ids),
                AISuggestion.status.in_(["approved", "pending_review"]),
            )
            .order_by(
                case((AISuggestion.status == "approved", 0), else_=1),
                desc(AISuggestion.confidence),
                desc(AISuggestion.created_at),
            )
        )
    )
    selected: dict[str, AISuggestion] = {}
    for suggestion in suggestions:
        selected.setdefault(suggestion.normalized_item_id, suggestion)
    return selected


def _source_credibility_score(source: ExternalSource) -> float:
    if source.ai_credibility_score is not None and source.ai_assessment_count > 0:
        return round(max(0, min(100, float(source.ai_credibility_score))), 1)
    score = float(source.reliability_score) * 100
    success = source.last_success_at
    failure = source.last_failure_at
    if success and (not failure or success >= failure):
        score += 5
    elif failure and (not success or failure > success):
        score -= 15
    if source.status == "failing":
        score -= 10
    elif source.status in {"active", "url"} and source.enabled:
        score += 2
    return round(max(0, min(100, score)), 1)


def _fallback_risk_score(categories: list[str]) -> int:
    values = set(categories)
    if values & {"war", "conflict", "armed_conflict", "terrorism"}:
        return 78
    if values & {"cyber", "military", "unrest", "dispute"}:
        return 58
    if values & {"disaster", "natural_disaster", "earthquake", "flood", "wildfire", "cyclone"}:
        return 52
    return 28


def _overview_category_group(categories: list[str]) -> str:
    values = set(categories)
    if values & {"war", "conflict", "armed_conflict", "terrorism", "cyber", "military", "dispute"}:
        return "Security"
    if values & {"humanitarian", "health"}:
        return "Humanitarian"
    if values & {"disaster", "natural_disaster", "earthquake", "flood", "wildfire", "cyclone", "climate"}:
        return "Environmental"
    return "Political"


def _credibility_tier(score: float) -> str:
    if score >= 85:
        return "very_high"
    if score >= 70:
        return "high"
    if score >= 50:
        return "medium"
    if score >= 30:
        return "low"
    return "very_low"


def _item_rank_score(
    item: NormalizedItem,
    suggestion: AISuggestion | None,
) -> float:
    credibility = _source_credibility_score(item.source)
    payload = suggestion.output_payload if suggestion else {}
    usable_ai = bool(
        suggestion
        and (suggestion.status == "approved" or float(suggestion.confidence) >= 0.78)
    )
    importance = (
        float(payload.get("importance_score") or payload.get("risk_score") or 35)
        if usable_ai
        else 35
    )
    claim_quality = (
        float(payload.get("claim_quality_score") or 50)
        if usable_ai
        else 50
    )
    timestamp = item.published_at or item.created_at
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    age_hours = max(
        0,
        (datetime.now(timezone.utc) - timestamp).total_seconds() / 3600,
    )
    recency = max(0, 100 - min(age_hours, 168) / 168 * 100)
    score = (
        credibility * 0.50
        + importance * 0.25
        + claim_quality * 0.10
        + recency * 0.15
    )
    if item.published_at is not None:
        score += 8
    if _breaking_reason(
        item,
        ai_is_breaking=(
            bool(payload.get("is_breaking"))
            if usable_ai and "is_breaking" in payload
            else None
        ),
        ai_breaking_reason=str(payload.get("breaking_reason") or "")
        if usable_ai
        else "",
        risk_score=int(payload.get("risk_score") or 0) if usable_ai else None,
        urgency_score=int(payload.get("urgency_score") or 0) if usable_ai else None,
        importance_score=int(payload.get("importance_score") or 0) if usable_ai else None,
        risk_level=str(payload.get("risk_level") or "") if usable_ai else "",
    ):
        score += 18
    if credibility < 50:
        score *= 0.68
    return round(score, 2)


def _breaking_reason(
    item: NormalizedItem,
    *,
    ai_is_breaking: bool | None,
    ai_breaking_reason: str,
    risk_score: int | None,
    urgency_score: int | None,
    importance_score: int | None,
    risk_level: str,
) -> str | None:
    if risk_score is None or urgency_score is None or importance_score is None:
        return None
    timestamp = item.published_at or item.created_at
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    age_hours = max(
        0,
        (datetime.now(timezone.utc) - timestamp).total_seconds() / 3600,
    )
    if age_hours > 36:
        return None
    if ai_is_breaking is False:
        return None
    if ai_is_breaking is True:
        if urgency_score < 60 or importance_score < 40:
            return None
        return (
            sanitize_public_text(ai_breaking_reason)[:300]
            or f"Selected as a time-sensitive report with risk {risk_score}/100."
        )
    if urgency_score >= 85 and risk_score >= 75:
        return f"Urgent developing report with risk {risk_score}/100."
    if risk_level == "critical" and urgency_score >= 75:
        return f"Critical report with urgency {urgency_score}/100."
    if risk_score >= 85 and importance_score >= 75 and urgency_score >= 70:
        return "High-risk, high-impact developing report."
    return None


def _deduplicate_items(
    items: list[NormalizedItem],
    suggestions: dict[str, AISuggestion] | None = None,
) -> list[NormalizedItem]:
    suggestions = suggestions or {}
    selected: list[NormalizedItem] = []
    for item in items:
        duplicate_index = next(
            (index for index, existing in enumerate(selected) if _same_story(item, existing)),
            None,
        )
        if duplicate_index is None:
            selected.append(item)
            continue
        existing = selected[duplicate_index]
        if _source_credibility_score(item.source) > _source_credibility_score(existing.source):
            selected[duplicate_index] = item
    return sorted(
        selected,
        key=lambda item: (
            item.published_at is not None,
            _item_rank_score(item, suggestions.get(item.id)),
        ),
        reverse=True,
    )


def _same_story(left: NormalizedItem, right: NormalizedItem) -> bool:
    if left.canonical_url and right.canonical_url:
        if left.canonical_url.rstrip("/").lower() == right.canonical_url.rstrip("/").lower():
            return True
    left_date = left.published_at or left.created_at
    right_date = right.published_at or right.created_at
    if abs(left_date - right_date) > timedelta(hours=72):
        return False
    return _title_similarity(left.title, right.title) >= 0.72


def _title_tokens(title: str) -> set[str]:
    stopwords = {"a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with"}
    return {
        token
        for token in re.findall(r"[a-z0-9]+", title.lower())
        if len(token) > 2 and token not in stopwords
    }


def _deduplicate_events(rows) -> list[EventCandidate]:
    selected: list[tuple[EventCandidate, float]] = []
    for event, reliability in rows:
        duplicate_index = next(
            (
                index
                for index, (existing, _) in enumerate(selected)
                if abs(event.created_at - existing.created_at) <= timedelta(hours=72)
                and _title_similarity(event.title, existing.title) >= 0.72
            ),
            None,
        )
        if duplicate_index is None:
            selected.append((event, float(reliability)))
        elif float(reliability) > selected[duplicate_index][1]:
            selected[duplicate_index] = (event, float(reliability))
    return [event for event, _ in sorted(selected, key=lambda pair: pair[0].created_at, reverse=True)]


def _title_similarity(left: str, right: str) -> float:
    left_tokens = _title_tokens(left)
    right_tokens = _title_tokens(right)
    if not left_tokens or not right_tokens:
        return 0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
