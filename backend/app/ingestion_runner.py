from __future__ import annotations

import os
import subprocess
import sys
import threading

from app.config import get_settings
from app.database import SessionLocal
from app.models import ExternalSource, IngestionJob

_settings = get_settings()
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(_settings.ingest_worker_count)
_processes: dict[str, subprocess.Popen[bytes] | None] = {}
_shutting_down = False


def schedule_ingestion(job_id: str) -> bool:
    global _shutting_down
    with _lock:
        if _shutting_down or job_id in _processes:
            return False
        _processes[job_id] = None
    threading.Thread(
        target=_run_job_process,
        args=(job_id,),
        name=f"geoatlas-ingest-{job_id[:8]}",
        daemon=True,
    ).start()
    return True


def shutdown_ingestion_runner() -> None:
    global _shutting_down
    with _lock:
        _shutting_down = True
        processes = [process for process in _processes.values() if process is not None]
    for process in processes:
        _terminate_process(process)


def _run_job_process(job_id: str) -> None:
    process: subprocess.Popen[bytes] | None = None
    _slots.acquire()
    try:
        with _lock:
            if _shutting_down:
                _mark_job_failed(job_id, "The ingestion runner is shutting down.")
                return
        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        process = subprocess.Popen(
            [sys.executable, "-m", "app.ingestion_job_worker", job_id],
            cwd=os.path.dirname(os.path.dirname(__file__)),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        )
        with _lock:
            _processes[job_id] = process
        try:
            exit_code = process.wait(timeout=_settings.scheduler_job_timeout_seconds)
        except subprocess.TimeoutExpired:
            _terminate_process(process)
            _mark_job_failed(
                job_id,
                "Ingestion exceeded the configured scheduler timeout.",
            )
            return
        if exit_code != 0:
            _mark_job_failed(job_id, f"Ingestion worker exited with code {exit_code}.")
    except Exception as exc:
        if process is not None:
            _terminate_process(process)
        _mark_job_failed(job_id, str(exc))
    finally:
        with _lock:
            _processes.pop(job_id, None)
        _slots.release()


def _terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()


def _mark_job_failed(job_id: str, message: str) -> None:
    from datetime import datetime, timezone

    with SessionLocal() as db:
        job = db.get(IngestionJob, job_id)
        if not job or job.status not in {"queued", "running"}:
            return
        now = datetime.now(timezone.utc)
        job.status = "failed"
        job.error_message = message
        job.finished_at = now
        source = db.get(ExternalSource, job.source_id)
        if source:
            source.last_failure_at = now
            source.last_error = message
        db.commit()
