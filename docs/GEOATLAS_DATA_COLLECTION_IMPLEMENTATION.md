# GeoAtlas Data Collection Implementation Notes

## What Was Built

This repository now includes a runnable standalone GeoAtlas data-collection service.

| Area | Files |
| --- | --- |
| FastAPI service | `backend/app/main.py`, `backend/app/services.py`, `backend/app/feed_utils.py` |
| Admin key auth | `backend/app/admin_keys.py`, `backend/scripts/generate_admin_key.py` |
| Persistence model | `backend/app/models.py`, `backend/app/database.py`, `backend/db/geoatlas_data_collection_schema.sql` |
| Request/response DTOs | `backend/app/schemas.py` |
| Internal source UI | `backend/static/index.html`, `backend/static/styles.css`, `backend/static/app.js` |
| Runtime config | `backend/.env.example`, `backend/requirements.txt` |
| Product/API spec | `documentation.md` |

## Runtime Behavior

The service provides:

| Capability | Endpoint |
| --- | --- |
| Feed detection | `POST /api/v1/sources/detect` |
| Save RSS/Atom source | `POST /api/v1/sources/rss` |
| Bulk CSV source insert | `POST /api/v1/sources/import` |
| Manage sources | `GET/PATCH/DELETE /api/v1/sources/*` |
| Mark source health | `POST /api/v1/sources/{source_id}/mark` |
| Check RSS health | `POST /api/v1/sources/{source_id}/check-health` |
| Permanently remove source data | `DELETE /api/v1/sources/{source_id}/purge` |
| Manual ingestion | `POST /api/v1/sources/{source_id}/ingest` |
| Job status | `GET /api/v1/ingestion/jobs` and `GET /api/v1/ingestion/jobs/{job_id}` |
| Public output | `GET /api/v1/public/items`, `/api/v1/public/events`, `/api/v1/public/sources`, `/api/v1/public/export.json` |
| Internal UI | `GET /` |
| OpenAPI | `GET /openapi.json` |
| Health | `GET /health` |

## CSV Source Import

The GeoAtlas Source Console supports CSV-based source import. The CSV must include these exact headers:

```text
source name,base url,category,region,language
```

Behavior:

| Step | Behavior |
| --- | --- |
| Upload | Browser parses the CSV locally and previews every row before importing. |
| Validate | Rows missing `source name` or `base url`, or rows with invalid URLs, are marked invalid and cannot be selected. |
| Duplicate check | `base url` is compared against existing source `feed_url` and `site_url` values using normalized URL fingerprints. Rows already in the database are counted and start unselected. |
| Deep duplicate check | Rows not matched locally call `POST /api/v1/sources/duplicates`, which can detect the RSS feed behind a website URL and match it to an existing stored source. |
| Select rows | Each valid row can be selected or unselected. `Select all` toggles all valid rows. |
| Duplicate action | Existing URL fingerprints are skipped automatically by the bulk import endpoint. |
| Add new | Selected rows are sent to `POST /api/v1/sources/import` in browser batches of 250. |
| Validate later | Added rows start as `unchecked` and disabled; run RSS health checks to mark working feeds active. |

CSV column mapping:

| CSV column | Backend field |
| --- | --- |
| `source name` | `name` |
| `base url` | `feed_url` |
| `category` | `category_scope` |
| `region` | `country_scope` |
| `language` | `detected_language` or create-time language override |

CSV imports use `POST /api/v1/sources/import` in batches of up to 500. This path does not fetch RSS feeds while inserting. New rows are stored as `unchecked` and disabled from public output until the RSS health checker validates them. Existing URL fingerprints are returned as skipped duplicates.

## Source Health And Removal

The Source Console lets an admin manually mark RSS sources as working or not working.

| Action | Backend behavior | Public output behavior |
| --- | --- | --- |
| Mark working | `POST /api/v1/sources/{source_id}/mark` with `{"working": true}` sets `status=active`, `enabled=true`, and clears the manual error. | Source and its collected items/events can appear in public API output. |
| Mark not working | `POST /api/v1/sources/{source_id}/mark` with `{"working": false}` sets `status=failing`, `enabled=false`, and stores a manual error note. | Source, items, and events are hidden from public API output. |
| Check RSS health | `POST /api/v1/sources/{source_id}/check-health` fetches and parses the RSS/Atom feed. A successful parse sets `status=active`, `enabled=true`, and updates success metadata. A failed fetch or parse sets `status=failing`, `enabled=false`, and stores the error. | Working sources remain visible; failing sources are hidden. |
| Archive | `DELETE /api/v1/sources/{source_id}` sets `archived=true`, `enabled=false`, and `status=archived`. | Source is hidden from public output but remains in the database. |
| Remove from DB | `DELETE /api/v1/sources/{source_id}/purge` deletes the source, ingestion jobs, raw fetched items, normalized items, and event candidates for that source. | Source and all collected output for it are permanently removed. |

