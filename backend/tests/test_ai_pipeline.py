from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.ai_pipeline import (
    PROMPT_VERSION,
    analyze_text,
    heuristic_analysis,
    _provider_analysis,
    refresh_source_ai_credibility,
    run_ai_analysis,
)
from app.ai_scheduler import dispatch_ai_jobs_once
from app.article_utils import infer_location_candidates
from app.config import get_settings
from app.database import Base
from app.models import (
    AIAnalysisJob,
    AISuggestion,
    ExternalSource,
    IngestionJob,
    NormalizedItem,
    RawFetchedItem,
)
from fastapi import HTTPException

from app.main import _ai_progress, _item_rank_score, _public_item, _source_credibility_score, public_item, public_items


class AIHeuristicTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()

    def test_conflict_and_casualty_language_produces_high_risk(self) -> None:
        result = heuristic_analysis(
            title="Missile attack kills civilians near border",
            text="Military shelling injured residents and damaged critical infrastructure.",
            source_reliability=0.9,
        )

        self.assertIn("armed_conflict", result.categories)
        self.assertGreaterEqual(result.risk_score, 70)
        self.assertIn(result.risk_level, {"high", "critical"})
        self.assertGreater(result.confidence, 0.7)

    def test_country_demonym_provides_highlightable_country_scope(self) -> None:
        locations = infer_location_candidates(
            "Japanese scholar remembered for wartime rescue efforts",
            "A book review examines his work.",
        )

        self.assertEqual(locations[0]["name"], "Japan")
        self.assertEqual(locations[0]["country_code"], "JP")

    def test_provider_failure_falls_back_to_rules(self) -> None:
        settings = get_settings()
        settings.ai_enabled = True
        settings.ai_api_key = "test-key"
        settings.ai_fallback_on_error = True
        with (
            patch("app.ai_pipeline.get_settings", return_value=settings),
            patch("app.ai_pipeline._provider_analysis", side_effect=TimeoutError),
        ):
            result, provider, model = analyze_text(
                text="A ransomware attack disrupted a hospital network.",
                title="Hospital ransomware incident",
                source_name="Example",
                source_reliability=0.8,
                category_hints=[],
                location_hints=[],
                provider="gemini",
                model="test-model",
            )

        self.assertEqual(provider, "heuristic")
        self.assertEqual(model, "geoatlas-rules-v1")
        self.assertIn("cyber", result.categories)

    def test_ollama_runs_without_api_key(self) -> None:
        settings = get_settings()
        settings.ai_enabled = True
        settings.ai_api_key = None
        settings.ai_fallback_on_error = False
        payload = heuristic_analysis(
            title="Flood warning issued",
            text="Officials issued a flood warning after sustained rainfall.",
            source_reliability=0.85,
        ).model_dump(mode="json")
        with (
            patch("app.ai_pipeline.get_settings", return_value=settings),
            patch("app.ai_pipeline._provider_analysis", return_value=payload) as provider_call,
        ):
            result, provider, model = analyze_text(
                text="Officials issued a flood warning after sustained rainfall.",
                title="Flood warning issued",
                source_name="Local test",
                source_reliability=0.85,
                category_hints=[],
                location_hints=[],
                provider="ollama",
                model="llama3.1:8b",
            )

        provider_call.assert_called_once()
        self.assertEqual(provider, "ollama")
        self.assertEqual(model, "llama3.1:8b")
        self.assertIn("natural_disaster", result.categories)
        self.assertEqual(len(result.generated_content.split()), 200)

    def test_openai_web_search_uses_responses_api_and_collects_sources(self) -> None:
        settings = get_settings()
        settings.ai_web_search_enabled = True
        settings.ai_web_search_required = True
        settings.ai_api_key = "test-key"
        payload = heuristic_analysis(
            title="Flood warning issued",
            text="Officials issued a flood warning after sustained rainfall.",
            source_reliability=0.85,
        ).model_dump(mode="json")
        response = {
            "output": [
                {
                    "type": "web_search_call",
                    "action": {
                        "type": "search",
                        "sources": [{
                            "title": "Official warning",
                            "url": "https://example.gov/warning",
                        }],
                    },
                },
                {
                    "type": "message",
                    "content": [{
                        "type": "output_text",
                        "text": json.dumps(payload),
                        "annotations": [],
                    }],
                },
            ],
        }
        with (
            patch("app.ai_pipeline.get_settings", return_value=settings),
            patch("app.ai_pipeline._request_json", return_value=response) as request,
        ):
            result = _provider_analysis(
                provider="openai",
                model="gpt-4.1-mini",
                text="Officials issued a flood warning after sustained rainfall.",
                source_name="Example",
                source_reliability=0.85,
            )

        url, request_body = request.call_args.args[:2]
        self.assertTrue(url.endswith("/responses"))
        self.assertEqual(request_body["tools"][0]["type"], "web_search")
        self.assertEqual(request_body["tool_choice"], "required")
        self.assertEqual(
            result["web_sources"],
            [{
                "title": "Official warning",
                "url": "https://example.gov/warning",
            }],
        )

    def test_low_credibility_source_is_ranked_below_stronger_source(self) -> None:
        high_source = ExternalSource(
            name="High credibility",
            feed_url="https://high.example/feed",
            reliability_score=0.9,
            status="active",
            last_success_at=datetime.now(timezone.utc),
        )
        low_source = ExternalSource(
            name="Low credibility",
            feed_url="https://low.example/feed",
            reliability_score=0.25,
            status="active",
            last_success_at=datetime.now(timezone.utc),
        )
        high_item = NormalizedItem(
            raw_item_id="00000000-0000-0000-0000-000000000010",
            source_id="00000000-0000-0000-0000-000000000011",
            title="Credible report",
            published_at=datetime.now(timezone.utc) - timedelta(hours=4),
        )
        low_item = NormalizedItem(
            raw_item_id="00000000-0000-0000-0000-000000000012",
            source_id="00000000-0000-0000-0000-000000000013",
            title="Less credible report",
            published_at=datetime.now(timezone.utc),
        )
        high_item.source = high_source
        low_item.source = low_source

        self.assertGreater(
            _source_credibility_score(high_source),
            _source_credibility_score(low_source),
        )
        self.assertGreater(
            _item_rank_score(high_item, None),
            _item_rank_score(low_item, None),
        )

    def test_assessed_source_score_replaces_editorial_score(self) -> None:
        source = ExternalSource(
            name="AI-ranked source",
            feed_url="https://ranked.example/feed",
            reliability_score=0.8,
            status="active",
            ai_credibility_score=40,
            ai_assessment_count=10,
        )
        score = _source_credibility_score(source)
        self.assertEqual(score, 40)


class AIPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)

    def tearDown(self) -> None:
        get_settings.cache_clear()
        self.engine.dispose()

    def _create_item(self, db: Session) -> NormalizedItem:
        source = ExternalSource(
            name="Reliable source",
            feed_url="https://example.com/feed.xml",
            reliability_score=0.9,
        )
        db.add(source)
        db.flush()
        ingestion_job = IngestionJob(source_id=source.id, status="success")
        db.add(ingestion_job)
        db.flush()
        raw = RawFetchedItem(
            source_id=source.id,
            job_id=ingestion_job.id,
            source_item_id="story-1",
            source_url="https://example.com/story-1",
            title="Earthquake damages city",
            raw_payload={},
            content_hash="a" * 64,
        )
        db.add(raw)
        db.flush()
        item = NormalizedItem(
            raw_item_id=raw.id,
            source_id=source.id,
            title="Earthquake damages city",
            summary="Emergency teams responded after buildings collapsed.",
            category_hints=["earthquake"],
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    def test_analysis_is_cached_and_auditable(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            first_job = AIAnalysisJob(
                normalized_item_id=item.id,
                provider="heuristic",
                model_name="geoatlas-rules-v1",
            )
            db.add(first_job)
            db.commit()
            first = run_ai_analysis(db, first_job)

            second_job = AIAnalysisJob(
                normalized_item_id=item.id,
                provider="heuristic",
                model_name="geoatlas-rules-v1",
            )
            db.add(second_job)
            db.commit()
            second = run_ai_analysis(db, second_job)

            self.assertEqual(first.id, second.id)
            self.assertEqual(
                db.scalar(select(func.count()).select_from(AISuggestion)),
                1,
            )
            self.assertEqual(second_job.status, "success")
            self.assertEqual(second_job.suggestion_id, first.id)
            self.assertEqual(first.status, "pending_review")

    def test_dispatcher_claims_queued_jobs_before_starting_workers(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            job = AIAnalysisJob(
                normalized_item_id=item.id,
                provider="heuristic",
                model_name="geoatlas-rules-v1",
            )
            db.add(job)
            db.commit()
            job_id = job.id

        settings = get_settings()
        settings.ai_scheduler_batch_size = 20
        settings.ai_provider = "heuristic"
        settings.ai_model = "geoatlas-rules-v1"
        local_sessions = sessionmaker(bind=self.engine)
        with (
            patch("app.ai_scheduler.SessionLocal", local_sessions),
            patch("app.ai_scheduler.get_settings", return_value=settings),
            patch("app.ai_scheduler.schedule_ai_analysis", return_value=True) as schedule,
        ):
            dispatched = dispatch_ai_jobs_once()

        self.assertEqual(dispatched, [job_id])
        schedule.assert_called_once_with(job_id)
        with Session(self.engine) as db:
            self.assertEqual(db.get(AIAnalysisJob, job_id).status, "dispatched")

    def test_dispatcher_prioritizes_newest_current_provider_job(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            old_other = AIAnalysisJob(
                normalized_item_id=item.id,
                provider="ollama",
                model_name="llama3.1:8b",
                created_at=datetime.now(timezone.utc) - timedelta(days=7),
            )
            older_current = AIAnalysisJob(
                normalized_item_id=item.id,
                provider="openai",
                model_name="gpt-4.1-mini",
                created_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
            newest_current = AIAnalysisJob(
                normalized_item_id=item.id,
                provider="openai",
                model_name="gpt-4.1-mini",
                created_at=datetime.now(timezone.utc),
            )
            db.add_all([old_other, older_current, newest_current])
            db.commit()
            newest_id = newest_current.id
            old_other_id = old_other.id

        settings = get_settings()
        settings.ai_provider = "openai"
        settings.ai_model = "gpt-4.1-mini"
        settings.ai_scheduler_batch_size = 1
        local_sessions = sessionmaker(bind=self.engine)
        with (
            patch("app.ai_scheduler.SessionLocal", local_sessions),
            patch("app.ai_scheduler.get_settings", return_value=settings),
            patch("app.ai_scheduler.schedule_ai_analysis", return_value=True),
        ):
            dispatched = dispatch_ai_jobs_once()

        self.assertEqual(dispatched, [newest_id])
        with Session(self.engine) as db:
            self.assertEqual(db.get(AIAnalysisJob, old_other_id).status, "queued")

    def test_ai_progress_reports_current_prompt_coverage(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            db.add(
                AISuggestion(
                    normalized_item_id=item.id,
                    provider="ollama",
                    model_name="llama3.1:8b",
                    prompt_version=PROMPT_VERSION,
                    input_hash="c" * 64,
                    confidence=0.8,
                    output_payload={"summary": "Grounded summary"},
                )
            )
            db.add(
                AIAnalysisJob(
                    normalized_item_id=item.id,
                    status="success",
                    provider="ollama",
                    model_name="llama3.1:8b",
                )
            )
            db.commit()
            progress = _ai_progress(db)

        self.assertEqual(progress["total_items"], 1)
        self.assertEqual(progress["analyzed_items"], 1)
        self.assertEqual(progress["remaining_items"], 0)
        self.assertEqual(progress["progress_percent"], 100.0)
        self.assertEqual(progress["successful_jobs"], 1)
        self.assertGreaterEqual(progress["worker_capacity"], 1)
        self.assertIsInstance(progress["adaptive_workers"], bool)

    def test_high_confidence_ai_fills_only_missing_public_fields(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            item.summary = None
            item.body = None
            item.category_hints = None
            item.location_hints = None
            item.canonical_url = (
                "https://example.com/flood?utm_source=openai&id=42#details"
            )
            db.commit()
            suggestion = AISuggestion(
                normalized_item_id=item.id,
                provider="heuristic",
                model_name="geoatlas-rules-v1",
                prompt_version="test",
                input_hash="b" * 64,
                confidence=0.9,
                output_payload={
                    "summary": (
                        "A concise flood summary. "
                        "([example.com](https://example.com/flood?utm_source=openai))"
                    ),
                    "generated_content": (
                        "A source-grounded flood briefing. "
                        "https://example.com/flood?utm_source=openai"
                    ),
                    "categories": ["natural_disaster"],
                    "location": "Delhi, India",
                    "country_code": "IN",
                    "latitude": 28.6139,
                    "longitude": 77.209,
                    "risk_level": "high",
                    "risk_score": 78,
                    "urgency_score": 74,
                    "importance_score": 80,
                    "is_breaking": True,
                    "breaking_reason": "An urgent flood warning requires immediate attention.",
                    "claim_quality_score": 82,
                },
                status="pending_review",
            )
            db.add(suggestion)
            db.commit()
            db.refresh(item)

            output = _public_item(item, include_body=True, suggestion=suggestion)

            self.assertEqual(output.summary, "A concise flood summary.")
            self.assertEqual(output.body, "A source-grounded flood briefing.")
            self.assertEqual(
                output.canonical_url,
                "https://example.com/flood?id=42",
            )
            self.assertEqual(output.category_hints, ["natural_disaster"])
            self.assertEqual(output.risk_level, "high")
            self.assertEqual(output.importance_score, 80)
            self.assertTrue(output.is_breaking)
            self.assertEqual(
                output.breaking_reason,
                "An urgent flood warning requires immediate attention.",
            )
            self.assertEqual(output.source.credibility_tier, "very_high")
            self.assertEqual(output.locations[0].name, "Delhi, India")
            self.assertNotIn("method", output.location_hints[0])
            self.assertNotIn("evidence", output.location_hints[0])
            self.assertFalse(any(key.startswith("ai_") for key in output.model_dump()))

    def test_medium_confidence_ai_text_and_final_risk_are_applied(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            suggestion = AISuggestion(
                normalized_item_id=item.id,
                provider="ollama",
                model_name="llama3.1:8b",
                prompt_version="test",
                input_hash="c" * 64,
                confidence=0.7,
                output_payload={
                    "summary": "Review summary.",
                    "generated_content": "Review content.",
                    "categories": ["general"],
                    "risk_level": "low",
                    "risk_score": 25,
                    "urgency_score": 20,
                    "importance_score": 20,
                    "is_breaking": True,
                    "breaking_reason": "A newly developing event requires attention.",
                    "claim_quality_score": 65,
                },
                status="pending_review",
            )
            db.add(suggestion)
            db.commit()
            db.refresh(item)

            output = _public_item(item, include_body=True, suggestion=suggestion)

            self.assertEqual(output.summary, "Review summary.")
            self.assertEqual(output.body, "Review content.")
            self.assertEqual(output.risk_score, 25)
            self.assertFalse(output.is_breaking)
            self.assertIsNone(output.breaking_reason)

    def test_medium_confidence_ai_fills_text_but_not_unverified_location(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            item.summary = None
            item.body = None
            item.location_hints = None
            db.commit()
            suggestion = AISuggestion(
                normalized_item_id=item.id,
                provider="ollama",
                model_name="llama3.1:8b",
                prompt_version="test",
                input_hash="e" * 64,
                confidence=0.7,
                output_payload={
                    "summary": "A grounded summary from the available source text.",
                    "generated_content": "A grounded reconstruction limited to the available source text.",
                    "location": "Somewhere",
                    "country": "Unknown",
                    "country_code": None,
                    "latitude": None,
                    "longitude": None,
                },
                status="pending_review",
            )
            db.add(suggestion)
            db.commit()
            db.refresh(item)

            output = _public_item(item, include_body=True, suggestion=suggestion)

            self.assertEqual(output.body, "A grounded reconstruction limited to the available source text.")
            self.assertEqual(output.summary, "A grounded summary from the available source text.")
            self.assertEqual(output.locations, [])

    def test_public_items_require_ai_suggestion_when_auto_analyze_enabled(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)

        settings = get_settings()
        settings.ai_enabled = True
        settings.ai_auto_analyze = True
        local_sessions = sessionmaker(bind=self.engine)
        with (
            patch("app.main.get_settings", return_value=settings),
            patch("app.main.SessionLocal", local_sessions),
        ):
            with Session(self.engine) as db:
                response = public_items(db=db, limit=25, offset=0, include_body=True, deduplicate=False)
                self.assertEqual(response.items, [])
                self.assertEqual(response.total, 0)
                with self.assertRaises(HTTPException) as exc:
                    public_item(item.id, db=db)
                self.assertEqual(exc.exception.status_code, 404)

        with Session(self.engine) as db:
            suggestion = AISuggestion(
                normalized_item_id=item.id,
                provider="heuristic",
                model_name="geoatlas-rules-v1",
                prompt_version="test",
                input_hash="require-ai" * 7 + "x",
                confidence=0.9,
                output_payload={
                    "summary": "AI summary.",
                    "generated_content": "AI generated content.",
                    "risk_level": "high",
                    "risk_score": 80,
                    "urgency_score": 78,
                    "importance_score": 76,
                    "is_breaking": True,
                    "breaking_reason": "Developing high-impact report.",
                    "claim_quality_score": 81,
                },
                status="pending_review",
            )
            db.add(suggestion)
            db.commit()

        with (
            patch("app.main.get_settings", return_value=settings),
            patch("app.main.SessionLocal", local_sessions),
        ):
            with Session(self.engine) as db:
                response = public_items(db=db, limit=25, offset=0, include_body=True, deduplicate=False)
                self.assertEqual(len(response.items), 1)
                self.assertEqual(response.total, 1)
                self.assertEqual(response.items[0].id, item.id)
                self.assertEqual(public_item(item.id, db=db).id, item.id)

    def test_ai_location_overrides_only_source_scope_location_fallback(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            item.summary = None
            item.body = None
            item.location_hints = [{
                "name": "United States",
                "country_code": "US",
                "latitude": 39.8283,
                "longitude": -98.5795,
                "confidence": 0.58,
                "method": "source_scope",
                "evidence": "United States",
            }]
            db.commit()
            suggestion = AISuggestion(
                normalized_item_id=item.id,
                provider="openai",
                model_name="gpt-4.1-nano",
                prompt_version="test",
                input_hash="f" * 64,
                confidence=0.86,
                output_payload={
                    "summary": "A grounded summary from the available source text.",
                    "generated_content": "A grounded reconstruction limited to the available source text.",
                    "location": "Los Angeles, United States",
                    "country": "United States",
                    "country_code": "US",
                    "latitude": 34.0522,
                    "longitude": -118.2437,
                },
                status="pending_review",
            )
            db.add(suggestion)
            db.commit()
            db.refresh(item)

            output = _public_item(item, include_body=True, suggestion=suggestion)

            self.assertEqual(output.locations[0].name, "Los Angeles, United States")

    def test_source_ai_credibility_aggregates_article_assessments(self) -> None:
        with Session(self.engine) as db:
            item = self._create_item(db)
            suggestion = AISuggestion(
                normalized_item_id=item.id,
                provider="ollama",
                model_name="llama3.1:8b",
                prompt_version="test",
                input_hash="d" * 64,
                confidence=0.8,
                output_payload={
                    "claim_quality_score": 90,
                    "confidence": 0.8,
                    "verification_status": "likely",
                    "evidence": ["headline", "source quote"],
                },
                status="pending_review",
            )
            db.add(suggestion)
            db.commit()
            refresh_source_ai_credibility(db, item.source_id)
            db.commit()
            source = db.get(ExternalSource, item.source_id)
            self.assertEqual(source.ai_assessment_count, 1)
            self.assertGreater(source.ai_credibility_score, 70)


if __name__ == "__main__":
    unittest.main()
