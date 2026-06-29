from __future__ import annotations

import json
import unittest

from app.main import public_openapi_schema
from app.public_content import (
    public_location_hint,
    sanitize_public_text,
    sanitize_public_url,
)


class PublicContentSanitizationTests(unittest.TestCase):
    def test_parenthetical_markdown_source_link_is_removed(self) -> None:
        value = (
            "Iran issued a statement "
            "([jpost.com](https://www.jpost.com/middle-east/iran-news/"
            "article-900763?utm_source=openai))."
        )

        cleaned = sanitize_public_text(value)

        self.assertEqual(cleaned, "Iran issued a statement.")
        self.assertNotIn("jpost.com", cleaned)
        self.assertNotIn("http", cleaned)
        self.assertNotIn("openai", cleaned.lower())

    def test_raw_urls_and_generation_disclosures_are_removed(self) -> None:
        value = (
            "AI-generated review content. More details: "
            "https://example.com/story?utm_source=openai"
        )

        cleaned = sanitize_public_text(value)

        self.assertEqual(cleaned, "review content. More details")
        self.assertNotIn("AI", cleaned)
        self.assertNotIn("http", cleaned)

    def test_standalone_markdown_domain_link_is_removed(self) -> None:
        cleaned = sanitize_public_text(
            "The report remains under review [jpost.com](https://jpost.com/story)."
        )

        self.assertEqual(cleaned, "The report remains under review.")

    def test_public_url_removes_tracking_parameters_and_fragment(self) -> None:
        cleaned = sanitize_public_url(
            "https://www.jpost.com/story?id=12&utm_source=openai#section"
        )

        self.assertEqual(cleaned, "https://www.jpost.com/story?id=12")

    def test_public_location_hint_removes_internal_provenance(self) -> None:
        cleaned = public_location_hint({
            "name": "Delhi, India",
            "country_code": "IN",
            "latitude": 28.6139,
            "longitude": 77.209,
            "confidence": 0.9,
            "method": "ai_suggestion",
            "evidence": "Structured AI analysis",
        })

        self.assertEqual(
            cleaned,
            {
                "name": "Delhi, India",
                "country_code": "IN",
                "latitude": 28.6139,
                "longitude": 77.209,
                "confidence": 0.9,
            },
        )

    def test_public_openapi_excludes_internal_analysis_contracts(self) -> None:
        response = public_openapi_schema()
        schema = json.loads(response.body)
        serialized = json.dumps(schema).lower()

        self.assertTrue(schema["paths"])
        self.assertTrue(
            all(
                path.startswith("/api/v1/public/")
                or path in {"/health", "/ready", "/api/v1"}
                for path in schema["paths"]
            )
        )
        self.assertNotIn("/api/v1/ai", serialized)
        self.assertNotIn("ai_suggestion", serialized)
        self.assertNotIn("openai", serialized)
        self.assertNotIn('"provider"', serialized)
        self.assertNotIn('"model_name"', serialized)


if __name__ == "__main__":
    unittest.main()
