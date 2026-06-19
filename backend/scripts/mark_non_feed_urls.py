from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.database import SessionLocal
from app.models import ExternalSource
from app.services import NON_FEED_ERRORS


def mark_non_feed_urls(apply: bool) -> dict[str, int]:
    with SessionLocal() as db:
        sources = list(
            db.scalars(
                select(ExternalSource).where(
                    ExternalSource.last_error.in_(NON_FEED_ERRORS),
                    ExternalSource.archived.is_(False),
                )
            )
        )
        changed = sum(
            source.connector_type != "url" or source.status != "url" or source.enabled
            for source in sources
        )
        if apply:
            for source in sources:
                source.connector_type = "url"
                source.status = "url"
                source.enabled = False
            db.commit()
        else:
            db.rollback()
        return {"matched": len(sources), "changed": changed}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mark confirmed non-RSS/Atom sources as URL records.")
    parser.add_argument("--apply", action="store_true", help="Commit changes. Without this flag, only report.")
    args = parser.parse_args()
    result = mark_non_feed_urls(args.apply)
    result["mode"] = "applied" if args.apply else "dry-run"
    print(result)
