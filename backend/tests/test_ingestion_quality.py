from __future__ import annotations

import unittest

from app.article_utils import infer_location_candidates, sanitize_location_hints
from app.feed_utils import repair_mojibake, strip_text


class TextQualityTests(unittest.TestCase):
    def test_repairs_utf8_decoded_as_latin1(self) -> None:
        self.assertEqual(
            repair_mojibake("MÃ©decins Sans FrontiÃ¨res"),
            "Médecins Sans Frontières",
        )

    def test_strip_text_repairs_mojibake(self) -> None:
        self.assertEqual(strip_text("<p>Eastern Chad â€” update</p>"), "Eastern Chad — update")


class LocationQualityTests(unittest.TestCase):
    def test_headline_country_wins_over_month_words(self) -> None:
        hints = infer_location_candidates(
            "Nigeria: Nigeria Inflation Quickens As Fuel Costs Rise",
            "Consumer prices increased in May compared with April.",
        )
        self.assertEqual(hints[0]["name"], "Nigeria")
        self.assertEqual(hints[0]["country_code"], "NG")
        self.assertNotIn("May", [hint["name"] for hint in hints])

    def test_specific_countries_replace_generic_africa(self) -> None:
        hints = infer_location_candidates(
            "Africa: What Drives Paid Work Among Young Mums",
            "The study covered South Africa, Nigeria and Uganda.",
        )
        names = [hint["name"] for hint in hints]
        self.assertNotIn("Africa", names)
        self.assertEqual(names[:3], ["South Africa", "Nigeria", "Uganda"])

    def test_allafrica_country_alias_is_canonicalized(self) -> None:
        hints = infer_location_candidates(
            "Congo-Kinshasa: Trump Declared Peace in Congo",
            "The conflict continues in eastern Democratic Republic of Congo.",
        )
        self.assertEqual(hints[0]["name"], "Democratic Republic of the Congo")
        self.assertEqual(hints[0]["country_code"], "CD")

    def test_rejects_legacy_phrase_candidates(self) -> None:
        bad_hints = [
            {
                "name": "OM India Food Centre, Ontario, Canada",
                "method": "article_text_pattern",
                "evidence": "Money, Food",
                "country_code": "CA",
                "latitude": 43.8,
                "longitude": -79.4,
                "confidence": 0.86,
            },
            {
                "name": "May, Oklahoma, United States",
                "method": "article_text_pattern",
                "evidence": "in May",
                "country_code": "US",
                "latitude": 36.6,
                "longitude": -99.7,
                "confidence": 0.7,
            },
        ]
        self.assertEqual(sanitize_location_hints(bad_hints), [])


if __name__ == "__main__":
    unittest.main()