Public item/event endpoints join against `external_sources` and only return records whose source is enabled and not archived.

The Source Console `Check RSS health` button loads all non-archived sources and calls the per-source health endpoint one by one so progress stays visible and a single long request does not time out.

The CSV panel `Export import status` action downloads the current uploaded rows with their source fields, import outcome, and error message.

## Source List Pagination

Admin source listing supports server-side pagination and total counts:

```text
GET /api/v1/sources?include_archived=true&limit=25&offset=0&q=search&status=active
```

Response body remains a JSON array of sources for compatibility. Pagination metadata is returned in response headers:

| Header | Meaning |
| --- | --- |
| `X-Total-Count` | Total sources matching the current filters. |
| `X-Limit` | Page size used by the response. |
| `X-Offset` | Starting offset used by the response. |

The Source Console uses this for the visible source cards. It separately loads a full source index in the background for CSV duplicate checks and the output source dropdown.

## CSV Duplicate Guardrails

CSV import has two duplicate guardrails:

| Layer | Behavior |
| --- | --- |
| UI precheck | Compares CSV URLs against loaded source `feed_url` and `site_url` fingerprints. It ignores protocol, `www`, trailing slashes, and common feed suffixes such as `/feed`, `/rss.xml`, and `/feed/atom`. |
| Backend precheck | `POST /api/v1/sources/duplicates` checks unmatched CSV URLs. When requested, it fetches/detects the feed behind each URL and compares the detected feed/site URLs against stored sources. |
| Create guard | `POST /api/v1/sources/rss` checks for duplicates before detection and again after feed detection, so duplicate sources are rejected even if the UI misses one. |

## Supabase Postgres + PostGIS

Supabase project settings are loaded from `.env`:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

These values identify the Supabase project and allow server-side Supabase API access. They do not replace the PostgreSQL connection string used by SQLAlchemy/PostGIS.

Set `DATABASE_URL` to the Supabase pooled or direct PostgreSQL connection string before starting the service when you want the backend to store data in Supabase Postgres instead of local SQLite.

```text
DATABASE_URL=postgresql+psycopg://postgres.PROJECT:PASSWORD@HOST:6543/postgres
```

The database password is available in Supabase dashboard under Project Settings -> Database. The anon key and service-role key are JWT API keys, not PostgreSQL passwords.

If the direct database host only resolves to IPv6 or your local network cannot route IPv6, use the Supabase pooler connection string instead. In the Supabase dashboard, open Project Settings -> Database -> Connection string and copy the URI from the connection pooler section, then convert the prefix to `postgresql+psycopg://` for this app.

The service uses SQLAlchemy metadata creation for development. For Supabase SQL Editor or managed migrations, use `backend/db/geoatlas_data_collection_schema.sql`, which enables PostGIS and creates the GeoAtlas data collection tables and indexes.

