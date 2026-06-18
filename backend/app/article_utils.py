from __future__ import annotations

import json
import re
import threading
import time
from dataclasses import dataclass
from functools import lru_cache
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

from app.config import get_settings
from app.feed_utils import FeedError, decode_html, parse_dt, safe_fetch, strip_text

_GEOCODER_LOCK = threading.Lock()
_LAST_GEOCODER_REQUEST = 0.0
MONTHS = {
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
}
PLACE_DATA = {
    "africa": ("Africa", None, 1.6508, 17.6791),
    "algeria": ("Algeria", "DZ", 28.0339, 1.6596),
    "angola": ("Angola", "AO", -11.2027, 17.8739),
    "benin": ("Benin", "BJ", 9.3077, 2.3158),
    "botswana": ("Botswana", "BW", -22.3285, 24.6849),
    "burkina faso": ("Burkina Faso", "BF", 12.2383, -1.5616),
    "burundi": ("Burundi", "BI", -3.3731, 29.9189),
    "cabo verde": ("Cabo Verde", "CV", 16.5388, -23.0418),
    "cameroon": ("Cameroon", "CM", 7.3697, 12.3547),
    "central african republic": ("Central African Republic", "CF", 6.6111, 20.9394),
    "chad": ("Chad", "TD", 15.4542, 18.7322),
    "comoros": ("Comoros", "KM", -11.6455, 43.3333),
    "congo": ("Democratic Republic of the Congo", "CD", -4.0383, 21.7587),
    "congo-kinshasa": ("Democratic Republic of the Congo", "CD", -4.0383, 21.7587),
    "democratic republic of congo": ("Democratic Republic of the Congo", "CD", -4.0383, 21.7587),
    "dr congo": ("Democratic Republic of the Congo", "CD", -4.0383, 21.7587),
    "congo-brazzaville": ("Republic of the Congo", "CG", -0.228, 15.8277),
    "djibouti": ("Djibouti", "DJ", 11.8251, 42.5903),
    "egypt": ("Egypt", "EG", 26.8206, 30.8025),
    "equatorial guinea": ("Equatorial Guinea", "GQ", 1.6508, 10.2679),
    "eritrea": ("Eritrea", "ER", 15.1794, 39.7823),
    "eswatini": ("Eswatini", "SZ", -26.5225, 31.4659),
    "ethiopia": ("Ethiopia", "ET", 9.145, 40.4897),
    "gabon": ("Gabon", "GA", -0.8037, 11.6094),
    "gambia": ("Gambia", "GM", 13.4432, -15.3101),
    "ghana": ("Ghana", "GH", 7.9465, -1.0232),
    "guinea": ("Guinea", "GN", 9.9456, -9.6966),
    "guinea-bissau": ("Guinea-Bissau", "GW", 11.8037, -15.1804),
    "ivory coast": ("Cote d'Ivoire", "CI", 7.54, -5.5471),
    "cote d'ivoire": ("Cote d'Ivoire", "CI", 7.54, -5.5471),
    "kenya": ("Kenya", "KE", -0.0236, 37.9062),
    "lesotho": ("Lesotho", "LS", -29.61, 28.2336),
    "liberia": ("Liberia", "LR", 6.4281, -9.4295),
    "libya": ("Libya", "LY", 26.3351, 17.2283),
    "madagascar": ("Madagascar", "MG", -18.7669, 46.8691),
    "malawi": ("Malawi", "MW", -13.2543, 34.3015),
    "mali": ("Mali", "ML", 17.5707, -3.9962),
    "mauritania": ("Mauritania", "MR", 21.0079, -10.9408),
    "mauritius": ("Mauritius", "MU", -20.3484, 57.5522),
    "morocco": ("Morocco", "MA", 31.7917, -7.0926),
    "mozambique": ("Mozambique", "MZ", -18.6657, 35.5296),
    "namibia": ("Namibia", "NA", -22.9576, 18.4904),
    "niger": ("Niger", "NE", 17.6078, 8.0817),
    "nigeria": ("Nigeria", "NG", 9.082, 8.6753),
    "rwanda": ("Rwanda", "RW", -1.9403, 29.8739),
    "senegal": ("Senegal", "SN", 14.4974, -14.4524),
    "seychelles": ("Seychelles", "SC", -4.6796, 55.492),
    "sierra leone": ("Sierra Leone", "SL", 8.4606, -11.7799),
    "somalia": ("Somalia", "SO", 5.1521, 46.1996),
    "south africa": ("South Africa", "ZA", -30.5595, 22.9375),
    "south sudan": ("South Sudan", "SS", 6.877, 31.307),
    "sudan": ("Sudan", "SD", 12.8628, 30.2176),
    "tanzania": ("Tanzania", "TZ", -6.369, 34.8888),
    "togo": ("Togo", "TG", 8.6195, 0.8248),
    "tunisia": ("Tunisia", "TN", 33.8869, 9.5375),
    "uganda": ("Uganda", "UG", 1.3733, 32.2903),
    "zambia": ("Zambia", "ZM", -13.1339, 27.8493),
    "zimbabwe": ("Zimbabwe", "ZW", -19.0154, 29.1549),
    "gaza": ("Gaza", "PS", 31.5017, 34.4668),
    "israel": ("Israel", "IL", 31.0461, 34.8516),
    "iran": ("Iran", "IR", 32.4279, 53.688),
    "india": ("India", "IN", 20.5937, 78.9629),
    "china": ("China", "CN", 35.8617, 104.1954),
    "russia": ("Russia", "RU", 61.524, 105.3188),
    "ukraine": ("Ukraine", "UA", 48.3794, 31.1656),
    "united states": ("United States", "US", 37.0902, -95.7129),
    "united kingdom": ("United Kingdom", "GB", 55.3781, -3.436),
}
KNOWN_PLACES = set(PLACE_DATA)
REJECTED_LOCATION_WORDS = MONTHS | {
    "policy", "legal", "justice", "money", "food", "report", "government",
    "parliament", "province", "project", "education", "global", "chapter",
}


