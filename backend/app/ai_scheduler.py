from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text

from app.ai_runner import schedule_ai_analysis
from app.config import get_settings
from app.database import SessionLocal
from app.models import AIAnalysisJob

_stop_event = threading.Event()
_thread: threading.Thread | None = None
_thread_lock = threading.Lock()
_AI_SCHEDULER_LOCK_ID = 7_204_027


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
            stale_before = datetime.now(timezone.utc) - timedelta(
                seconds=settings.ai_job_timeout_seconds
            )
            stale_jobs = list(
                db.scalars(
                    select(AIAnalysisJob).where(
                        AIAnalysisJob.status.in_(["dispatched", "running"]),
                        AIAnalysisJob.started_at.is_not(None),
                        AIAnalysisJob.started_at < stale_before,
                    )
                )
            )
            for job in stale_jobs:
                job.status = "failed"
                job.error_message = "AI analysis exceeded the configured timeout."
                job.finished_at = datetime.now(timezone.utc)
            jobs = list(
                db.scalars(
                    select(AIAnalysisJob)
                    .where(AIAnalysisJob.status == "queued")
                    .order_by(AIAnalysisJob.created_at)
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
