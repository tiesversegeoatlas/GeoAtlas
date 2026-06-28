from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, case, exists, func, or_, select, update

from app.ai_pipeline import PROMPT_VERSION, refresh_source_ai_credibility
from app.config import get_settings
from app.database import SessionLocal
from app.models import AIAnalysisJob, AISuggestion, ExternalSource, NormalizedItem


def queue_missing_ollama_analysis(batch_size: int = 250) -> int:
    settings = get_settings()
    queued = 0
    while True:
        with SessionLocal() as db:
            has_ollama_suggestion = exists(
                select(AISuggestion.id).where(
                    AISuggestion.normalized_item_id == NormalizedItem.id,
                    AISuggestion.provider == settings.ai_provider,
                    AISuggestion.model_name == settings.ai_model,
                    AISuggestion.prompt_version == PROMPT_VERSION,
                )
            )
            has_active_job = exists(
                select(AIAnalysisJob.id).where(
                    AIAnalysisJob.normalized_item_id == NormalizedItem.id,
                    AIAnalysisJob.provider == settings.ai_provider,
                    AIAnalysisJob.model_name == settings.ai_model,
                    AIAnalysisJob.status.in_(["queued", "dispatched", "running"]),
                )
            )
            item_ids = list(
                db.scalars(
                    select(NormalizedItem.id)
                    .where(~has_ollama_suggestion, ~has_active_job)
                    .order_by(NormalizedItem.created_at)
                    .limit(batch_size)
                )
            )
            if not item_ids:
                break
            db.add_all([
                AIAnalysisJob(
                    normalized_item_id=item_id,
                    status="queued",
                    provider=settings.ai_provider,
                    model_name=settings.ai_model,
                )
                for item_id in item_ids
            ])
            db.commit()
            queued += len(item_ids)
            print(f"Queued {queued} missing AI analyses.", flush=True)
    return queued


def rebuild_source_rankings() -> int:
    with SessionLocal() as db:
        source_ids = list(db.scalars(select(ExternalSource.id)))
        for index, source_id in enumerate(source_ids, start=1):
            refresh_source_ai_credibility(db, source_id)
            if index % 100 == 0:
                db.commit()
                print(f"Ranked {index}/{len(source_ids)} sources.", flush=True)
        db.commit()
        return len(source_ids)


def requeue_stale_jobs(stale_minutes: int = 5) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max(0, stale_minutes))
    with SessionLocal() as db:
        result = db.execute(
            update(AIAnalysisJob)
            .where(
                or_(
                    and_(
                        AIAnalysisJob.status == "running",
                        AIAnalysisJob.started_at.is_not(None),
                        AIAnalysisJob.started_at < cutoff,
                    ),
                    and_(
                        AIAnalysisJob.status == "dispatched",
                        AIAnalysisJob.created_at < cutoff,
                    ),
                )
            )
            .values(
                status="queued",
                started_at=None,
                finished_at=None,
                error_message=None,
            )
        )
        db.commit()
        return int(result.rowcount or 0)


def requeue_failed_jobs() -> int:
    with SessionLocal() as db:
        result = db.execute(
            update(AIAnalysisJob)
            .where(AIAnalysisJob.status == "failed")
            .values(
                status="queued",
                started_at=None,
                finished_at=None,
                error_message=None,
            )
        )
        db.commit()
        return int(result.rowcount or 0)


def reconcile_queue() -> dict[str, int]:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    skipped_processed = 0
    superseded = 0
    with SessionLocal() as db:
        suggestions = list(
            db.execute(
                select(
                    AISuggestion.normalized_item_id,
                    AISuggestion.id,
                )
                .where(
                    AISuggestion.provider == settings.ai_provider,
                    AISuggestion.model_name == settings.ai_model,
                    AISuggestion.prompt_version == PROMPT_VERSION,
                )
                .order_by(AISuggestion.created_at.desc())
            )
        )
        suggestion_by_item: dict[str, str] = {}
        for item_id, suggestion_id in suggestions:
            suggestion_by_item.setdefault(item_id, suggestion_id)

        pending = list(
            db.scalars(
                select(AIAnalysisJob)
                .where(
                    AIAnalysisJob.status.in_(["queued", "dispatched", "running"]),
                    AIAnalysisJob.provider == settings.ai_provider,
                    AIAnalysisJob.model_name == settings.ai_model,
                )
                .order_by(
                    AIAnalysisJob.normalized_item_id,
                    case(
                        (AIAnalysisJob.status == "running", 0),
                        (AIAnalysisJob.status == "dispatched", 1),
                        else_=2,
                    ),
                    AIAnalysisJob.created_at,
                )
            )
        )
        retained_items: set[str] = set()
        for job in pending:
            suggestion_id = suggestion_by_item.get(job.normalized_item_id)
            if suggestion_id:
                job.status = "success"
                job.suggestion_id = suggestion_id
                job.error_message = (
                    "Skipped because this prompt version was already processed."
                )
                job.finished_at = now
                skipped_processed += 1
            elif job.normalized_item_id in retained_items:
                job.status = "superseded"
                job.error_message = (
                    "Duplicate pending job removed; another job owns this article."
                )
                job.finished_at = now
                superseded += 1
            else:
                retained_items.add(job.normalized_item_id)
        db.commit()
    return {
        "skipped_processed": skipped_processed,
        "superseded_duplicates": superseded,
    }


def status() -> dict[str, int]:
    with SessionLocal() as db:
        result = {
            "items": int(db.scalar(select(func.count()).select_from(NormalizedItem)) or 0),
            "suggestions": int(db.scalar(select(func.count()).select_from(AISuggestion)) or 0),
            "sources_ranked": int(db.scalar(
                select(func.count()).select_from(ExternalSource).where(
                    ExternalSource.ai_credibility_score.is_not(None)
                )
            ) or 0),
        }
        for job_status in [
            "queued",
            "dispatched",
            "running",
            "success",
            "failed",
            "superseded",
        ]:
            result[job_status] = int(db.scalar(
                select(func.count()).select_from(AIAnalysisJob).where(
                    AIAnalysisJob.status == job_status
                )
            ) or 0)
        return result


def main() -> int:
    parser = argparse.ArgumentParser(description="GeoAtlas one-time Ollama backfill")
    parser.add_argument(
        "action",
        choices=[
            "queue",
            "rank-sources",
            "reconcile",
            "requeue-failed",
            "requeue-stale",
            "status",
        ],
    )
    parser.add_argument("--batch-size", type=int, default=250)
    parser.add_argument("--stale-minutes", type=int, default=5)
    args = parser.parse_args()
    if args.action == "queue":
        print({"queued": queue_missing_ollama_analysis(max(1, args.batch_size))})
    elif args.action == "rank-sources":
        print({"sources_ranked": rebuild_source_rankings()})
    elif args.action == "requeue-stale":
        print({"requeued": requeue_stale_jobs(args.stale_minutes)})
    elif args.action == "requeue-failed":
        print({"requeued": requeue_failed_jobs()})
    elif args.action == "reconcile":
        print(reconcile_queue())
    else:
        print(status())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