@dataclass
class ArticleContent:
    title: str | None
    body: str | None
    summary: str | None
    image_url: str | None
    published_at: Any


class ArticleParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.meta: dict[str, str] = {}
        self.paragraphs: list[str] = []
        self.json_ld: list[dict] = []
        self._capture_paragraph = False
        self._paragraph_parts: list[str] = []
        self._capture_script = False
        self._script_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {key.lower(): value or "" for key, value in attrs}
        tag = tag.lower()
        if tag == "meta":
            key = (attrs_dict.get("property") or attrs_dict.get("name")).lower()
            content = attrs_dict.get("content", "").strip()
            if key and content:
                self.meta[key] = content
        elif tag == "p":
            self._capture_paragraph = True
            self._paragraph_parts = []
        elif tag == "script" and "ld+json" in attrs_dict.get("type", "").lower():
            self._capture_script = True
            self._script_parts = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "p" and self._capture_paragraph:
            text = strip_text(" ".join(self._paragraph_parts))
            if text and len(text) >= 40:
                self.paragraphs.append(text)
            self._capture_paragraph = False
        elif tag == "script" and self._capture_script:
            raw = "".join(self._script_parts).strip()
            try:
                value = json.loads(raw)
                values = value if isinstance(value, list) else [value]
                self.json_ld.extend(item for item in values if isinstance(item, dict))
            except (json.JSONDecodeError, TypeError):
                pass
            self._capture_script = False

    def handle_data(self, data: str) -> None:
        if self._capture_paragraph:
            self._paragraph_parts.append(data)
        if self._capture_script:
            self._script_parts.append(data)

    def absolute_url(self, value: str | None) -> str | None:
        return urljoin(self.base_url, value) if value else None


def extract_article(url: str) -> ArticleContent:
    fetched = safe_fetch(url)
    parser = ArticleParser(fetched.url)
    parser.feed(decode_html(fetched.body, fetched.content_type))
    article_json = _article_json_ld(parser.json_ld)
    body = strip_text(article_json.get("articleBody")) if article_json else None
    if not body:
        body = "\n\n".join(parser.paragraphs[:80]) or None
    title = (
        (article_json or {}).get("headline")
        or parser.meta.get("og:title")
        or parser.meta.get("twitter:title")
    )
    summary = (
        (article_json or {}).get("description")
        or parser.meta.get("og:description")
        or parser.meta.get("description")
    )
    image = _json_ld_image((article_json or {}).get("image"))
    image_url = parser.absolute_url(
        image
        or parser.meta.get("og:image")
        or parser.meta.get("twitter:image")
    )
    published = (
        (article_json or {}).get("datePublished")
        or parser.meta.get("article:published_time")
        or parser.meta.get("date")
    )
    return ArticleContent(
        title=strip_text(title),
        body=body,
        summary=strip_text(summary),
        image_url=image_url,
        published_at=parse_dt(str(published)) if published else None,
    )


