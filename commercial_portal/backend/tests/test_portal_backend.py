import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import delete


class PortalBackendTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        os.environ["GEOATLAS_PORTAL_DATABASE_URL"] = f"sqlite:///{Path(self.tempdir.name, 'portal.db').as_posix()}"
        os.environ["GEOATLAS_PORTAL_CORS_ORIGINS"] = "http://127.0.0.1:3100"
        os.environ["GEOATLAS_PORTAL_ADMIN_EMAIL"] = "owner@example.com"
        os.environ["GEOATLAS_PORTAL_ADMIN_PASSWORD"] = "owner-secret-123"
        from importlib import reload
        import app.config
        import app.database
        import app.main
        import app.models

        reload(app.config)
        reload(app.database)
        reload(app.main)
        reload(app.models)
        app.main.Base.metadata.create_all(bind=app.main.engine)
        with app.main.Session(bind=app.main.engine) as db:
            app.main.ensure_free_plan(db)
            app.main.bootstrap_portal_admin(db)
        self.client = TestClient(app.main.app)
        self.main = app.main

    def tearDown(self) -> None:
        self.client.close()
        self.main.engine.dispose()
        self.tempdir.cleanup()

    def test_register_and_create_key(self) -> None:
        register = self.client.post(
            "/api/v1/portal/register",
            json={
                "full_name": "Portal Admin",
                "email": "admin@example.com",
                "password": "supersecret1",
                "organization": "GeoAtlas",
            },
        )
        self.assertEqual(register.status_code, 200)
        created = self.client.post("/api/v1/portal/api-keys", json={"label": "Primary key"})
        self.assertEqual(created.status_code, 200)
        payload = created.json()
        self.assertTrue(payload["plaintext_key"].startswith("geoatlas_live_"))

    def test_admin_overview(self) -> None:
        register = self.client.post(
            "/api/v1/portal/register",
            json={
                "full_name": "Portal Admin",
                "email": "admin@example.com",
                "password": "supersecret1",
            },
        )
        self.assertEqual(register.status_code, 200)
        forbidden = self.client.get("/api/v1/portal-admin/overview")
        self.assertEqual(forbidden.status_code, 403)
        login = self.client.post(
            "/api/v1/portal/login",
            json={"email": "owner@example.com", "password": "owner-secret-123"},
        )
        self.assertEqual(login.status_code, 200)
        overview = self.client.get("/api/v1/portal-admin/overview")
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(overview.json()["total_users"], 2)

    def test_admin_can_update_and_safely_delete_plan(self) -> None:
        login = self.client.post(
            "/api/v1/portal/login",
            json={"email": "owner@example.com", "password": "owner-secret-123"},
        )
        self.assertEqual(login.status_code, 200)
        created = self.client.post(
            "/api/v1/portal-admin/plans",
            json={
                "code": "professional",
                "name": "Professional",
                "description": "Production plan",
                "monthly_price_inr": 15000,
                "requests_per_minute": 120,
                "monthly_request_limit": 250000,
                "max_api_keys": 5,
                "active": True,
                "public_visible": True,
            },
        )
        self.assertEqual(created.status_code, 200)
        plan = created.json()
        updated = self.client.post(
            f"/api/v1/portal-admin/plans/{plan['id']}",
            json={**{key: value for key, value in plan.items() if key != "id"}, "monthly_price_inr": 18000},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["monthly_price_inr"], 18000)

        users = self.client.get("/api/v1/portal-admin/users").json()
        owner = next(user for user in users if user["email"] == "owner@example.com")
        assign = self.client.post(
            f"/api/v1/portal-admin/users/{owner['id']}",
            json={"plan_id": plan["id"]},
        )
        self.assertEqual(assign.status_code, 200)
        blocked = self.client.delete(f"/api/v1/portal-admin/plans/{plan['id']}")
        self.assertEqual(blocked.status_code, 409)

        free_plan = next(
            item for item in self.client.get("/api/v1/portal-admin/plans").json()
            if item["code"] == "free"
        )
        self.client.post(
            f"/api/v1/portal-admin/users/{owner['id']}",
            json={"plan_id": free_plan["id"]},
        )
        deleted = self.client.delete(f"/api/v1/portal-admin/plans/{plan['id']}")
        self.assertEqual(deleted.status_code, 200)
