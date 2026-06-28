from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.article_utils import (
    extract_article,
    geocode_location,
    infer_location_candidates,
    sanitize_location_hints,
    source_scope_location_hint,
)
from app.config import get_settings
from app.feed_utils import (
    FeedError,
    article_url_fingerprint,
    discover_feeds_from_html,
    extract_category_hints,
    extract_location_hints,
    item_hash,
    parse_dt,
    parse_feed_bytes,
    safe_fetch,
)
from app.headless_search import HeadlessNewsSearcher
from app.models import AIAnalysisJob, EventCandidate, ExternalSource, IngestionJob, NormalizedItem, NormalizedItemLocation, RawFetchedItem, new_id

NON_FEED_ERRORS = {
    "The URL did not return parseable RSS or Atom XML.",
    "The XML document is not an RSS or Atom feed.",
    "No RSS or Atom feed was found at this URL.",
}
_URL_HEALTH_PROBE_LOCK = threading.Lock()


def is_non_feed_error(error: Exception | str) -> bool:
    return str(error).strip() in NON_FEED_ERRORS


def url_fingerprints(value: str | None) -> set[str]:
    raw = (value or "").strip()
    if not raw:
        return set()
    fingerprints = {raw.rstrip("/").lower()}
    parsed = urlparse(raw)
    if parsed.hostname:
        host = parsed.hostname.lower().removeprefix("www.")
        path = parsed.path.rstrip("/") or "/"
        query = f"?{parsed.query}" if parsed.query else ""
        fingerprints.add(f"{host}{path}{query}")
        fingerprints.add(f"{host}{path}")
        for suffix in ("/feed/atom", "/rss.xml", "/feed.xml", "/feed", "/rss", "/atom"):
            if path.lower().endswith(suffix):
                stripped = path[: -len(suffix)].rstrip("/") or "/"
                fingerprints.add(f"{host}{stripped}")
    else:
        fingerprints.add(raw.removeprefix("https://").removeprefix("http://").removeprefix("www.").rstrip("/").lower())
    return {fingerprint for fingerprint in fingerprints if fingerprint}


def find_duplicate_source(db: Session, urls: list[str | None]) -> ExternalSource | None:
    wanted = set()
    for url in urls:
        wanted.update(url_fingerprints(url))
    if not wanted:
        return None
    sources = db.scalars(select(ExternalSource))
    for source in sources:
        existing = url_fingerprints(source.feed_url) | url_fingerprints(source.site_url)
        if wanted & existing:
            return source
    return None


def detect_source(url: str, fetch_sample_items: bool = True) -> dict:
    warnings: list[str] = []
    fetch = safe_fetch(url)
    candidates: list[dict] = []

    try:
        parsed = parse_feed_bytes(fetch.body, fetch.url)
        candidates.append(_candidate_from_parsed(parsed, fetch.url, fetch_sample_items, warnings))
    except FeedError:
        title, links = discover_feeds_from_html(fetch.body, fetch.url)
        if not links:
            raise FeedError("No RSS or Atom feed was found at this URL.")
        for link in links[:5]:
            try:
                linked_fetch = safe_fetch(link)
                parsed = parse_feed_bytes(linked_fetch.body, linked_fetch.url)
                candidate = _candidate_from_parsed(parsed, linked_fetch.url, fetch_sample_items, [])
                candidate["score"] -= 0.05
                if not candidate.get("title"):
                    candidate["title"] = title
                candidates.append(candidate)
            except FeedError as exc:
                warnings.append(f"Skipped discovered feed {link}: {exc}")

    if not candidates:
        raise FeedError("Feed candidates were discovered, but none could be parsed.")
    candidates.sort(key=lambda item: item["score"], reverse=True)
    return {"input_url": url, "status": "detected", "candidates": candidates, "warnings": warnings}


def _candidate_from_parsed(parsed: dict, feed_url: str, include_items: bool, warnings: list[str]) -> dict:
    items = parsed["items"][:5] if include_items else []
    score = 0.55
    if parsed.get("title"):
        score += 0.1
    if parsed.get("site_url"):
        score += 0.1
    if items:
        score += 0.15
    if any(item.get("published_at") for item in items):
        score += 0.1
    return {
        "feed_url": feed_url,
        "feed_type": parsed["feed_type"],
        "title": parsed.get("title"),
        "site_url": parsed.get("site_url"),
        "language": parsed.get("language"),
        "score": min(round(score, 2), 1.0),
        "latest_items": [
            {"title": item.get("title"), "url": item.get("url"), "published_at": item.get("published_at")}
            for item in items
        ],
        "warnings": warnings,
    }


