from functools import lru_cache
from os import getenv
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _default_database_url() -> str:
    shared_sqlite = (Path(__file__).resolve().parents[3] / "backend" / "geoatlas_local.db").resolve()
    return f"sqlite:///{shared_sqlite.as_posix()}"


class Settings:
    database_url: str = (
        getenv("GEOATLAS_PORTAL_DATABASE_URL")
        or getenv("DATABASE_URL")
        or _default_database_url()
    )
    cors_origins: list[str] = [
        origin.strip()
        for origin in getenv(
            "GEOATLAS_PORTAL_CORS_ORIGINS",
            "http://127.0.0.1:3100,http://localhost:3100",
        ).split(",")
        if origin.strip()
    ]
    session_days: int = max(1, int(getenv("GEOATLAS_PORTAL_SESSION_DAYS", "30")))
    admin_email: str | None = getenv("GEOATLAS_PORTAL_ADMIN_EMAIL") or None
    admin_password: str | None = getenv("GEOATLAS_PORTAL_ADMIN_PASSWORD") or None
    admin_name: str = getenv("GEOATLAS_PORTAL_ADMIN_NAME", "GeoAtlas Admin")
    hidden_admin_slug: str = getenv("GEOATLAS_PORTAL_HIDDEN_ADMIN_SLUG", "control-room-7f3a")
    secure_cookies: bool = getenv("GEOATLAS_PORTAL_SECURE_COOKIES", "false").strip().lower() in {
        "1", "true", "yes", "on"
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
