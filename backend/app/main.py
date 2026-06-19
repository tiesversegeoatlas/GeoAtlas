from pathlib import Path
import re
from datetime import timedelta

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import delete, desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.admin_keys import validate_admin_key
from app.article_utils import infer_location_candidates, sanitize_location_hints
from app.config import get_settings
from app.database import Base, engine, get_db
from app.feed_utils import FeedError
from app.models import EventCandidate, ExternalSource, IngestionJob, NormalizedItem, RawFetchedItem
from app.schemas import (
    DetectRequest,
    DetectResponse,
    IngestResponse,
    JobResponse,
    PublicEvent,
    PublicItem,
    PublicItemsResponse,
    PublicLocation,
    PublicSource,
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
from app.services import bulk_create_sources, check_source_health, create_source, detect_source, find_duplicate_source, run_ingestion, url_fingerprints

settings = get_settings()

app = FastAPI(
    title="GeoAtlas Data Collection API",
    description="Standalone RSS/Atom source collection and public output API for GeoAtlas.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.admin_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "X-Limit", "X-Offset"],
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

from app.health import health_check

@app.get("/health")
def health():

    return health_check()
    
@app.on_event("startup")
def initialize_database() -> None:
    try:
        Base.metadata.create_all(bind=engine)
        app.state.database_ready = True
        app.state.database_error = None
    except SQLAlchemyError as exc:
        app.state.database_ready = False
        app.state.database_error = str(exc)


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
    checked_source, working, message = check_source_health(db, source)
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
    job = run_ingestion(db, source)
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


@app.get("/api/v1/public/sources", response_model=list[PublicSource])
def public_sources(db: Session = Depends(get_db)) -> list[PublicSource]:
    sources = db.scalars(
        select(ExternalSource)
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        .order_by(ExternalSource.name)
    )
    return [
        PublicSource(
            id=source.id,
            name=source.name,
            feed_url=source.feed_url,
            site_url=source.site_url,
            reliability_score=source.reliability_score,
            last_success_at=source.last_success_at,
        )
        for source in sources
    ]


@app.get("/api/v1/public/items", response_model=PublicItemsResponse)
def public_items(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
) -> PublicItemsResponse:
    candidate_limit = min(limit * 5, 500)
    statement = (
        select(NormalizedItem)
        .join(NormalizedItem.source)
        .options(selectinload(NormalizedItem.source), selectinload(NormalizedItem.locations))
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        .order_by(desc(NormalizedItem.published_at), desc(NormalizedItem.created_at))
        .limit(candidate_limit)
    )
    if source_id:
        statement = statement.where(NormalizedItem.source_id == source_id)
    items = _deduplicate_items(list(db.scalars(statement)))[:limit]
    return PublicItemsResponse(items=[_public_item(item) for item in items], next_cursor=None)


@app.get("/api/v1/public/items/{item_id}", response_model=PublicItem)
def public_item(item_id: str, db: Session = Depends(get_db)) -> PublicItem:
    item = db.get(NormalizedItem, item_id)
    if not item or not item.source.enabled or item.source.archived:
        raise HTTPException(status_code=404, detail="Item not found.")
    return _public_item(item)


@app.get("/api/v1/public/events", response_model=list[PublicEvent])
def public_events(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
) -> list[EventCandidate]:
    candidate_limit = min(limit * 5, 500)
    statement = (
        select(EventCandidate, ExternalSource.reliability_score)
        .join(ExternalSource, EventCandidate.source_id == ExternalSource.id)
        .where(ExternalSource.enabled.is_(True), ExternalSource.archived.is_(False))
        .order_by(desc(EventCandidate.created_at))
        .limit(candidate_limit)
    )
    if source_id:
        statement = statement.where(EventCandidate.source_id == source_id)
    return _deduplicate_events(list(db.execute(statement)))[:limit]


@app.get("/api/v1/public/export.json")
def public_export(db: Session = Depends(get_db), source_id: str | None = None, limit: int = Query(default=100, ge=1, le=500)) -> dict:
    items = public_items(db=db, source_id=source_id, limit=limit)
    events = public_events(db=db, source_id=source_id, limit=limit)
    return {
        "items": [item.model_dump(mode="json") for item in items.items],
        "events": [PublicEvent.model_validate(event).model_dump(mode="json") for event in events],
    }


def _public_item(item: NormalizedItem) -> PublicItem:
    source = item.source
    fresh_location_hints = infer_location_candidates(item.title, item.body or item.summary)
    stored_location_hints = sanitize_location_hints(item.location_hints)
    combined_location_hints = fresh_location_hints + [
        hint
        for hint in stored_location_hints
        if not any(str(hint.get("name", "")).lower() == str(fresh.get("name", "")).lower() for fresh in fresh_location_hints)
    ]
    clean_location_hints = sanitize_location_hints(combined_location_hints)
    if clean_location_hints:
        top_confidence = float(clean_location_hints[0].get("confidence") or 0)
        clean_location_hints = [
            hint
            for hint in clean_location_hints
            if float(hint.get("confidence") or 0) >= top_confidence - 0.02
        ]
    clean_coordinates = {
        (round(float(hint["latitude"]), 4), round(float(hint["longitude"]), 4))
        for hint in clean_location_hints
        if hint.get("latitude") is not None and hint.get("longitude") is not None
    }
    return PublicItem(
        id=item.id,
        source=PublicSource(
            id=source.id,
            name=source.name,
            feed_url=source.feed_url,
            site_url=source.site_url,
            reliability_score=source.reliability_score,
            last_success_at=source.last_success_at,
        ),
        canonical_url=item.canonical_url,
        title=item.title,
        summary=item.summary,
        body=item.body,
        image_url=item.image_url,
        language=item.language,
        published_at=item.published_at,
        collected_at=item.created_at,
        category_hints=item.category_hints,
        location_hints=clean_location_hints,
        locations=[
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
        ],
        extraction_status=item.extraction_status,
    )


def _deduplicate_items(items: list[NormalizedItem]) -> list[NormalizedItem]:
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
        if item.source.reliability_score > existing.source.reliability_score:
            selected[duplicate_index] = item
    return sorted(
        selected,
        key=lambda item: item.published_at or item.created_at,
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