def create_source(db: Session, payload) -> ExternalSource:
    duplicate = find_duplicate_source(db, [str(payload.feed_url)])
    if duplicate:
        raise FeedError(f"This source already exists as {duplicate.name}.")
    detected = detect_source(str(payload.feed_url), fetch_sample_items=True)
    best = detected["candidates"][0]
    duplicate = find_duplicate_source(db, [str(payload.feed_url), best.get("feed_url"), best.get("site_url")])
    if duplicate:
        raise FeedError(f"This source already exists as {duplicate.name}.")
    source = ExternalSource(
        name=payload.name or best.get("title") or str(payload.feed_url),
        feed_url=best["feed_url"],
        site_url=best.get("site_url"),
        detected_title=best.get("title"),
        detected_feed_type=best.get("feed_type"),
        detected_language=payload.language or best.get("language"),
        fetch_interval_minutes=payload.fetch_interval_minutes,
        reliability_score=payload.reliability_score,
        enabled=payload.enabled,
        category_scope=payload.category_scope,
        country_scope=payload.country_scope,
    )
    db.add(source)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise FeedError("This feed URL already exists as a source.") from exc
    db.refresh(source)
    return source


def bulk_create_sources(db: Session, payloads) -> dict:
    existing_sources = list(db.scalars(select(ExternalSource)))
    fingerprint_index = set()
    for source in existing_sources:
        fingerprint_index.update(url_fingerprints(source.feed_url))
        fingerprint_index.update(url_fingerprints(source.site_url))

    added = 0
    skipped = 0
    failed = 0
    items = []
    for payload in payloads:
        feed_url = str(payload.feed_url)
        fingerprints = url_fingerprints(feed_url)
        if fingerprints & fingerprint_index:
            skipped += 1
            items.append({"feed_url": feed_url, "status": "skipped", "message": "Source URL already exists."})
            continue
        source = ExternalSource(
            name=payload.name or feed_url,
            feed_url=feed_url,
            fetch_interval_minutes=payload.fetch_interval_minutes,
            reliability_score=payload.reliability_score,
            enabled=False,
            status="unchecked",
            category_scope=payload.category_scope,
            country_scope=payload.country_scope,
            detected_language=payload.language,
        )
        try:
            with db.begin_nested():
                db.add(source)
                db.flush()
            fingerprint_index.update(fingerprints)
            added += 1
            items.append({"feed_url": feed_url, "status": "added", "source_id": source.id})
        except IntegrityError:
            skipped += 1
            items.append({"feed_url": feed_url, "status": "skipped", "message": "Source URL already exists."})
        except Exception as exc:
            failed += 1
            items.append({"feed_url": feed_url, "status": "failed", "message": str(exc)})
    db.commit()
    return {"added": added, "skipped": skipped, "failed": failed, "items": items}


