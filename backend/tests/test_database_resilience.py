from __future__ import annotations

import unittest

from sqlalchemy.exc import OperationalError

from app.database import _engine_kwargs
from app.main import database_error_detail


class DatabaseResilienceTests(unittest.TestCase):
    def test_postgres_engine_uses_bounded_pool_defaults(self) -> None:
        kwargs = _engine_kwargs("postgresql+psycopg://user:pass@host/db")

        self.assertEqual(kwargs["pool_size"], 5)
        self.assertEqual(kwargs["max_overflow"], 0)
        self.assertEqual(kwargs["pool_timeout"], 10)
        self.assertEqual(kwargs["pool_recycle"], 1800)
        self.assertTrue(kwargs["pool_pre_ping"])
        self.assertTrue(kwargs["pool_use_lifo"])

    def test_sqlite_engine_skips_queue_pool_tuning(self) -> None:
        kwargs = _engine_kwargs("sqlite:///./geoatlas_local.db")

        self.assertEqual(kwargs, {"connect_args": {"check_same_thread": False}})

    def test_connection_saturation_returns_friendly_detail(self) -> None:
        exc = OperationalError(
            "SELECT 1",
            {},
            Exception("FATAL: (EMAXCONNSESSION) max clients reached in session mode"),
        )

        self.assertEqual(
            database_error_detail(exc),
            "Database is temporarily busy. Please retry shortly.",
        )


if __name__ == "__main__":
    unittest.main()
