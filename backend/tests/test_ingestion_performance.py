from __future__ import annotations

import os
import threading
import time
import unittest
from unittest.mock import Mock, patch

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Base
from app.feed_utils import FeedError, FetchResult
from app.headless_search import HeadlessSearchResult, _unwrap_bing_url
from app.main import ingest_source
from app.models import ExternalSource, IngestionJob, NormalizedItem
from app.services import _prefetch_articles, check_source_health, run_ingestion


class IngestionPerformanceSettingsTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()

    def test_article_enrichment_is_on_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GEOATLAS_ARTICLE_ENRICHMENT_ENABLED", None)
            get_settings.cache_clear()
            self.assertTrue(get_settings().article_enrichment_enabled)

    def test_ingestion_has_a_bounded_default_batch(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GEOATLAS_INGEST_MAX_NEW_ITEMS", None)
            get_settings.cache_clear()
            self.assertEqual(get_settings().ingest_max_new_items, 25)

    def test_external_geocoding_is_on_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GEOATLAS_EXTERNAL_GEOCODING_ENABLED", None)
            get_settings.cache_clear()
            self.assertTrue(get_settings().external_geocoding_enabled)

    def test_ingestion_uses_one_worker_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GEOATLAS_INGEST_WORKER_COUNT", None)
            get_settings.cache_clear()
            self.assertEqual(get_settings().ingest_worker_count, 1)

    def test_article_fetches_use_bounded_parallelism_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GEOATLAS_ARTICLE_FETCH_WORKERS", None)
            get_settings.cache_clear()
            self.assertEqual(get_settings().article_fetch_workers, 4)

    def test_ingestion_batches_database_work_without_artificial_delay(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GEOATLAS_INGEST_COMMIT_BATCH_SIZE", None)
            os.environ.pop("GEOATLAS_INGEST_ITEM_PAUSE_SECONDS", None)
            get_settings.cache_clear()
            settings = get_settings()
            self.assertEqual(settings.ingest_commit_batch_size, 25)
            self.assertEqual(settings.ingest_item_pause_seconds, 0)

    def test_bing_redirect_is_unwrapped_to_canonical_article(self) -> None:
        self.assertEqual(
            _unwrap_bing_url(
                "https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9uZXdzLzE"
            ),
            "https://example.com/news/1",
        )


class BoundedIngestionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)

    def tearDown(self) -> None:
        get_settings.cache_clear()
        self.engine.dispose()

    def test_article_prefetch_uses_bounded_parallel_workers(self) -> None:
        active = 0
        max_active = 0
        lock = threading.Lock()

        def fetch(url: str) -> str:
            nonlocal active, max_active
            with lock:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.03)
            with lock:
                active -= 1
            return url

        items = [{"url": f"https://example.com/{index}"} for index in range(4)]
        with patch("app.services.extract_article", side_effect=fetch):
            results = _prefetch_articles(items, worker_count=2)

        self.assertEqual(set(results), {item["url"] for item in items})
        self.assertEqual(max_active, 2)

    def test_default_ingest_stores_only_25_new_items(self) -> None:
        items = [
            {
                "id": f"item-{index}",
                "url": f"https://example.com/{index}",
                "title": f"Nigeria: Story {index}",
                "summary": "A short RSS summary.",
                "published_at": None,
                "image_url": None,
                "categories": [],
                "raw": {},
            }
            for index in range(100)
        ]
        parsed = {
            "feed_type": "rss",
            "title": "Example",
            "site_url": "https://example.com",
            "language": "en",
            "items": items,
        }
        fetched = FetchResult(
            url="https://example.com/feed",
            content_type="application/rss+xml",
            body=b"<rss />",
            etag=None,
            last_modified=None,
        )

        with Session(self.engine) as db:
            source = ExternalSource(name="Example", feed_url=fetched.url)
            db.add(source)
            db.commit()
            db.refresh(source)
            settings = get_settings()
            settings.article_enrichment_enabled = False
            settings.ingest_item_pause_seconds = 0

            with (
                patch("app.services.get_settings", return_value=settings),
                patch("app.services.safe_fetch", return_value=fetched),
                patch("app.services.parse_feed_bytes", return_value=parsed),
                patch("app.services.extract_article") as article_fetch,
            ):
                job = run_ingestion(db, source)

            stored = db.scalar(select(func.count()).select_from(NormalizedItem))
            self.assertEqual(job.normalized_count, 25)
            self.assertEqual(stored, 25)
            article_fetch.assert_not_called()

    def test_ingest_request_only_queues_one_job_per_source(self) -> None:
        with Session(self.engine) as db:
            source = ExternalSource(name="Example", feed_url="https://example.com/feed")
            db.add(source)
            db.commit()
            db.refresh(source)

            with patch("app.main.schedule_ingestion", return_value=True) as schedule:
                first = ingest_source(source.id, db)
                second = ingest_source(source.id, db)

            self.assertEqual(first["job"].status, "queued")
            self.assertEqual(second["job"].id, first["job"].id)
            self.assertEqual(db.scalar(select(func.count()).select_from(IngestionJob)), 1)
            schedule.assert_called_once_with(first["job"].id)

    def test_failed_article_fetch_uses_headless_search_result(self) -> None:
        item = {
            "id": "item-1",
            "url": "https://blocked.example/story",
            "title": "South Africa: Inflation update",
            "summary": "RSS summary.",
            "published_at": None,
            "image_url": None,
            "categories": [],
            "raw": {},
        }
        parsed = {
            "feed_type": "rss",
            "title": "Example",
            "site_url": "https://example.com",
            "language": "en",
            "items": [item],
        }
        fetched = FetchResult(
            url="https://example.com/feed",
            content_type="application/rss+xml",
            body=b"<rss />",
            etag=None,
            last_modified=None,
        )

        with Session(self.engine) as db:
            source = ExternalSource(name="Example", feed_url=fetched.url)
            db.add(source)
            db.commit()
            db.refresh(source)
            settings = get_settings()
            settings.ingest_item_pause_seconds = 0
            searcher = Mock()
            searcher.search.return_value = HeadlessSearchResult(
                title="South Africa: Inflation update",
                summary="Search description.",
                body="Rendered search article body with enough detail for location processing.",
                image_url="https://example.com/image.jpg",
                url=item["url"],
            )

            with (
                patch("app.services.get_settings", return_value=settings),
                patch("app.services.safe_fetch", return_value=fetched),
                patch("app.services.parse_feed_bytes", return_value=parsed),
                patch("app.services.extract_article", side_effect=RuntimeError("blocked")),
            ):
                job = run_ingestion(db, source, searcher=searcher)

            stored = db.scalar(select(NormalizedItem))
            self.assertEqual(job.status, "success")
            self.assertEqual(stored.extraction_status, "search_enriched")
            self.assertEqual(stored.body, searcher.search.return_value.body)
            self.assertEqual(stored.image_url, searcher.search.return_value.image_url)
            self.assertEqual(stored.location_hints[0]["country_code"], "ZA")

    def test_headless_search_failure_falls_back_to_rss(self) -> None:
        item = {
            "id": "item-1",
            "url": "https://blocked.example/story",
            "title": "Nigeria: RSS fallback",
            "summary": "Usable RSS summary remains available.",
            "published_at": None,
            "image_url": None,
            "categories": [],
            "raw": {},
        }
        parsed = {
            "feed_type": "rss",
            "title": "Example",
            "site_url": "https://example.com",
            "language": "en",
            "items": [item],
        }
        fetched = FetchResult(
            url="https://example.com/feed",
            content_type="application/rss+xml",
            body=b"<rss />",
            etag=None,
            last_modified=None,
        )

        with Session(self.engine) as db:
            source = ExternalSource(name="Example", feed_url=fetched.url, status="active", enabled=True)
            db.add(source)
            db.commit()
            db.refresh(source)
            settings = get_settings()
            settings.ingest_item_pause_seconds = 0
            searcher = Mock()
            searcher.search.side_effect = NotImplementedError()

            with (
                patch("app.services.get_settings", return_value=settings),
                patch("app.services.safe_fetch", return_value=fetched),
                patch("app.services.parse_feed_bytes", return_value=parsed),
                patch("app.services.extract_article", side_effect=RuntimeError("blocked")),
            ):
                job = run_ingestion(db, source, searcher=searcher)

            db.refresh(source)
            stored = db.scalar(select(NormalizedItem))
            self.assertEqual(job.status, "success")
            self.assertEqual(stored.body, item["summary"])
            self.assertEqual(stored.extraction_status, "article_fetch_failed")
            self.assertEqual(source.status, "active")

    def test_feed_failure_does_not_hide_source(self) -> None:
        with Session(self.engine) as db:
            source = ExternalSource(name="Example", feed_url="https://example.com/feed", status="active", enabled=True)
            db.add(source)
            db.commit()
            db.refresh(source)

            with patch("app.services.safe_fetch", side_effect=RuntimeError("network down")):
                job = run_ingestion(db, source)

            db.refresh(source)
            self.assertEqual(job.status, "failed")
            self.assertEqual(source.status, "active")
            self.assertTrue(source.enabled)

    def test_non_feed_health_failure_marks_source_as_url(self) -> None:
        with Session(self.engine) as db:
            source = ExternalSource(name="Web page", feed_url="https://example.com", status="unchecked")
            db.add(source)
            db.commit()
            db.refresh(source)
            fetched = FetchResult(
                url=source.feed_url,
                content_type="text/html",
                body=b"<html></html>",
                etag=None,
                last_modified=None,
            )

            with (
                patch("app.services.safe_fetch", return_value=fetched),
                patch(
                    "app.services.parse_feed_bytes",
                    side_effect=FeedError("The URL did not return parseable RSS or Atom XML."),
                ),
            ):
                checked, working, _ = check_source_health(db, source)

            self.assertFalse(working)
            self.assertEqual(checked.connector_type, "url")
            self.assertEqual(checked.status, "url")
            self.assertFalse(checked.enabled)

    def test_health_falls_back_to_url_scrape_when_rss_fails(self) -> None:
        with Session(self.engine) as db:
            source = ExternalSource(name="Web page", feed_url="https://example.com", status="unchecked")
            db.add(source)
            db.commit()
            db.refresh(source)
            searcher = Mock()
            searcher.scrape_source.return_value = [
                HeadlessSearchResult(
                    title="Nigeria: Scrape probe",
                    body="A rendered article confirms that URL scraping is available.",
                    url="https://example.com/news/story",
                )
            ]

            with patch(
                "app.services.safe_fetch",
                side_effect=FeedError("The URL did not return parseable RSS or Atom XML."),
            ):
                checked, working, message = check_source_health(db, source, searcher=searcher)

            self.assertTrue(working)
            self.assertEqual(checked.connector_type, "url")
            self.assertEqual(checked.status, "url")
            self.assertTrue(checked.enabled)
            self.assertIn("URL scraping ok", message)
            searcher.scrape_source.assert_called_once_with(source.feed_url, 1)

    def test_health_marks_failing_when_rss_and_url_scraping_fail(self) -> None:
        with Session(self.engine) as db:
            source = ExternalSource(
                name="Unavailable page",
                feed_url="https://example.com",
                connector_type="url",
                status="url",
                enabled=True,
            )
            db.add(source)
            db.commit()
            db.refresh(source)
            searcher = Mock()
            searcher.scrape_source.return_value = []

            with patch("app.services.safe_fetch", side_effect=FeedError("Source returned HTTP 403.")):
                checked, working, _ = check_source_health(db, source, searcher=searcher)

            self.assertFalse(working)
            self.assertEqual(checked.connector_type, "url")
            self.assertEqual(checked.status, "failing")
            self.assertFalse(checked.enabled)

    def test_url_source_scrape_stores_normalized_articles(self) -> None:
        with Session(self.engine) as db:
            source = ExternalSource(
                name="Example News",
                feed_url="https://example.com",
                connector_type="url",
                status="url",
                enabled=False,
            )
            db.add(source)
            db.commit()
            db.refresh(source)
            settings = get_settings()
            settings.ingest_item_pause_seconds = 0
            searcher = Mock()
            searcher.scrape_source.return_value = [
                HeadlessSearchResult(
                    title="Nigeria: Major local development",
                    summary="A useful description of the event.",
                    body="Detailed rendered article information from Nigeria for the public output.",
                    image_url="https://example.com/news.jpg",
                    url="https://example.com/news/story",
                    published_at="2026-06-19T10:00:00Z",
                )
            ]

            with patch("app.services.get_settings", return_value=settings):
                job = run_ingestion(db, source, searcher=searcher)

            db.refresh(source)
            stored = db.scalar(select(NormalizedItem))
            self.assertEqual(job.status, "success")
            self.assertEqual(job.normalized_count, 1)
            self.assertEqual(stored.extraction_status, "url_scraped")
            self.assertEqual(stored.image_url, "https://example.com/news.jpg")
            self.assertEqual(stored.location_hints[0]["country_code"], "NG")
            self.assertEqual(source.connector_type, "url")
            self.assertEqual(source.status, "url")
            self.assertTrue(source.enabled)


if __name__ == "__main__":
    unittest.main()
