from __future__ import annotations

import unittest

from fastapi import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.main import (
    portal_admin_overview,
    portal_create_api_key,
    portal_login,
    portal_register,
)
from app.models import PortalUser
from app.schemas import PortalCreateApiKeyRequest, PortalLoginRequest, PortalRegisterRequest


class PortalAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_first_registered_user_becomes_admin(self) -> None:
        with Session(self.engine) as db:
            response = Response()
            dashboard = portal_register(
                PortalRegisterRequest(
                    full_name="Admin User",
                    email="admin@example.com",
                    organization="GeoAtlas",
                    password="Password123!",
                ),
                response=response,
                db=db,
            )

            self.assertTrue(dashboard.user.is_admin)
            self.assertIn("geoatlas_portal_session", response.headers.get("set-cookie", ""))

    def test_login_and_api_key_generation_work_for_customer(self) -> None:
        with Session(self.engine) as db:
            portal_register(
                PortalRegisterRequest(
                    full_name="Developer User",
                    email="dev@example.com",
                    organization="Example Org",
                    password="Password123!",
                ),
                response=Response(),
                db=db,
            )
            response = Response()
            dashboard = portal_login(
                PortalLoginRequest(email="dev@example.com", password="Password123!"),
                response=response,
                db=db,
            )
            user = db.get(PortalUser, dashboard.user.id)
            created = portal_create_api_key(
                PortalCreateApiKeyRequest(label="Primary key"),
                user=user,
                db=db,
            )

            self.assertTrue(created.plaintext_key)
            self.assertEqual(created.label, "Primary key")
            self.assertIn("geoatlas_portal_session", response.headers.get("set-cookie", ""))

    def test_admin_overview_reports_customer_totals(self) -> None:
        with Session(self.engine) as db:
            dashboard = portal_register(
                PortalRegisterRequest(
                    full_name="Admin User",
                    email="admin@example.com",
                    organization="GeoAtlas",
                    password="Password123!",
                ),
                response=Response(),
                db=db,
            )
            user = db.get(PortalUser, dashboard.user.id)
            overview = portal_admin_overview(user, db=db)

            self.assertEqual(overview.total_users, 1)
            self.assertEqual(overview.active_users, 1)
            self.assertGreaterEqual(overview.total_invoices, 1)


if __name__ == "__main__":
    unittest.main()
