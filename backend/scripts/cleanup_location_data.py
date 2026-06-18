from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select
from sqlalchemy.orm.attributes import flag_modified

from app.article_utils import infer_location_candidates, sanitize_location_hints
from app.database import SessionLocal
from app.models import NormalizedItem, NormalizedItemLocation


def clean_locations(apply: bool) -> dict[str, int]:
    stats = {"items_checked": 0, "items_changed": 0, "locations_deleted": 0}
    with SessionLocal() as db:
        items = db.scalars(select(NormalizedItem)).all()
        for item in items:
            stats["items_checked"] += 1
            fresh = infer_location_candidates(item.title, item.body or item.summary)
            stored = sanitize_location_hints(item.location_hints)
            merged = fresh + [
                hint
                for hint in stored
                if not any(str(hint.get("name", "")).lower() == str(candidate.get("name", "")).lower() for candidate in fresh)
            ]
            clean = sanitize_location_hints(merged)
            if clean:
                top = float(clean[0].get("confidence") or 0)
                clean = [hint for hint in clean if float(hint.get("confidence") or 0) >= top - 0.02]
            valid_coordinates = {
                (round(float(hint["latitude"]), 4), round(float(hint["longitude"]), 4))
                for hint in clean
                if hint.get("latitude") is not None and hint.get("longitude") is not None
            }
            locations = db.scalars(
                select(NormalizedItemLocation).where(NormalizedItemLocation.normalized_item_id == item.id)
            ).all()
            invalid_location_ids = [
                location.id
                for location in locations
                if location.latitude is None
                or location.longitude is None
                or (
                    round(float(location.latitude), 4),
                    round(float(location.longitude), 4),
                )
                not in valid_coordinates
            ]
            if clean != (item.location_hints or []) or invalid_location_ids:
                stats["items_changed"] += 1
            stats["locations_deleted"] += len(invalid_location_ids)
            if apply:
                item.location_hints = clean
                flag_modified(item, "location_hints")
                if invalid_location_ids:
                    db.execute(
                        delete(NormalizedItemLocation).where(NormalizedItemLocation.id.in_(invalid_location_ids))
                    )
        if apply:
            db.commit()
        else:
            db.rollback()
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Remove implausible GeoAtlas location hints and coordinates.")
    parser.add_argument("--apply", action="store_true", help="Commit cleanup changes. Without this flag, only report.")
    args = parser.parse_args()
    result = clean_locations(apply=args.apply)
    result["mode"] = "applied" if args.apply else "dry-run"
    print(result)
