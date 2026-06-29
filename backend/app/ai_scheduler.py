from __future__ import annotations

import re
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select, text, update

from app.ai_runner import schedule_ai_analysis
from app.config import get_settings
from app.database import SessionLocal
from app.models import AIAnalysisJob, NormalizedItem

_stop_event = threading.Event()
_thread: threading.Thread | None = None
_thread_lock = threading.Lock()
_AI_SCHEDULER_LOCK_ID = 7_204_027


def _new_item_cutoff() -> datetime | None:
    settings = get_settings()
    if not settings.ai_new_items_only:
        return None
    return datetime.now(timezone.utc) - timedelta(
        hours=settings.ai_new_item_max_age_hours
    )


def skip_stale_ai_backlog_once() -> int:
    cutoff = _new_item_cutoff()
    if cutoff is None:
        return 0
    with SessionLocal() as db:
        stale_item_ids = select(NormalizedItem.id).where(NormalizedItem.created_at < cutoff)
        result = db.execute(
            update(AIAnalysisJob)
            .where(
                AIAnalysisJob.status == "queued",
                AIAnalysisJob.normalized_item_id.in_(stale_item_ids),
            )
            .values(
                status="skipped",
                error_message=(
                    "Skipped because GeoAtlas is configured to analyze only "
                    "newly added items."
                ),
                finished_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        return int(result.rowcount or 0)


def start_ai_scheduler() -> bool:
    global _thread
    with _thread_lock:
        if _thread and _thread.is_alive():
            return False
        _stop_event.clear()
        _thread = threading.Thread(
            target=_scheduler_loop,
            name="geoatlas-ai-scheduler",
            daemon=True,
        )
        _thread.start()
    return True


def stop_ai_scheduler() -> None:
    global _thread
    _stop_event.set()
    with _thread_lock:
        thread = _thread
        _thread = None
    if thread and thread.is_alive():
        thread.join(timeout=3)


def dispatch_ai_jobs_once() -> list[str]:
    settings = get_settings()
    with SessionLocal() as db:
        uses_lock = db.get_bind().dialect.name == "postgresql"
        if uses_lock and not bool(
            db.scalar(
                text("SELECT pg_try_advisory_lock(:lock_id)"),
                {"lock_id": _AI_SCHEDULER_LOCK_ID},
            )
        ):
            return []
        try:
            cutoff = _new_item_cutoff()
            if cutoff is not None:
                stale_item_ids = select(NormalizedItem.id).where(
                    NormalizedItem.created_at < cutoff
                )
                db.execute(
                    update(AIAnalysisJob)
                    .where(
                        AIAnalysisJob.status == "queued",
                        AIAnalysisJob.normalized_item_id.in_(stale_item_ids),
                    )
                    .values(
                        status="skipped",
                        error_message=(
                            "Skipped because GeoAtlas is configured to analyze only "
                            "newly added items."
                        ),
                        finished_at=datetime.now(timezone.utc),
                    )
                )
            stale_before = datetime.now(timezone.utc) - timedelta(
                seconds=settings.ai_job_timeout_seconds
            )
            stale_jobs = list(
                db.scalars(
                    select(AIAnalysisJob).where(
                        AIAnalysisJob.status.in_(["dispatched", "running"]),
                        or_(
                            AIAnalysisJob.started_at < stale_before,
                            and_(
                                AIAnalysisJob.started_at.is_(None),
                                AIAnalysisJob.created_at < stale_before,
                            ),
                        ),
                    )
                )
            )
            for job in stale_jobs:
                match = re.match(r"Retry (\d+)/", job.error_message or "")
                previous_retry = int(match.group(1)) if match else 0
                if previous_retry < settings.ai_max_retries:
                    next_retry = previous_retry + 1
                    job.status = "queued"
                    job.started_at = None
                    job.error_message = (
                        f"Retry {next_retry}/{settings.ai_max_retries} after "
                        "AI analysis timeout."
                    )
                    job.finished_at = None
                else:
                    job.status = "failed"
                    job.error_message = "AI analysis exceeded the configured timeout."
                    job.finished_at = datetime.now(timezone.utc)
            jobs = list(
                db.scalars(
                    select(AIAnalysisJob)
                    .join(
                        NormalizedItem,
                        NormalizedItem.id == AIAnalysisJob.normalized_item_id,
                    )
                    .where(
                        AIAnalysisJob.status == "queued",
                        AIAnalysisJob.provider == settings.ai_provider,
                        AIAnalysisJob.model_name == settings.ai_model,
                        *(
                            [NormalizedItem.created_at >= cutoff]
                            if cutoff is not None
                            else []
                        ),
                    )
                    .order_by(
                        NormalizedItem.created_at.desc(),
                        AIAnalysisJob.created_at.desc(),
                    )
                    .limit(settings.ai_scheduler_batch_size)
                )
            )
            for job in jobs:
                job.status = "dispatched"
            db.commit()
            job_ids = [job.id for job in jobs]
        finally:
            if uses_lock:
                db.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": _AI_SCHEDULER_LOCK_ID},
                )

    dispatched: list[str] = []
    for job_id in job_ids:
        if schedule_ai_analysis(job_id):
            dispatched.append(job_id)
        else:
            with SessionLocal() as db:
                failed = db.get(AIAnalysisJob, job_id)
                if failed and failed.status == "dispatched":
                    failed.status = "failed"
                    failed.error_message = "The AI worker is unavailable."
                    failed.finished_at = datetime.now(timezone.utc)
                    db.commit()
    return dispatched


def _scheduler_loop() -> None:
    settings = get_settings()
    while not _stop_event.is_set():
        try:
            dispatch_ai_jobs_once()
        except Exception:
            pass
        _stop_event.wait(settings.ai_scheduler_poll_seconds)
