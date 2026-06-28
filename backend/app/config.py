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
    ai_backfill_worker_count: int = max(
        1, min(3, int(getenv("GEOATLAS_AI_BACKFILL_WORKER_COUNT", "1")))
    )
    ai_adaptive_workers: bool = getenv(
        "GEOATLAS_AI_ADAPTIVE_WORKERS", "true"
    ).lower() in {"1", "true", "yes", "on"}
    ai_worker_max_cpu_percent: float = max(
        40.0,
        min(95.0, float(getenv("GEOATLAS_AI_WORKER_MAX_CPU_PERCENT", "80"))),
    )
    ai_worker_min_free_memory_gb: float = max(
        1.0, float(getenv("GEOATLAS_AI_WORKER_MIN_FREE_MEMORY_GB", "2.0"))
    )
    ai_aux_worker_memory_step_gb: float = max(
        0.5, float(getenv("GEOATLAS_AI_AUX_WORKER_MEMORY_STEP_GB", "1.5"))
    )
    ai_resource_check_seconds: int = max(
        2, int(getenv("GEOATLAS_AI_RESOURCE_CHECK_SECONDS", "5"))
    )
    ai_backfill_job_pause_seconds: float = max(
        0.0, float(getenv("GEOATLAS_AI_BACKFILL_JOB_PAUSE_SECONDS", "0.25"))
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
