# GeoAtlas Commercial Portal

This folder contains the standalone commercial API portal website, extracted from the main GeoAtlas app.

Structure:

- `backend/` - FastAPI backend for auth, API keys, users, plans, invoices, and admin operations
- `frontend/` - Next.js frontend for customer signup/login, dashboard, and hidden backoffice
- `schema/` - SQL schema for the commercial portal tables

Deployment model:

- Run this portal independently from the main GeoAtlas site.
- Point `DATABASE_URL` (or `GEOATLAS_PORTAL_DATABASE_URL`) to the same database used by the GeoAtlas public API if you want generated keys to work immediately against the live GeoAtlas API.
- The portal keeps its own session, user, plan, invoice, and key-linking tables.

Production requirements:

- Set `GEOATLAS_PORTAL_DATABASE_URL` to the same database used by the GeoAtlas public API. Keys generated against a separate portal database will not authenticate against the data API.
- Set a strong `GEOATLAS_PORTAL_ADMIN_EMAIL`, `GEOATLAS_PORTAL_ADMIN_PASSWORD`, and unpredictable `GEOATLAS_PORTAL_HIDDEN_ADMIN_SLUG` before first startup.
- Set `GEOATLAS_PORTAL_SECURE_COOKIES=true` when the portal is served over HTTPS.
- Set `GEOATLAS_PORTAL_CORS_ORIGINS` to the exact deployed frontend origin.
- Set `PORTAL_API_URL` for the frontend deployment so `/api/portal/*` proxies to this backend.
- Put both services behind HTTPS. Do not expose a production portal over plain HTTP.

Admin access:

1. Open `/login` on the portal frontend and sign in with the configured admin email and password.
2. After sign-in, open `/backoffice/<GEOATLAS_PORTAL_HIDDEN_ADMIN_SLUG>`.
3. Ordinary customer registration never grants administrator access.

Recommended local ports:

- Portal backend: `http://127.0.0.1:8100`
- Portal frontend: `http://127.0.0.1:3100`

Suggested local startup:

One command:

```powershell
cd F:\geo-atlas\commercial_portal
npm run dev
```

What this does:

- starts backend and frontend together
- prefixes output clearly as `backend` and `frontend`
- tries `8100` for backend and `3100` for frontend first
- if either port is busy, it automatically moves to the next free port
- passes the selected backend URL into the frontend automatically

Dry run to preview chosen ports:

```powershell
cd F:\geo-atlas\commercial_portal
npm run dev:dry-run
```

Manual backend:

```powershell
cd F:\geo-atlas\commercial_portal\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

Manual frontend:

```powershell
cd F:\geo-atlas\commercial_portal\frontend
npm install
$env:PORTAL_API_URL='http://127.0.0.1:8100'
npm run dev
```
