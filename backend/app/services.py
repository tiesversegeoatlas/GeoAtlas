from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.article_utils import extract_article, geocode_location, infer_location_candidates, sanitize_location_hints
from app.feed_utils import (
    FeedError,
    discover_feeds_from_html,
    extract_category_hints,
    extract_location_hints,
    item_hash,
    parse_feed_bytes,
    safe_fetch,
)
from app.models import EventCandidate, ExternalSource, IngestionJob, NormalizedItem, NormalizedItemLocation, RawFetchedItem


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


def check_source_health(db: Session, source: ExternalSource) -> tuple[ExternalSource, bool, str]:
    try:
        fetched = safe_fetch(source.feed_url)
        parsed = parse_feed_bytes(fetched.body, fetched.url)
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
    except Exception as exc:
        source.status = "failing"
        source.enabled = False
        source.last_failure_at = datetime.now(timezone.utc)
        source.last_error = str(exc)
        message = str(exc)
        working = False
    db.commit()
    db.refresh(source)
    return source, working, message


def run_ingestion(db: Session, source: ExternalSource, trigger_type: str = "manual") -> IngestionJob:
    job = IngestionJob(source_id=source.id, trigger_type=trigger_type, status="running", started_at=datetime.now(timezone.utc))
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
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

        for item in parsed["items"]:
            job.fetched_count += 1
            content_hash = item_hash(item)
            exists = db.scalar(
                select(RawFetchedItem).where(
                    RawFetchedItem.source_id == source.id,
                    RawFetchedItem.content_hash == content_hash,
                )
            )
            if exists:
                job.duplicate_raw_count += 1
                continue
            raw = RawFetchedItem(
                source_id=source.id,
                job_id=job.id,
                source_item_id=item.get("id"),
                source_url=item.get("url"),
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
            extraction_status = "rss_only"
            if item.get("url"):
                try:
                    article = extract_article(item["url"])
                    title = article.title or title
                    summary = article.summary or summary
                    body = article.body or body
                    image_url = article.image_url
                    published_at = article.published_at or published_at
                    extraction_status = "article_enriched"
                except Exception:
                    extraction_status = "article_fetch_failed"
            article_text = " ".join(part for part in [title, body or summary or ""] if part)
            category_hints = list(dict.fromkeys((item.get("categories") or []) + extract_category_hints(article_text)))
            location_hints = _merge_location_hints(
                extract_location_hints(article_text),
                infer_location_candidates(title, body),
            )
            location_hints = sanitize_location_hints(location_hints)
            normalized = NormalizedItem(
                raw_item_id=raw.id,
                source_id=source.id,
                canonical_url=item.get("url"),
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
                normalized_item_id=normalized.id,
                source_id=source.id,
                title=title,
                summary=summary,
                category_hints=category_hints,
                location_hints=location_hints,
                risk_hint=_risk_hint(category_hints),
            )
            db.add(candidate)
            job.event_candidate_count += 1

        job.status = "success"
        source.status = "active"
        source.last_error = None
        source.last_success_at = datetime.now(timezone.utc)
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        source.status = "failing"
        source.last_error = str(exc)
        source.last_failure_at = datetime.now(timezone.utc)
    finally:
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
    return job


def _risk_hint(categories: list[str]) -> str:
    if "conflict" in categories or "cyber" in categories:
        return "medium"
    if "natural_disaster" in categories:
        return "medium"
    return "unknown"


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
    if best.get("latitude") is None or best.get("longitude") is None:
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
