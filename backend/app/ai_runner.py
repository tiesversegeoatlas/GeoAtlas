from __future__ import annotations

import os
import re
import subprocess
import sys
import threading
from datetime import datetime, timezone

from app.config import get_settings
from app.database import SessionLocal
from app.models import AIAnalysisJob

_settings = get_settings()
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(_settings.ai_worker_count)
_processes: dict[str, subprocess.Popen[bytes] | None] = {}
_shutting_down = False


def schedule_ai_analysis(job_id: str) -> bool:
    with _lock:
        if _shutting_down or job_id in _processes:
            return False
        _processes[job_id] = None
    threading.Thread(
        target=_run_job_process,
        args=(job_id,),
        name=f"geoatlas-ai-{job_id[:8]}",
        daemon=True,
    ).start()
    return True


def shutdown_ai_runner() -> None:
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
                _mark_failed(job_id, "The AI runner is shutting down.")
                return
        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        process = subprocess.Popen(
            [sys.executable, "-m", "app.ai_job_worker", job_id],
            cwd=os.path.dirname(os.path.dirname(__file__)),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        )
        with _lock:
            _processes[job_id] = process
        try:
            exit_code = process.wait(timeout=_settings.ai_job_timeout_seconds)
        except subprocess.TimeoutExpired:
            _terminate_process(process)
            _mark_failed(job_id, "AI analysis exceeded the configured timeout.")
            return
        if exit_code != 0:
            _mark_failed(job_id, f"AI worker exited with code {exit_code}.")
    except Exception as exc:
        if process is not None:
            _terminate_process(process)
        _mark_failed(job_id, str(exc))
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


def _mark_failed(job_id: str, message: str) -> None:
    settings = get_settings()
    with SessionLocal() as db:
        job = db.get(AIAnalysisJob, job_id)
        if not job or job.status not in {"queued", "dispatched", "running"}:
            return
        previous_retry = 0
        match = re.match(r"Retry (\d+)/", job.error_message or "")
        if match:
            previous_retry = int(match.group(1))
        if previous_retry < settings.ai_max_retries:
            next_retry = previous_retry + 1
            job.status = "queued"
            job.started_at = None
            job.finished_at = None
            job.error_message = (
                f"Retry {next_retry}/{settings.ai_max_retries} after: {message}"
            )
        else:
            job.status = "failed"
            job.error_message = message
            job.finished_at = datetime.now(timezone.utc)
        db.commit()
