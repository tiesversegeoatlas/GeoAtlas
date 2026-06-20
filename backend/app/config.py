from functools import lru_cache
from os import getenv

from dotenv import load_dotenv

load_dotenv()


class Settings:
    database_url: str = getenv("DATABASE_URL", "sqlite:///./geoatlas_local.db")
    supabase_url: str | None = getenv("SUPABASE_URL")
    supabase_anon_key: str | None = getenv("SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = getenv("SUPABASE_SERVICE_ROLE_KEY")
    public_base_url: str = getenv("GEOATLAS_PUBLIC_BASE_URL", "http://127.0.0.1:8000")
    admin_cors_origins: list[str] = [
        origin.strip()
        for origin in getenv(
            "GEOATLAS_ADMIN_CORS_ORIGINS",
            "http://127.0.0.1:8000,http://localhost:8000",
        ).split(",")
        if origin.strip()
    ]
    fetch_timeout_seconds: int = int(getenv("GEOATLAS_FETCH_TIMEOUT_SECONDS", "10"))
    max_feed_bytes: int = int(getenv("GEOATLAS_MAX_FEED_BYTES", "5242880"))
    user_agent: str = getenv("GEOATLAS_USER_AGENT", "GeoAtlasDataCollector/1.0")
    ingest_max_new_items: int = int(getenv("GEOATLAS_INGEST_MAX_NEW_ITEMS", "25"))
    ingest_commit_batch_size: int = max(1, int(getenv("GEOATLAS_INGEST_COMMIT_BATCH_SIZE", "25")))
    ingest_item_pause_seconds: float = max(0, float(getenv("GEOATLAS_INGEST_ITEM_PAUSE_SECONDS", "0")))
    ingest_worker_count: int = max(1, int(getenv("GEOATLAS_INGEST_WORKER_COUNT", "1")))
    article_fetch_workers: int = max(1, min(8, int(getenv("GEOATLAS_ARTICLE_FETCH_WORKERS", "4"))))
    scheduler_enabled: bool = getenv("GEOATLAS_SCHEDULER_ENABLED", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    scheduler_poll_seconds: int = max(10, int(getenv("GEOATLAS_SCHEDULER_POLL_SECONDS", "30")))
    scheduler_max_pending_jobs: int = max(1, int(getenv("GEOATLAS_SCHEDULER_MAX_PENDING_JOBS", "2")))
    scheduler_source_scan_limit: int = max(10, int(getenv("GEOATLAS_SCHEDULER_SOURCE_SCAN_LIMIT", "200")))
    article_enrichment_enabled: bool = getenv("GEOATLAS_ARTICLE_ENRICHMENT_ENABLED", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    article_fetch_timeout_seconds: int = int(getenv("GEOATLAS_ARTICLE_FETCH_TIMEOUT_SECONDS", "4"))
    max_article_bytes: int = int(getenv("GEOATLAS_MAX_ARTICLE_BYTES", "2097152"))
    headless_search_enabled: bool = getenv("GEOATLAS_HEADLESS_SEARCH_ENABLED", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    headless_search_url: str = getenv("GEOATLAS_HEADLESS_SEARCH_URL", "https://www.bing.com/search")
    headless_search_timeout_seconds: int = int(getenv("GEOATLAS_HEADLESS_SEARCH_TIMEOUT_SECONDS", "12"))
    headless_browser_executable: str | None = getenv("GEOATLAS_HEADLESS_BROWSER_EXECUTABLE") or None
    url_scrape_max_articles: int = max(1, int(getenv("GEOATLAS_URL_SCRAPE_MAX_ARTICLES", "10")))
    health_url_probe_articles: int = max(1, int(getenv("GEOATLAS_HEALTH_URL_PROBE_ARTICLES", "1")))
    external_geocoding_enabled: bool = getenv("GEOATLAS_EXTERNAL_GEOCODING_ENABLED", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    geocoder_url: str | None = getenv("GEOATLAS_GEOCODER_URL", "https://nominatim.openstreetmap.org/search")
    geocoder_timeout_seconds: int = int(getenv("GEOATLAS_GEOCODER_TIMEOUT_SECONDS", "5"))
    geocoder_min_interval_seconds: float = float(getenv("GEOATLAS_GEOCODER_MIN_INTERVAL_SECONDS", "1.0"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
