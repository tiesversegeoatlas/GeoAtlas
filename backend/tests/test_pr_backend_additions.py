from __future__ import annotations

import unittest

from app.analytics import event_matches_filters, generate_event_statistics
from app.event_classifier import classify_event_types
from app.geo_utils import (
    coordinates_to_geojson,
    get_bounding_box,
    haversine_distance,
    midpoint_coordinates,
)
from app.models import EventCandidate, ExternalSource


class EventAdditionTests(unittest.TestCase):
    def test_specific_disaster_classification(self) -> None:
        self.assertEqual(
            classify_event_types("A wildfire followed severe flooding"),
            ["flood", "wildfire"],
        )

    def test_statistics_use_current_event_fields(self) -> None:
        event = EventCandidate(
            title="Flood warning",
            source_id="source",
            normalized_item_id="item",
            risk_hint="medium",
            category_hints=["natural_disaster", "flood"],
            location_hints=[{"country_code": "KE"}],
        )
        source = ExternalSource(name="Example", feed_url="https://example.com/feed")
        stats = generate_event_statistics([(event, source)])
        self.assertEqual(stats["total_events"], 1)
        self.assertEqual(stats["country_codes"], {"KE": 1})
        self.assertTrue(
            event_matches_filters(event, risk_hint="medium", category="flood", country_code="ke")
        )


class GeoAdditionTests(unittest.TestCase):
    def test_distance_and_geojson(self) -> None:
        self.assertAlmostEqual(haversine_distance(0, 0, 0, 1), 111.195, places=2)
        self.assertEqual(coordinates_to_geojson(10, 20), {"type": "Point", "coordinates": [20, 10]})

    def test_polar_bounding_box_is_valid(self) -> None:
        bounds = get_bounding_box(90, 0, 10)
        self.assertEqual(bounds["min_lon"], -180)
        self.assertEqual(bounds["max_lon"], 180)
        self.assertLessEqual(bounds["max_lat"], 90)

    def test_midpoint_handles_date_line(self) -> None:
        midpoint = midpoint_coordinates(0, 170, 0, -170)
        self.assertAlmostEqual(abs(midpoint["longitude"]), 180, places=5)


if __name__ == "__main__":
    unittest.main()
