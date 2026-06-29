from __future__ import annotations

import unittest

from fastapi import HTTPException, Response
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Base
from app.public_api_keys import (
    create_public_api_key,
    hash_public_api_key,
    validate_public_api_key,
)


class PublicApiKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.settings = get_settings()
        self.settings.public_api_auth_required = True

    def tearDown(self) -> None:
        get_settings.cache_clear()
        self.engine.dispose()

    def test_customer_key_is_hashed_and_rate_limited(self) -> None:
        with Session(self.engine) as db:
            key, plaintext = create_public_api_key(
                db,
                "test customer",
                requests_per_minute=1,
                monthly_request_limit=2,
            )
            self.assertNotEqual(key.key_hash, plaintext)
            self.assertEqual(key.key_hash, hash_public_api_key(plaintext))

            response = Response()
            validated = validate_public_api_key(db, response, plaintext, None)
            self.assertEqual(validated.id, key.id)
            self.assertEqual(response.headers["X-RateLimit-Remaining"], "0")

            with self.assertRaises(HTTPException) as raised:
                validate_public_api_key(db, Response(), plaintext, None)
            self.assertEqual(raised.exception.status_code, 429)

    def test_invalid_customer_key_is_rejected(self) -> None:
        with Session(self.engine) as db:
            with self.assertRaises(HTTPException) as raised:
                validate_public_api_key(db, Response(), "invalid", None)
            self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
