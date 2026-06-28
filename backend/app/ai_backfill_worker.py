from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

import psutil
from sqlalchemy import exists, select, update
from sqlalchemy.orm import aliased

from app.ai_pipeline import PROMPT_VERSION
from app.config import get_settings
from app.database import SessionLocal
from app.models import AIAnalysisJob, AISuggestion, AIWorkerHeartbeat


def update_heartbeat(
    worker_id: str,
    slot: int,
    status: str,
    *,
    completed: int,
    failed: int,
    message: str | None = None,
    current_job_id: str | None = None,
    cpu_percent: float | None = None,
    available_memory_gb: float | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        worker = db.get(AIWorkerHeartbeat, worker_id)
        if worker is None:
            worker = AIWorkerHeartbeat(
                worker_id=worker_id,
                worker_name=f"AI Worker {slot}",
                slot=slot,
                process_id=os.getpid(),
                host_name=socket.gethostname(),
                started_at=now,
            )
            db.add(worker)
        worker.status = status
        worker.current_job_id = current_job_id
        worker.completed_count = completed
        worker.failed_count = failed
        worker.cpu_percent = cpu_percent
        worker.available_memory_gb = available_memory_gb
        worker.status_message = message
        worker.heartbeat_at = now
        db.commit()


def reconcile_completed_jobs() -> int:
    settings = get_settings()
    with SessionLocal() as db:
        matching_suggestion = (
            select(AISuggestion.id)
            .where(
                AISuggestion.normalized_item_id == AIAnalysisJob.normalized_item_id,
                AISuggestion.provider == settings.ai_provider,
                AISuggestion.model_name == settings.ai_model,
                AISuggestion.prompt_version == PROMPT_VERSION,
            )
            .order_by(AISuggestion.created_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        result = db.execute(
            update(AIAnalysisJob)
            .where(
                AIAnalysisJob.status.in_(["queued", "dispatched", "running"]),
                matching_suggestion.is_not(None),
            )
            .values(
                status="success",
                suggestion_id=matching_suggestion,
                error_message="Skipped because this prompt version was already processed.",
                finished_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        return int(result.rowcount or 0)


def claim_next_job() -> str | None:
    settings = get_settings()
    with SessionLocal() as db:
        sibling = aliased(AIAnalysisJob)
        already_processed = exists(
            select(AISuggestion.id).where(
                AISuggestion.normalized_item_id == AIAnalysisJob.normalized_item_id,
                AISuggestion.provider == settings.ai_provider,
                AISuggestion.model_name == settings.ai_model,
                AISuggestion.prompt_version == PROMPT_VERSION,
            )
        )
        active_sibling = exists(
            select(sibling.id)
            .where(
                sibling.normalized_item_id == AIAnalysisJob.normalized_item_id,
                sibling.id != AIAnalysisJob.id,
                sibling.status.in_(["dispatched", "running"]),
            )
        )
        statement = (
            select(AIAnalysisJob)
            .where(
                AIAnalysisJob.status == "queued",
                ~already_processed,
                ~active_sibling,
            )
            .order_by(AIAnalysisJob.created_at)
            .limit(1)
        )
        if db.get_bind().dialect.name == "postgresql":
            statement = statement.with_for_update(skip_locked=True)
        job = db.scalar(statement)
        if job is None:
            return None
        job.status = "dispatched"
        db.commit()
        return job.id


def process_job(job_id: str) -> bool:
    settings = get_settings()
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    process = subprocess.Popen(
        [sys.executable, "-m", "app.ai_job_worker", job_id],
        cwd=os.path.dirname(os.path.dirname(__file__)),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creation_flags,
    )
    try:
        exit_code = process.wait(timeout=settings.ai_job_timeout_seconds)
    except subprocess.TimeoutExpired:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)
        with SessionLocal() as db:
            job = db.get(AIAnalysisJob, job_id)
            if job and job.status in {"queued", "dispatched", "running"}:
                prior_error = job.error_message or ""
                if "automatic timeout retry 1" not in prior_error.lower():
                    job.status = "queued"
                    job.started_at = None
                    job.finished_at = None
                    job.created_at = datetime.now(timezone.utc)
                    job.error_message = (
                        f"Automatic timeout retry 1: analysis exceeded "
                        f"{settings.ai_job_timeout_seconds} seconds."
                    )
                else:
                    job.status = "failed"
                    job.error_message = (
                        f"AI analysis exceeded {settings.ai_job_timeout_seconds} "
                        "seconds twice and was stopped."
                    )
                    job.finished_at = datetime.now(timezone.utc)
                db.commit()
        return False
    return exit_code == 0


def resource_ready(slot: int) -> tuple[bool, str, float, float]:
    settings = get_settings()
    if not settings.ai_adaptive_workers:
        memory = psutil.virtual_memory()
        return (
            True,
            "adaptive throttling disabled",
            psutil.cpu_percent(interval=0.5),
            memory.available / (1024**3),
        )

    memory = psutil.virtual_memory()
    available_gb = memory.available / (1024**3)
    cpu_percent = psutil.cpu_percent(interval=0.5)
    min_memory = (
        settings.ai_worker_min_free_memory_gb
        + max(0, slot - 1) * settings.ai_aux_worker_memory_step_gb
    )
    max_cpu = max(
        55.0,
        settings.ai_worker_max_cpu_percent - max(0, slot - 1) * 10.0,
    )
    if memory.percent >= 94:
        return False, f"RAM usage {memory.percent:.1f}% is critical", cpu_percent, available_gb
    if available_gb < min_memory:
        return False, (
            f"{available_gb:.1f} GB RAM available; slot {slot} requires "
            f"{min_memory:.1f} GB"
        ), cpu_percent, available_gb
    if cpu_percent > max_cpu:
        return False, (
            f"CPU usage {cpu_percent:.1f}%; slot {slot} limit is {max_cpu:.1f}%"
        ), cpu_percent, available_gb
    return True, (
        f"CPU {cpu_percent:.1f}%, RAM available {available_gb:.1f} GB"
    ), cpu_percent, available_gb


def wait_for_resources(
    worker_id: str,
    slot: int,
    completed: int,
    failed: int,
) -> tuple[float, float]:
    settings = get_settings()
    last_reason = ""
    while True:
        ready, reason, cpu_percent, available_gb = resource_ready(slot)
        if ready:
            update_heartbeat(
                worker_id,
                slot,
                "ready",
                completed=completed,
                failed=failed,
                message=reason,
                cpu_percent=cpu_percent,
                available_memory_gb=available_gb,
            )
            if last_reason:
                print(f"[slot {slot}] resumed: {reason}", flush=True)
            return cpu_percent, available_gb
        update_heartbeat(
            worker_id,
            slot,
            "paused",
            completed=completed,
            failed=failed,
            message=reason,
            cpu_percent=cpu_percent,
            available_memory_gb=available_gb,
        )
        if reason != last_reason:
            print(f"[slot {slot}] paused: {reason}", flush=True)
            last_reason = reason
        time.sleep(settings.ai_resource_check_seconds)


def processing_heartbeat(
    stop_event: threading.Event,
    worker_id: str,
    slot: int,
    completed: int,
    failed: int,
    job_id: str,
) -> None:
    settings = get_settings()
    while not stop_event.wait(settings.ai_resource_check_seconds):
        memory = psutil.virtual_memory()
        update_heartbeat(
            worker_id,
            slot,
            "processing",
            completed=completed,
            failed=failed,
            message="Analyzing queued news item.",
            current_job_id=job_id,
            cpu_percent=psutil.cpu_percent(interval=0.5),
            available_memory_gb=memory.available / (1024**3),
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Adaptive GeoAtlas AI backfill worker")
    parser.add_argument("--slot", type=int, default=1)
    args = parser.parse_args()
    slot = max(1, args.slot)
    worker_id = f"{socket.gethostname()}-{os.getpid()}-slot-{slot}"
    settings = get_settings()
    completed = 0
    failed = 0
    print(
        f"[slot {slot}] Starting adaptive AI backfill with "
        f"{settings.ai_provider}/{settings.ai_model}.",
        flush=True,
    )
    reconciled = reconcile_completed_jobs()
    if reconciled:
        print(
            f"[slot {slot}] skipped {reconciled} jobs whose items were already processed.",
            flush=True,
        )
    update_heartbeat(worker_id, slot, "starting", completed=0, failed=0)
    try:
        while True:
            cpu_percent, available_gb = wait_for_resources(
                worker_id, slot, completed, failed
            )
            job_id = claim_next_job()
            if job_id is None:
                reconciled = reconcile_completed_jobs()
                if reconciled:
                    print(
                        f"[slot {slot}] skipped {reconciled} newly completed "
                        "duplicate jobs.",
                        flush=True,
                    )
                    continue
                update_heartbeat(
                    worker_id,
                    slot,
                    "drained",
                    completed=completed,
                    failed=failed,
                    message="Queue drained.",
                    cpu_percent=cpu_percent,
                    available_memory_gb=available_gb,
                )
                print(
                    f"[slot {slot}] Backfill queue drained. "
                    f"completed={completed} failed={failed}",
                    flush=True,
                )
                return 0
            update_heartbeat(
                worker_id,
                slot,
                "processing",
                completed=completed,
                failed=failed,
                message="Analyzing queued news item.",
                current_job_id=job_id,
                cpu_percent=cpu_percent,
                available_memory_gb=available_gb,
            )
            heartbeat_stop = threading.Event()
            heartbeat_thread = threading.Thread(
                target=processing_heartbeat,
                args=(
                    heartbeat_stop,
                    worker_id,
                    slot,
                    completed,
                    failed,
                    job_id,
                ),
                daemon=True,
            )
            heartbeat_thread.start()
            try:
                if process_job(job_id):
                    completed += 1
                else:
                    failed += 1
            finally:
                heartbeat_stop.set()
                heartbeat_thread.join(timeout=2)
            print(
                f"[slot {slot}] Backfill progress completed={completed} "
                f"failed={failed} last_job={job_id}",
                flush=True,
            )
            time.sleep(settings.ai_backfill_job_pause_seconds)
    finally:
        update_heartbeat(
            worker_id,
            slot,
            "stopped",
            completed=completed,
            failed=failed,
            message="Worker process stopped.",
        )


if __name__ == "__main__":
    raise SystemExit(main())
