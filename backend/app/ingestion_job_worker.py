from __future__ import annotations

import sys

from app.database import SessionLocal
from app.headless_search import HeadlessNewsSearcher
from app.models import ExternalSource, IngestionJob
from app.services import run_ingestion


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    job_id = sys.argv[1]
    with SessionLocal() as db:
        job = db.get(IngestionJob, job_id)
        if not job or job.status not in {"queued", "running"}:
            return 0
        source = db.get(ExternalSource, job.source_id)
        if not source or source.archived:
            job.status = "failed"
            job.error_message = "Source is missing or archived."
            db.commit()
            return 1
        with HeadlessNewsSearcher() as searcher:
            run_ingestion(
                db,
                source,
                trigger_type=job.trigger_type,
                job=job,
                searcher=searcher,
            )
        return 0 if job.status == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
