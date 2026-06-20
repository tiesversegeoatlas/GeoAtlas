from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.ingestion_runner import schedule_ingestion
from app.models import ExternalSource, IngestionJob

_stop_event = threading.Event()
_thread: threading.Thread | None = None
_thread_lock = threading.Lock()


def start_collection_scheduler() -> bool:
    global _thread
    settings = get_settings()
    if not settings.scheduler_enabled:
        return False
    with _thread_lock:
        if _thread and _thread.is_alive():
            return False
        _stop_event.clear()
        _thread = threading.Thread(
            target=_scheduler_loop,
            name="geoatlas-collection-scheduler",
            daemon=True,
        )
        _thread.start()
    return True


def stop_collection_scheduler() -> None:
    global _thread
    _stop_event.set()
    with _thread_lock:
        thread = _thread
        _thread = None
    if thread and thread.is_alive():
        thread.join(timeout=3)


def collect_due_sources_once(
    db: Session,
    *,
    now: datetime | None = None,
) -> list[str]:
    settings = get_settings()
    now = now or datetime.now(timezone.utc)
    active_job_source_ids = list(
        db.scalars(
            select(IngestionJob.source_id).where(
                IngestionJob.status.in_(["queued", "running"])
            )
        )
    )
    active_source_ids = set(active_job_source_ids)
    available_slots = settings.scheduler_max_pending_jobs - len(active_job_source_ids)
    if available_slots <= 0:
        return []

    sources = list(
        db.scalars(
            select(ExternalSource)
            .where(
                ExternalSource.enabled.is_(True),
                ExternalSource.archived.is_(False),
                ExternalSource.status.in_(["active", "url"]),
            )
            .order_by(ExternalSource.updated_at.asc())
            .limit(settings.scheduler_source_scan_limit)
        )
    )
    scheduled: list[str] = []
    for source in sources:
        if len(scheduled) >= available_slots:
            break
        if source.id in active_source_ids or not _source_is_due(source, now):
            continue
        job = IngestionJob(
            source_id=source.id,
            trigger_type="scheduled",
            status="queued",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        if schedule_ingestion(job.id):
            scheduled.append(job.id)
            active_source_ids.add(source.id)
        else:
            job.status = "failed"
            job.error_message = "The ingestion worker is unavailable."
            job.finished_at = now
            db.commit()
    return scheduled


def _source_is_due(source: ExternalSource, now: datetime) -> bool:
    attempts = [
        _as_utc(value)
        for value in (source.last_success_at, source.last_failure_at)
        if value is not None
    ]
    if not attempts:
        return True
    last_attempt = max(attempts)
    return now - last_attempt >= timedelta(minutes=source.fetch_interval_minutes)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _scheduler_loop() -> None:
    settings = get_settings()
    while not _stop_event.is_set():
        try:
            with SessionLocal() as db:
                collect_due_sources_once(db)
        except Exception:
            # A transient database/source error must not terminate future collection.
            pass
        _stop_event.wait(settings.scheduler_poll_seconds)
