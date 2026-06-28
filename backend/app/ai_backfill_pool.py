from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

from sqlalchemy import func, select

from app.config import get_settings
from app.database import SessionLocal
from app.models import AIAnalysisJob


def queued_jobs() -> int:
    with SessionLocal() as db:
        return int(
            db.scalar(
                select(func.count())
                .select_from(AIAnalysisJob)
                .where(AIAnalysisJob.status == "queued")
            )
            or 0
        )


def start_worker(slot: int, backend_root: Path) -> subprocess.Popen:
    creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "app.ai_backfill_worker",
            "--slot",
            str(slot),
        ],
        cwd=backend_root,
        creationflags=creation_flags,
    )
    print(f"Started AI worker slot {slot} (PID {process.pid}).", flush=True)
    return process


def main() -> int:
    settings = get_settings()
    worker_count = settings.ai_backfill_worker_count
    backend_root = Path(__file__).resolve().parent.parent
    processes: dict[int, subprocess.Popen] = {}
    print(
        f"Starting adaptive AI pool with {worker_count} worker slots. "
        "Auxiliary slots pause automatically under CPU or memory pressure.",
        flush=True,
    )
    try:
        for slot in range(1, worker_count + 1):
            processes[slot] = start_worker(slot, backend_root)
            time.sleep(0.5)

        while processes:
            time.sleep(2)
            remaining = queued_jobs()
            for slot, process in list(processes.items()):
                code = process.poll()
                if code is None:
                    continue
                if remaining:
                    print(
                        f"AI worker slot {slot} exited with code {code}; "
                        f"restarting because {remaining} jobs remain.",
                        flush=True,
                    )
                    time.sleep(1)
                    processes[slot] = start_worker(slot, backend_root)
                else:
                    processes.pop(slot)
        return 0
    except KeyboardInterrupt:
        return 130
    finally:
        for process in processes.values():
            if process.poll() is None:
                process.terminate()
        for process in processes.values():
            if process.poll() is None:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()


if __name__ == "__main__":
    raise SystemExit(main())