def infer_location_candidates(title: str, body: str | None) -> list[dict[str, Any]]:
    candidates: dict[str, dict[str, Any]] = {}
    prefix = title.split(":", 1)[0].strip() if ":" in title else ""
    if prefix.lower() in KNOWN_PLACES:
        _add_known_place(candidates, prefix, 0.98, "headline_prefix", prefix)

    body_text = body or ""
    dateline = re.search(
        r"^(?:\[[^\]]+\]\s*)?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2},\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})\s*(?:--|—)",
        body_text.strip(),
    )
    if dateline:
        _add_candidate(candidates, dateline.group(1), 0.96, "article_dateline", dateline.group(0))

    combined = f"{title} {body_text}"
    accepted_spans: list[tuple[int, int]] = []
    for place in sorted(KNOWN_PLACES, key=len, reverse=True):
        match = re.search(rf"(?<!\w){re.escape(place)}(?!\w)", combined, re.IGNORECASE)
        if match:
            if any(match.start() < end and match.end() > start for start, end in accepted_spans):
                continue
            accepted_spans.append(match.span())
            confidence = 0.9 if match.start() < len(title) else 0.76
            _add_known_place(candidates, match.group(0), confidence, "known_place", match.group(0))
    ordered = sorted(candidates.values(), key=lambda item: item["confidence"], reverse=True)
    if len(ordered) > 1 and ordered[0]["name"].lower() == "africa":
        ordered = [item for item in ordered if item["name"].lower() != "africa"]
    return ordered[:5]


def sanitize_location_hints(hints: list[dict] | None) -> list[dict]:
    clean = []
    for hint in hints or []:
        name = str(hint.get("name") or "").strip()
        evidence = str(hint.get("evidence") or name).strip()
        original = re.sub(r"^(?:in|near|outside|from|around|across)\s+", "", evidence, flags=re.IGNORECASE)
        words = set(re.findall(r"[a-z]+", original.lower()))
        if not name or words & REJECTED_LOCATION_WORDS:
            continue
        method = hint.get("method")
        if method == "article_text_pattern":
            continue
        if (
            method not in {"headline_prefix", "article_dateline", "known_place"}
            and hint.get("country_code") is None
            and hint.get("latitude") is None
        ):
            continue
        clean.append(hint)
    return clean


def _add_candidate(
    candidates: dict[str, dict[str, Any]],
    name: str,
    confidence: float,
    method: str,
    evidence: str,
) -> None:
    normalized = name.strip(" ,.")
    if len(normalized) < 3:
        return
    key = normalized.lower()
    current = candidates.get(key)
    if not current or confidence > current["confidence"]:
        candidates[key] = {
            "name": normalized,
            "confidence": round(confidence, 3),
            "method": method,
            "evidence": evidence[:240],
        }


def _add_known_place(
    candidates: dict[str, dict[str, Any]],
    name: str,
    confidence: float,
    method: str,
    evidence: str,
) -> None:
    canonical_name, country_code, latitude, longitude = PLACE_DATA[name.lower()]
    key = canonical_name.lower()
    current = candidates.get(key)
    if not current or confidence > current["confidence"]:
        candidates[key] = {
            "name": canonical_name,
            "country_code": country_code,
            "latitude": latitude,
            "longitude": longitude,
            "confidence": round(confidence, 3),
            "method": method,
            "evidence": evidence[:240],
        }


@lru_cache(maxsize=4096)
def geocode_location(name: str) -> dict[str, Any] | None:
    global _LAST_GEOCODER_REQUEST
    settings = get_settings()
    if not settings.geocoder_url:
        return None
    query = urlencode({"q": name, "format": "jsonv2", "limit": 1, "addressdetails": 1})
    request = Request(
        f"{settings.geocoder_url.rstrip('/')}?{query}",
        headers={"User-Agent": settings.user_agent},
    )
    try:
        with _GEOCODER_LOCK:
            delay = settings.geocoder_min_interval_seconds - (time.monotonic() - _LAST_GEOCODER_REQUEST)
            if delay > 0:
                time.sleep(delay)
            with urlopen(request, timeout=settings.geocoder_timeout_seconds) as response:
                results = json.load(response)
            _LAST_GEOCODER_REQUEST = time.monotonic()
    except Exception as exc:
        raise FeedError(f"Could not geocode location: {exc}") from exc
    if not results:
        return None
    result = results[0]
    address = result.get("address") or {}
    result_type = str(result.get("type") or "").lower()
    result_category = str(result.get("category") or result.get("class") or "").lower()
    if result_category in {"amenity", "building", "highway", "shop", "tourism"}:
        return None
    if result_type in {"house", "road", "restaurant", "supermarket", "school"}:
        return None
    return {
        "name": result.get("display_name") or name,
        "country_code": (address.get("country_code") or "").upper() or None,
        "latitude": float(result["lat"]),
        "longitude": float(result["lon"]),
        "geocoder": "nominatim",
    }


def _article_json_ld(values: list[dict]) -> dict:
    for value in values:
        graph = value.get("@graph")
        candidates = graph if isinstance(graph, list) else [value]
        for candidate in candidates:
            types = candidate.get("@type", [])
            types = [types] if isinstance(types, str) else types
            if any(type_ in {"Article", "NewsArticle", "ReportageNewsArticle"} for type_ in types):
                return candidate
    return {}


def _json_ld_image(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, list) and value:
        return _json_ld_image(value[0])
    if isinstance(value, dict):
        return value.get("url") or value.get("contentUrl")
    return None
