from __future__ import annotations

import sys
from datetime import datetime, timezone

from app.ai_pipeline import run_ai_analysis
from app.database import SessionLocal
from app.models import AIAnalysisJob


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    with SessionLocal() as db:
        job = db.get(AIAnalysisJob, sys.argv[1])
        if not job or job.status not in {"queued", "dispatched", "running"}:
            return 0
        try:
            run_ai_analysis(db, job)
            return 0
        except Exception as exc:
            db.rollback()
            job = db.get(AIAnalysisJob, sys.argv[1])
            if job:
                job.status = "failed"
                job.error_message = str(exc)
                job.finished_at = datetime.now(timezone.utc)
                db.commit()
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