def check_source_health(
    db: Session,
    source: ExternalSource,
    searcher: HeadlessNewsSearcher | None = None,
) -> tuple[ExternalSource, bool, str]:
    try:
        fetched = safe_fetch(source.feed_url)
        parsed = parse_feed_bytes(fetched.body, fetched.url)
        source.connector_type = "rss"
        source.status = "active"
        source.enabled = True
        source.last_error = None
        source.last_success_at = datetime.now(timezone.utc)
        source.etag = fetched.etag
        source.last_modified = fetched.last_modified
        source.detected_feed_type = parsed.get("feed_type")
        source.detected_title = source.detected_title or parsed.get("title")
        source.detected_language = source.detected_language or parsed.get("language")
        source.site_url = source.site_url or parsed.get("site_url")
        message = f"RSS ok: parsed {len(parsed.get('items') or [])} item(s)."
        working = True
    except Exception as rss_error:
        scrape_result = None
        scrape_error = None
        if searcher:
            probe_urls = list(dict.fromkeys(url for url in [source.site_url, source.feed_url] if url))
            with _URL_HEALTH_PROBE_LOCK:
                for probe_url in probe_urls:
                    try:
                        scraped = searcher.scrape_source(
                            probe_url,
                            get_settings().health_url_probe_articles,
                        )
                        if scraped:
                            scrape_result = scraped
                            if probe_url != source.feed_url:
                                source.site_url = probe_url
                            break
                    except Exception as exc:
                        scrape_error = exc
        if scrape_result:
            source.connector_type = "url"
            source.status = "url"
            source.enabled = True
            source.detected_feed_type = "url"
            source.last_error = None
            source.last_success_at = datetime.now(timezone.utc)
            message = (
                f"RSS unavailable ({rss_error}); URL scraping ok: "
                f"found {len(scrape_result)} article(s)."
            )
            working = True
        else:
            if not searcher and is_non_feed_error(rss_error):
                source.connector_type = "url"
                source.status = "url"
            else:
                source.status = "failing"
            source.enabled = False
            source.last_failure_at = datetime.now(timezone.utc)
            source.last_error = str(rss_error)
            message = str(rss_error)
            if scrape_error:
                message += f" URL scraping also failed: {scrape_error}"
            working = False
    db.commit()
    db.refresh(source)
    return source, working, message


