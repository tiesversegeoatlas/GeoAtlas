from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.public_api_keys import create_public_api_key


def main() -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Create a GeoAtlas customer API key")
    parser.add_argument("--name", required=True)
    parser.add_argument("--rpm", type=int, default=settings.public_api_default_rpm)
    parser.add_argument(
        "--monthly-limit",
        type=int,
        default=settings.public_api_default_monthly_limit,
    )
    args = parser.parse_args()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        key, plaintext = create_public_api_key(
            db,
            args.name,
            requests_per_minute=args.rpm,
            monthly_request_limit=args.monthly_limit,
        )
    print(f"Customer: {key.name}")
    print(f"Key: {plaintext}")
    print(f"Rate limit: {key.requests_per_minute}/minute")
    print(f"Monthly limit: {key.monthly_request_limit}")
    print("Store this key now; only its SHA-256 hash is retained.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