## Local Run

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000
```

Default local storage is SQLite at `backend/geoatlas_local.db`. Replace `DATABASE_URL` with Supabase Postgres for production.

## Admin Key

Admin write endpoints require `X-Admin-Key`. Admin keys are generated by script, stored in Supabase/Postgres as SHA-256 hashes, and never stored as plaintext.

Generate a key:

```powershell
cd backend
python scripts/generate_admin_key.py --name local-admin
```

The script prints the plaintext key once. Paste that value into the Admin key field in the GeoAtlas Source Console. If the key is lost, generate a new one.

The internal UI has an Admin key field and stores it in local browser storage for convenience.

## Public Output Contract

The news is not displayed as a public frontend. Output is available through:

```text
GET /api/v1/public/items
GET /api/v1/public/events
GET /api/v1/public/sources
GET /api/v1/public/export.json
```

These endpoints intentionally return sanitized records only. Raw payloads and internal job errors stay behind admin endpoints.

Public news items now include:

| Field | Meaning |
| --- | --- |
| `title` | Enriched article headline, falling back to the RSS title. |
| `summary` | Article metadata description, falling back to the RSS summary. |
| `body` | Extracted article body text. |
| `image_url` | Article JSON-LD/Open Graph/Twitter image. |
| `published_at` | Article publication timestamp, falling back to RSS time. |
| `collected_at` | Time GeoAtlas stored the normalized item. |
| `canonical_url` | Original article URL. |
| `locations` | Geocoded location records with name, coordinates, country, and confidence. |
| `location_hints` | Location evidence and inference metadata from article text. |
| `source` | Source identity and reliability score used for duplicate ranking. |

## Article And Location Enrichment

For each new RSS item with an article URL, ingestion fetches the article page and attempts to extract:

- JSON-LD `NewsArticle` or `Article` fields.
- Open Graph and Twitter title, description, image, and publication metadata.
- Article paragraphs as body-text fallback.
- Location phrases from the article headline and body.
- Coordinates through the configured geocoder.

Location configuration:

```text
GEOATLAS_HEADLESS_SEARCH_ENABLED=true
GEOATLAS_HEADLESS_SEARCH_URL=https://www.bing.com/search
GEOATLAS_HEADLESS_SEARCH_TIMEOUT_SECONDS=12
GEOATLAS_HEADLESS_BROWSER_EXECUTABLE=
GEOATLAS_URL_SCRAPE_MAX_ARTICLES=10
GEOATLAS_HEALTH_URL_PROBE_ARTICLES=1
GEOATLAS_GEOCODER_URL=https://nominatim.openstreetmap.org/search
GEOATLAS_GEOCODER_TIMEOUT_SECONDS=5
GEOATLAS_GEOCODER_MIN_INTERVAL_SECONDS=1.0
```

When direct article extraction is blocked or returns incomplete body/image metadata, GeoAtlas reuses one headless Chrome/Edge instance for the current ingestion job. It searches the exact headline, opens the strongest matching result, extracts rendered JSON-LD/Open Graph/body content, and uses an image-search result only when the article still has no image. Set `GEOATLAS_HEADLESS_SEARCH_ENABLED=false` to disable this fallback.

The browser runs in a small helper process because Windows API worker threads may not support Playwright subprocess creation. If browser search fails, ingestion keeps the RSS title/summary and continues. An ingestion failure is recorded on the job but does not mark the source as failing or hide its link; only the explicit RSS health check changes source health visibility.

If an RSS health check receives content that is definitively not RSS or Atom, the source is retained and marked `connector_type=url`, `status=url`, and `enabled=false`. Timeouts, HTTP errors, SSL failures, and rate limits are not reclassified because they may be temporary. Run `python scripts/mark_non_feed_urls.py --apply` from `backend` to backfill historical confirmed non-feed records.

URL records use `Run scrape` rather than RSS ingestion. The headless worker opens the homepage, scores same-site article links, visits at most `GEOATLAS_URL_SCRAPE_MAX_ARTICLES`, and stores canonical URL, title, description, rendered body, image, publication time, categories, and locations through the same normalized/public API tables. Existing content hashes prevent duplicates. If an article exposes no location, a configured country scope such as `United States` or subdivision scope such as `us-mt` is used as a lower-confidence fallback.

Every source health check tries RSS/Atom first. If that fails for any reason, it probes URL scraping using at most `GEOATLAS_HEALTH_URL_PROBE_ARTICLES`. A successful probe marks the source as usable `connector_type=url`, while a source is marked failing only when both RSS and URL scraping fail. RSS checks remain concurrent, but URL probes are serialized to avoid launching several browsers and causing local lag.

The Source Console also provides separate `Fetch all RSS` and `Scrape all URLs` actions. Each loads all matching non-archived sources and processes them sequentially through the existing queued ingestion endpoint, with completed/success/failed/remaining counters and a Stop action. Sources are never mass-enqueued, which keeps memory and local CPU usage bounded.

Known country names and AllAfrica country-prefix aliases use canonical country codes and coordinates directly. Only conservative dateline candidates require the external geocoder; low-quality place types such as shops, roads, and buildings are rejected. Geocoder results are cached in-process and rate limited. Set `GEOATLAS_GEOCODER_URL=` to disable external geocoding while retaining text-based location hints.

The best geocoded result is stored in `normalized_item_locations`, including latitude/longitude and the PostGIS `geography(Point, 4326)` value. Evidence and alternate candidates remain in `normalized_items.location_hints`.

For an existing Supabase database, run `backend/db/20260618_article_location_enrichment.sql` in the Supabase SQL Editor. The migration is idempotent.

## Cross-Source Story Deduplication

GeoAtlas retains every source item internally for provenance. Public item/event endpoints collapse likely duplicate stories using:

- Exact normalized canonical URL.
- Strong normalized-title token similarity.
- A 72-hour publication window.

When two sources report the same story, the public API keeps the item from the source with the higher `reliability_score`.

## Current Limits

This first build runs manual ingestion synchronously inside the API request. The endpoint already returns job records and can be moved behind a separate worker/scheduler without changing the public output API.

RSS/Atom parsing is intentionally dependency-light. It extracts titles, links, summaries, dates, feed metadata, basic category hints, and simple location hints. A later worker can add stronger article extraction, geocoding, and AI enrichment behind the same normalized item schema.