def create_ingestion_job(db: Session, source: ExternalSource, trigger_type: str = "manual") -> IngestionJob:
    job = IngestionJob(source_id=source.id, trigger_type=trigger_type, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def run_ingestion(
    db: Session,
    source: ExternalSource,
    trigger_type: str = "manual",
    job: IngestionJob | None = None,
    searcher: HeadlessNewsSearcher | None = None,
) -> IngestionJob:
    settings = get_settings()
    if job is None:
        job = IngestionJob(source_id=source.id, trigger_type=trigger_type)
        db.add(job)
    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    job_id = job.id
    source_id = source.id

    try:
        if source.connector_type == "url":
            if not searcher:
                raise FeedError("URL scraping requires the headless browser worker.")
            scraped = searcher.scrape_source(source.feed_url, settings.url_scrape_max_articles)
            _store_url_scrape_results(db, source, job, scraped)
            job.status = "success"
            source.status = "url"
            source.enabled = True
            source.last_error = None
            source.last_success_at = datetime.now(timezone.utc)
            return job

        fetched = safe_fetch(source.feed_url, source.etag, source.last_modified)
        if fetched.body == b"":
            job.status = "success"
            job.finished_at = datetime.now(timezone.utc)
            source.last_success_at = job.finished_at
            db.commit()
            db.refresh(job)
            return job
        parsed = parse_feed_bytes(fetched.body, fetched.url)
        source.etag = fetched.etag
        source.last_modified = fetched.last_modified
        source.detected_title = source.detected_title or parsed.get("title")
        source.detected_feed_type = parsed.get("feed_type")
        source.detected_language = source.detected_language or parsed.get("language")
        source.site_url = source.site_url or parsed.get("site_url")

        feed_items = parsed["items"]
        content_hashes = [item_hash(item) for item in feed_items]
        existing_article_urls = _existing_article_urls(db, feed_items)
        existing_hashes = set(
            db.scalars(
                select(RawFetchedItem.content_hash).where(
                    RawFetchedItem.source_id == source.id,
                    RawFetchedItem.content_hash.in_(content_hashes),
                )
            )
        ) if content_hashes else set()
        pending_items = []
        pending_article_urls = set(existing_article_urls)
        for item, content_hash in zip(feed_items, content_hashes):
            job.fetched_count += 1
            article_url = article_url_fingerprint(item.get("url"))
            if content_hash in existing_hashes or (
                article_url and article_url in pending_article_urls
            ):
                job.duplicate_raw_count += 1
                continue
            if len(pending_items) >= settings.ingest_max_new_items:
                break
            pending_items.append((item, content_hash))
            if article_url:
                pending_article_urls.add(article_url)

        enrich_article_pages = (
            settings.article_enrichment_enabled
            and trigger_type != "scheduled"
        )
        prefetched_articles = (
            _prefetch_articles(
                [item for item, _ in pending_items],
                settings.article_fetch_workers,
            )
            if enrich_article_pages
            else {}
        )

        headless_searches_used = 0
        headless_search_limit = (
            settings.scheduled_headless_search_max_items
            if trigger_type == "scheduled"
            else settings.headless_search_max_items_per_job
        )
        for new_items_processed, (item, content_hash) in enumerate(pending_items, start=1):
            raw_id = new_id()
            raw = RawFetchedItem(
                id=raw_id,
                source_id=source.id,
                job_id=job.id,
                source_item_id=item.get("id"),
                source_url=article_url_fingerprint(item.get("url")) or item.get("url"),
                title=item.get("title"),
                raw_payload=_jsonable_item(item),
                content_hash=content_hash,
                published_at=item.get("published_at"),
            )
            db.add(raw)
            db.flush()

            title = item.get("title") or "Untitled feed item"
            summary = item.get("summary")
            body = summary
            image_url = item.get("image_url")
            published_at = item.get("published_at")
            location_text = None
            extraction_status = "rss_only"
            if enrich_article_pages and item.get("url"):
                searched = None
                article = prefetched_articles.get(item["url"])
                if article is not None:
                    title = article.title or title
                    summary = article.summary or summary
                    body = article.body or body
                    image_url = article.image_url or image_url
                    published_at = article.published_at or published_at
                    extraction_status = "article_enriched"
                else:
                    extraction_status = "article_fetch_failed"
                needs_search = extraction_status == "article_fetch_failed" or not image_url or len(body or "") < 120
                if (
                    searcher
                    and needs_search
                    and headless_searches_used < headless_search_limit
                ):
                    headless_searches_used += 1
                    try:
                        searched = searcher.search(title, item.get("url"))
                    except Exception:
                        searched = None
                if searched:
                    title = searched.title or title
                    summary = searched.summary or summary
                    body = searched.body or body
                    image_url = searched.image_url or image_url
                    location_text = searched.location_text
                    extraction_status = (
                        "search_enriched"
                        if extraction_status == "article_fetch_failed"
                        else "article_search_enriched"
                    )
            article_text = " ".join(part for part in [title, location_text or "", body or summary or ""] if part)
            category_hints = list(dict.fromkeys((item.get("categories") or []) + extract_category_hints(article_text)))
            location_hints = _merge_location_hints(
                extract_location_hints(article_text),
                (
                    [{
                        "name": location_text,
                        "confidence": 0.96,
                        "method": "article_dateline",
                        "evidence": location_text,
                    }]
                    if location_text
                    else []
                ),
                infer_location_candidates(
                    title,
                    f"{location_text} -- {body or summary or ''}" if location_text else body,
                ),
            )
            location_hints = sanitize_location_hints(location_hints)
            if not location_hints:
                scope_hint = source_scope_location_hint(source.country_scope)
                location_hints = [scope_hint] if scope_hint else []
            normalized_id = new_id()
            normalized = NormalizedItem(
                id=normalized_id,
                raw_item_id=raw_id,
                source_id=source.id,
                canonical_url=article_url_fingerprint(item.get("url")) or item.get("url"),
                title=title,
                summary=summary,
                body=body,
                language=source.detected_language,
                image_url=image_url,
                published_at=published_at,
                category_hints=category_hints,
                location_hints=location_hints,
                extraction_status=extraction_status,
            )
            db.add(normalized)
            db.flush()
            _store_best_location(db, normalized, location_hints)
            job.normalized_count += 1

            candidate = EventCandidate(
                normalized_item_id=normalized_id,
                source_id=source.id,
                title=title,
                summary=summary,
                category_hints=category_hints,
                location_hints=location_hints,
                risk_hint=_risk_hint(category_hints),
            )
            db.add(candidate)
            _queue_ai_analysis(db, normalized_id, settings)
            job.event_candidate_count += 1
            if new_items_processed % settings.ingest_commit_batch_size == 0:
                db.commit()
                db.refresh(job)
            if settings.ingest_item_pause_seconds:
                time.sleep(settings.ingest_item_pause_seconds)

        job.status = "success"
        source.status = "active"
        source.last_error = None
        source.last_success_at = datetime.now(timezone.utc)
    except Exception as exc:
        db.rollback()
        job = db.get(IngestionJob, job_id)
        source = db.get(ExternalSource, source_id)
        if job is None or source is None:
            raise
        job.status = "failed"
        job.error_message = str(exc)
        source.last_error = str(exc)
        source.last_failure_at = datetime.now(timezone.utc)
    finally:
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
    return job


def _store_url_scrape_results(
    db: Session,
    source: ExternalSource,
    job: IngestionJob,
    scraped: list,
) -> None:
    settings = get_settings()
    items = [
        {
            "id": result.url,
            "url": result.url,
            "title": result.title,
            "summary": result.summary,
            "body": result.body,
            "image_url": result.image_url,
            "published_at": parse_dt(result.published_at),
            "location_text": result.location_text,
            "categories": [],
            "raw": {"scrape_method": "headless_url"},
        }
        for result in scraped
        if result.url and result.title
    ]
    job.fetched_count = len(items)
    hashes = [item_hash(item) for item in items]
    existing_article_urls = _existing_article_urls(db, items)
    existing_hashes = set(
        db.scalars(
            select(RawFetchedItem.content_hash).where(
                RawFetchedItem.source_id == source.id,
                RawFetchedItem.content_hash.in_(hashes),
            )
        )
    ) if hashes else set()

    processed = 0
    pending_article_urls = set(existing_article_urls)
    for item, content_hash in zip(items, hashes):
        article_url = article_url_fingerprint(item.get("url"))
        if content_hash in existing_hashes or (
            article_url and article_url in pending_article_urls
        ):
            job.duplicate_raw_count += 1
            continue
        if article_url:
            pending_article_urls.add(article_url)
        raw_id = new_id()
        raw = RawFetchedItem(
            id=raw_id,
            source_id=source.id,
            job_id=job.id,
            source_item_id=item["id"],
            source_url=article_url or item["url"],
            title=item["title"],
            raw_payload=_jsonable_item(item),
            content_hash=content_hash,
            published_at=item["published_at"],
        )
        db.add(raw)

        article_text = " ".join(
            part
            for part in [item["title"], item["location_text"] or "", item["body"] or item["summary"] or ""]
            if part
        )
        category_hints = extract_category_hints(article_text)
        location_hints = sanitize_location_hints(
            _merge_location_hints(
                extract_location_hints(article_text),
                (
                    [{
                        "name": item["location_text"],
                        "confidence": 0.96,
                        "method": "article_dateline",
                        "evidence": item["location_text"],
                    }]
                    if item["location_text"]
                    else []
                ),
                infer_location_candidates(
                    item["title"],
                    (
                        f"{item['location_text']} -- {item['body'] or item['summary'] or ''}"
                        if item["location_text"]
                        else item["body"] or item["summary"]
                    ),
                ),
            )
        )
        if not location_hints:
            scope_hint = source_scope_location_hint(source.country_scope)
            location_hints = [scope_hint] if scope_hint else []
        normalized_id = new_id()
        normalized = NormalizedItem(
            id=normalized_id,
            raw_item_id=raw_id,
            source_id=source.id,
            canonical_url=article_url or item["url"],
            title=item["title"],
            summary=item["summary"],
            body=item["body"] or item["summary"],
            language=source.detected_language,
            image_url=item["image_url"],
            published_at=item["published_at"],
            category_hints=category_hints,
            location_hints=location_hints,
            extraction_status="url_scraped",
        )
        db.add(normalized)
        _store_best_location(db, normalized, location_hints)
        db.add(
            EventCandidate(
                normalized_item_id=normalized_id,
                source_id=source.id,
                title=normalized.title,
                summary=normalized.summary,
                category_hints=category_hints,
                location_hints=location_hints,
                risk_hint=_risk_hint(category_hints),
            )
        )
        _queue_ai_analysis(db, normalized_id, settings)
        job.normalized_count += 1
        job.event_candidate_count += 1
        processed += 1
        if processed % settings.ingest_commit_batch_size == 0:
            db.commit()
            db.refresh(job)
        if settings.ingest_item_pause_seconds:
            time.sleep(settings.ingest_item_pause_seconds)


def _risk_hint(categories: list[str]) -> str:
    if "conflict" in categories or "cyber" in categories:
        return "medium"
    if "natural_disaster" in categories:
        return "medium"
    return "unknown"


def _queue_ai_analysis(db: Session, normalized_item_id: str, settings) -> None:
    if not settings.ai_enabled or not settings.ai_auto_analyze:
        return
    db.add(
        AIAnalysisJob(
            normalized_item_id=normalized_item_id,
            status="queued",
            provider=settings.ai_provider,
            model_name=(
                "geoatlas-rules-v1"
                if settings.ai_provider == "heuristic"
                else settings.ai_model
            ),
        )
    )


def _prefetch_articles(items: list[dict], worker_count: int) -> dict[str, object]:
    urls = list(dict.fromkeys(item.get("url") for item in items if item.get("url")))
    if not urls:
        return {}
    articles = {}
    with ThreadPoolExecutor(
        max_workers=min(worker_count, len(urls)),
        thread_name_prefix="geoatlas-article",
    ) as executor:
        futures = {executor.submit(extract_article, url): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                articles[url] = future.result()
            except Exception:
                articles[url] = None
    return articles


def _existing_article_urls(db: Session, items: list[dict]) -> set[str]:
    incoming_urls = {
        fingerprint
        for item in items
        if (fingerprint := article_url_fingerprint(item.get("url")))
    }
    if not incoming_urls:
        return set()
    candidate_urls = incoming_urls | {f"{url}/" for url in incoming_urls if not url.endswith("/")}
    normalized_candidates = {url.lower() for url in candidate_urls}
    canonical_conditions = []
    raw_conditions = []
    for url in normalized_candidates:
        canonical = func.lower(NormalizedItem.canonical_url)
        raw = func.lower(RawFetchedItem.source_url)
        canonical_conditions.extend(
            [canonical == url, canonical.like(f"{url}?%"), canonical.like(f"{url}#%")]
        )
        raw_conditions.extend(
            [raw == url, raw.like(f"{url}?%"), raw.like(f"{url}#%")]
        )
    stored_urls = set(
        db.scalars(
            select(NormalizedItem.canonical_url).where(
                or_(*canonical_conditions)
            )
        )
    )
    stored_urls.update(
        db.scalars(
            select(RawFetchedItem.source_url).where(
                or_(*raw_conditions)
            )
        )
    )
    return {
        fingerprint
        for value in stored_urls
        if (fingerprint := article_url_fingerprint(value))
    }


def _merge_location_hints(*groups: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for group in groups:
        for hint in group:
            name = str(hint.get("name") or "").strip()
            if not name:
                continue
            key = name.lower()
            current = merged.get(key)
            confidence = float(hint.get("confidence") or 0.5)
            if not current or confidence > float(current.get("confidence") or 0):
                merged[key] = {**hint, "name": name, "confidence": round(confidence, 3)}
    return sorted(merged.values(), key=lambda hint: float(hint.get("confidence") or 0), reverse=True)[:8]


def _store_best_location(db: Session, item: NormalizedItem, hints: list[dict]) -> None:
    if not hints:
        return
    best = dict(hints[0])
    settings = get_settings()
    if (
        settings.external_geocoding_enabled
        and (best.get("latitude") is None or best.get("longitude") is None)
    ):
        try:
            geocoded = geocode_location(best["name"])
        except FeedError:
            geocoded = None
        if geocoded:
            best.update(geocoded)
            hints[0].update(geocoded)
            flag_modified(item, "location_hints")
    if best.get("latitude") is None or best.get("longitude") is None:
        return
    location = NormalizedItemLocation(
        normalized_item_id=item.id,
        name=best["name"],
        country_code=best.get("country_code"),
        latitude=best.get("latitude"),
        longitude=best.get("longitude"),
        confidence=best.get("confidence"),
    )
    db.add(location)
    db.flush()
    if (
        best.get("latitude") is not None
        and best.get("longitude") is not None
        and db.bind is not None
        and db.bind.dialect.name == "postgresql"
    ):
        db.execute(
            text(
                "update normalized_item_locations "
                "set geog = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography "
                "where id = :location_id"
            ),
            {
                "longitude": best["longitude"],
                "latitude": best["latitude"],
                "location_id": location.id,
            },
        )


def _jsonable_item(item: dict) -> dict:
    clean = dict(item)
    published_at = clean.get("published_at")
    if published_at is not None:
        clean["published_at"] = published_at.isoformat()
    return clean
