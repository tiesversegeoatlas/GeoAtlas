from __future__ import annotations

from collections import Counter
from typing import Iterable

from app.models import EventCandidate, ExternalSource


def generate_event_statistics(
    rows: Iterable[tuple[EventCandidate, ExternalSource]],
) -> dict:
    risks: Counter[str] = Counter()
    categories: Counter[str] = Counter()
    countries: Counter[str] = Counter()
    sources: Counter[str] = Counter()
    total = 0
    for event, source in rows:
        total += 1
        risks[event.risk_hint or "unknown"] += 1
        categories.update(event.category_hints or [])
        sources[source.name] += 1
        countries.update(_event_country_codes(event))
    return {
        "total_events": total,
        "risk_hints": dict(risks.most_common()),
        "categories": dict(categories.most_common()),
        "country_codes": dict(countries.most_common()),
        "sources": dict(sources.most_common(20)),
    }


def event_matches_filters(
    event: EventCandidate,
    *,
    risk_hint: str | None = None,
    category: str | None = None,
    country_code: str | None = None,
) -> bool:
    if risk_hint and event.risk_hint.lower() != risk_hint.lower():
        return False
    if category and category.lower() not in {
        value.lower() for value in event.category_hints or []
    }:
        return False
    if country_code and country_code.upper() not in _event_country_codes(event):
        return False
    return True


def _event_country_codes(event: EventCandidate) -> set[str]:
    return {
        str(hint.get("country_code")).upper()
        for hint in event.location_hints or []
        if hint.get("country_code")
    }
