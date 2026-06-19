# GeoAtlas Frontend

Next.js frontend imported from the `lillyasmi` branch and connected to the GeoAtlas FastAPI public API.

## Run

```powershell
npm install
npm run dev
```

`npm run dev` starts both services:

- FastAPI backend: `http://127.0.0.1:8000`
- Next.js frontend: `http://127.0.0.1:3000`

Stopping the command stops both development processes. Use `npm run dev:frontend` or `npm run dev:backend` when only one service is needed.

The frontend proxies `/api/geoatlas/*` to `http://127.0.0.1:8000` by default. To use another backend:

```powershell
Copy-Item .env.example .env.local
```

Then update `GEOATLAS_API_URL` in `.env.local`.

## Live backend surfaces

- Feed: `GET /api/v1/public/items`
- Item details: `GET /api/v1/public/items/{id}`
- Events: `GET /api/v1/public/events`
- Statistics: `GET /api/v1/public/statistics`
- Sources with output: `GET /api/v1/public/output-sources`
