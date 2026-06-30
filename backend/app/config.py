from functools import lru_cache
from os import getenv

from dotenv import load_dotenv

load_dotenv()


class Settings:
    database_url: str = getenv("DATABASE_URL", "sqlite:///./geoatlas_local.db")
    db_pool_size: int = max(1, int(getenv("GEOATLAS_DB_POOL_SIZE", "5")))
    db_max_overflow: int = max(0, int(getenv("GEOATLAS_DB_MAX_OVERFLOW", "0")))
    db_pool_timeout_seconds: int = max(
        1, int(getenv("GEOATLAS_DB_POOL_TIMEOUT_SECONDS", "10"))
    )
    db_pool_recycle_seconds: int = max(
        30, int(getenv("GEOATLAS_DB_POOL_RECYCLE_SECONDS", "1800"))
    )
    db_pool_pre_ping: bool = getenv("GEOATLAS_DB_POOL_PRE_PING", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    db_pool_use_lifo: bool = getenv("GEOATLAS_DB_POOL_USE_LIFO", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    supabase_url: str | None = getenv("SUPABASE_URL")
    supabase_anon_key: str | None = getenv("SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = getenv("SUPABASE_SERVICE_ROLE_KEY")
    public_base_url: str = getenv("GEOATLAS_PUBLIC_BASE_URL", "http://127.0.0.1:8000")
    public_api_auth_required: bool = getenv(
        "GEOATLAS_PUBLIC_API_AUTH_REQUIRED", "false"
    ).lower() in {"1", "true", "yes", "on"}
    public_api_default_rpm: int = max(
        1, int(getenv("GEOATLAS_PUBLIC_API_DEFAULT_RPM", "60"))
    )
    public_api_default_monthly_limit: int = max(
        1, int(getenv("GEOATLAS_PUBLIC_API_DEFAULT_MONTHLY_LIMIT", "100000"))
    )
    portal_session_days: int = max(
        1, int(getenv("GEOATLAS_PORTAL_SESSION_DAYS", "30"))
    )
    portal_admin_email: str | None = getenv("GEOATLAS_PORTAL_ADMIN_EMAIL") or None
    portal_admin_password: str | None = getenv("GEOATLAS_PORTAL_ADMIN_PASSWORD") or None
    portal_admin_name: str = getenv("GEOATLAS_PORTAL_ADMIN_NAME", "GeoAtlas Admin")
    portal_hidden_admin_slug: str = getenv(
        "GEOATLAS_PORTAL_HIDDEN_ADMIN_SLUG", "control-room-7f3a"
    )
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
    scheduler_job_timeout_seconds: int = max(60, int(getenv("GEOATLAS_SCHEDULER_JOB_TIMEOUT_SECONDS", "300")))
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
    headless_search_max_items_per_job: int = max(
        0,
        int(getenv("GEOATLAS_HEADLESS_SEARCH_MAX_ITEMS_PER_JOB", "3")),
    )
    scheduled_headless_search_max_items: int = max(
        0,
        int(getenv("GEOATLAS_SCHEDULED_HEADLESS_SEARCH_MAX_ITEMS", "0")),
    )
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
    ai_enabled: bool = getenv("GEOATLAS_AI_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
    ai_provider: str = getenv("GEOATLAS_AI_PROVIDER", "heuristic").strip().lower()
    ai_model: str = getenv("GEOATLAS_AI_MODEL", "gemini-2.5-flash").strip()
    ai_api_key: str | None = getenv("GEOATLAS_AI_API_KEY") or None
    ai_base_url: str | None = getenv("GEOATLAS_AI_BASE_URL") or None
    ai_web_search_enabled: bool = getenv(
        "GEOATLAS_AI_WEB_SEARCH_ENABLED", "false"
    ).lower() in {"1", "true", "yes", "on"}
    ai_web_search_required: bool = getenv(
        "GEOATLAS_AI_WEB_SEARCH_REQUIRED", "true"
    ).lower() in {"1", "true", "yes", "on"}
    ai_timeout_seconds: int = max(5, int(getenv("GEOATLAS_AI_TIMEOUT_SECONDS", "30")))
    ai_max_retries: int = max(0, min(5, int(getenv("GEOATLAS_AI_MAX_RETRIES", "2"))))
    ai_max_input_chars: int = max(1000, int(getenv("GEOATLAS_AI_MAX_INPUT_CHARS", "12000")))
    ai_worker_count: int = max(1, min(8, int(getenv("GEOATLAS_AI_WORKER_COUNT", "2"))))
    ai_job_timeout_seconds: int = max(30, int(getenv("GEOATLAS_AI_JOB_TIMEOUT_SECONDS", "120")))
    ai_auto_analyze: bool = getenv("GEOATLAS_AI_AUTO_ANALYZE", "false").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    ai_new_items_only: bool = getenv(
        "GEOATLAS_AI_NEW_ITEMS_ONLY", "true"
    ).lower() in {"1", "true", "yes", "on"}
    ai_new_item_max_age_hours: int = max(
        1, min(168, int(getenv("GEOATLAS_AI_NEW_ITEM_MAX_AGE_HOURS", "24")))
    )
    ai_scheduler_poll_seconds: int = max(
        2, int(getenv("GEOATLAS_AI_SCHEDULER_POLL_SECONDS", "5"))
    )
    ai_scheduler_batch_size: int = max(
        1, min(100, int(getenv("GEOATLAS_AI_SCHEDULER_BATCH_SIZE", "20")))
    )
    ai_fallback_on_error: bool = getenv("GEOATLAS_AI_FALLBACK_ON_ERROR", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
