from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

from app.config import get_settings
from app.database import SessionLocal
from app.headless_search import HeadlessNewsSearcher
from app.models import ExternalSource, IngestionJob
from app.services import run_ingestion

_settings = get_settings()
_executor = ThreadPoolExecutor(
    max_workers=_settings.ingest_worker_count,
    thread_name_prefix="geoatlas-ingest",
)
_lock = threading.Lock()
_scheduled_jobs: set[str] = set()


def schedule_ingestion(job_id: str) -> bool:
    with _lock:
        if job_id in _scheduled_jobs:
            return False
        _scheduled_jobs.add(job_id)
    try:
        _executor.submit(_run_job, job_id)
    except RuntimeError:
        with _lock:
            _scheduled_jobs.discard(job_id)
        return False
    return True


def shutdown_ingestion_runner() -> None:
    _executor.shutdown(wait=False, cancel_futures=False)


def _run_job(job_id: str) -> None:
    try:
        with SessionLocal() as db:
            job = db.get(IngestionJob, job_id)
            if not job or job.status not in {"queued", "running"}:
                return
            source = db.get(ExternalSource, job.source_id)
            if not source or source.archived:
                job.status = "failed"
                job.error_message = "Source is missing or archived."
                db.commit()
                return
            with HeadlessNewsSearcher() as searcher:
                run_ingestion(db, source, trigger_type=job.trigger_type, job=job, searcher=searcher)
    finally:
        with _lock:
            _scheduled_jobs.discard(job_id)
