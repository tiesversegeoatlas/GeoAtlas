# GeoAtlas Work Documentation

This file is the running work log for GeoAtlas. Anyone who works on the project should add an entry here describing what they changed, why they changed it, how they verified it, and what remains.

Technical reference documents:

| Document | Purpose |
| --- | --- |
| [README.md](README.md) | Backend low-level design and overall module plan. |
| [HLD.md](HLD.md) | High-level backend architecture and system context. |
| [docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md](docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md) | Runnable GeoAtlas data collection implementation notes. |
| [backend/db/geoatlas_data_collection_schema.sql](backend/db/geoatlas_data_collection_schema.sql) | Supabase Postgres + PostGIS schema for the data collection service. |

## How To Add An Entry

Add new entries at the top of the Work Log section.

Use this format:

```md
### YYYY-MM-DD - Short Title

**Developer:** Name

**Goal:** What you were trying to build or fix.

**What changed:**
- File or module changed: short explanation.
- File or module changed: short explanation.

**How to run or verify:**
- Command, endpoint, UI path, or manual check.

**Output or result:**
- What worked after the change.

**Known issues or follow-ups:**
- Anything not finished, risky, or planned next.
```

## Work Log

### 2026-06-20 - Faster Collection and Working Output Preview

**Developer:** Codex

**Goal:** Speed up collection without removing enrichment features and repair the output source dropdown and JSON display.

**What changed:**
- `backend/app/services.py`, `backend/app/config.py`: Direct article extraction now uses four bounded parallel fetchers per ingestion job while headless search fallback, location inference, geocoding, images, body extraction, and event creation remain enabled.
- `backend/app/services.py`: Uses client-generated IDs to avoid unnecessary database flushes for raw and normalized rows.
- `backend/app/admin_keys.py`: Continues validating every admin request but throttles the audit timestamp write to once per five minutes, avoiding a database commit on every progress poll.
- `backend/app/config.py`, `backend/.env.example`: Increased the default commit batch to 25 and removed the artificial per-item pause while retaining one ingestion job worker to prevent PC lag.
- `backend/app/main.py`: Added `GET /api/v1/public/output-sources`, returning only enabled sources that have collected output.
- `backend/static/app.js`, `backend/static/index.html`: Removed the 5,919-source startup crawl from normal page loading, populated the output dropdown independently, added visible loading state, and limited the UI preview to 25 complete items/events.
- `backend/tests/test_ingestion_performance.py`: Added default-setting and bounded-parallelism regression coverage.

**How to run or verify:**
- Run `python -m pytest -q` from `backend`.
- Open the source console and confirm the output preview loads without waiting for the complete source index.
- Select a source from the Output dropdown and confirm its JSON data and counts refresh.

**Output or result:**
- The output-source endpoint responds with a compact list instead of thousands of unused source options.
- The output panel displays 25 complete items and events and updates correctly after dropdown selection.
- Article-page network waits overlap with a maximum of four fetches, while database and browser-heavy work remain bounded.

**Known issues or follow-ups:**
- Full bulk health and collection operations still load the complete source index when explicitly started because those operations intentionally target all matching sources.

### 2026-06-20 - Compatible Backend PR Additions

**Developer:** Codex

**Goal:** Adopt useful backend additions from pull request #1 without replacing or breaking the current ingestion, health-check, scraping, and public API behavior.

**What changed:**
- `backend/app/event_classifier.py`, `backend/app/feed_utils.py`: Added specific disaster classification for earthquakes, floods, wildfires, and cyclones while retaining the existing category hints.
- `backend/app/analytics.py`, `backend/app/main.py`: Added current-schema-compatible event filters and `GET /api/v1/public/statistics`.
- `backend/app/geo_utils.py`: Added validated distance, bounding-box, GeoJSON, midpoint, and radius helpers, including safe polar and date-line handling.
- `backend/tests/test_pr_backend_additions.py`: Added regression coverage for classification, filters, statistics, and geospatial helpers.
- Deliberately excluded the PR's duplicate `/health` route and helpers that referenced event fields not present in the current schema.

**How to run or verify:**
- Run `python -m pytest -q` from `backend`.
- Query `GET /api/v1/public/events?risk_hint=medium&category=flood&country_code=KE`.
- Query `GET /api/v1/public/statistics`.

**Output or result:**
- All backend tests pass.
- The current database-aware `/health` route remains the only registered health route.
- Existing RSS ingestion, URL scraping, enrichment, and deduplication behavior remains in place.

**Known issues or follow-ups:**
- Public event filtering is applied after the existing reliability-aware deduplication so the current output semantics are preserved.

### 2026-06-19 - Low-Impact Ingestion

**Developer:** Codex

**Goal:** Preserve article enrichment, geocoding, and collected output without making the local PC unresponsive.

**What changed:**
- `backend/app/services.py`: Replaced one duplicate query per feed item with one batch query and capped each run at 25 new items by default.
- `backend/app/ingestion_runner.py`: Added a bounded background executor with one ingestion worker by default.
- `backend/app/main.py`: Ingest requests now return a queued job immediately, reuse an existing active source job, and resume unfinished jobs after restart.
- `backend/app/services.py`: Commits small batches and briefly yields between items to keep CPU, disk, and database pressure smooth.
- `backend/app/config.py`, `backend/.env.example`: Added worker, commit-batch, pause, article timeout, and response-size controls while retaining enrichment and geocoding.
- `backend/app/feed_utils.py`, `backend/app/article_utils.py`: Added lightweight fetch limits for article enrichment.
- `backend/static/app.js`: Polls lightweight job status, displays queued/running progress, and avoids rebuilding the full multi-thousand-source index after each ingest.
- `backend/app/headless_search.py`: Reuses one headless Chrome/Edge instance per ingestion job to search a headline, open the best result, and recover rendered description/body/image data when direct article extraction is blocked or incomplete.
- `backend/app/services.py`: Feeds headless-search text through the existing conservative location inference and records `search_enriched` or `article_search_enriched` extraction status.
- `backend/app/services.py`, `backend/scripts/mark_non_feed_urls.py`: Confirmed RSS/Atom parse failures are stored as `connector_type=url`, while temporary HTTP/network failures remain RSS records.
- `backend/app/headless_search.py`, `backend/app/services.py`: URL sources discover and scrape a bounded set of same-site news articles into the existing raw, normalized, event, image, date, and location fields.
- `backend/static/app.js`, `backend/static/index.html`: URL records have a separate filter/state and expose `Run scrape` instead of RSS ingestion controls.
- `backend/app/article_utils.py`: Uses country/state source scope as a low-confidence location fallback only when article-derived location evidence is empty.
- `backend/app/services.py`, `backend/app/main.py`: Source health now tries RSS/Atom first and, after failure, performs a one-article URL scrape probe before deciding whether the source is usable.
- `backend/static/app.js`: `Check all sources` includes URL records and reports usable sources whether they work through RSS or scraping.
- `backend/static/index.html`, `backend/static/app.js`: Added `Fetch all RSS` and `Scrape all URLs` bulk controls with sequential processing, shared progress counters, and Stop support.
- `backend/tests/test_ingestion_performance.py`: Added regression coverage for low-impact defaults.

**How to run or verify:**
- Restart the API after pulling the change.
- Run an ingest from the Sources panel.
- Run `python -m unittest discover -s tests -v` from `backend`.

**Output or result:**
- The UI and API remain responsive while expensive enrichment runs in one background worker.
- Repeated clicks reuse the same active job instead of starting parallel ingestion.
- Article enrichment and external geocoding remain enabled by default.

**Known issues or follow-ups:**
- The API process must remain running while a background job executes; unfinished jobs are rescheduled on startup.
- Ingestion/enrichment failure updates the job error but does not change the source's working/visible status; source health is controlled only by the dedicated RSS health workflow.

### 2026-06-18 - Location False-Positive Cleanup

**Developer:** Ahan

**Goal:** Remove false locations such as months, legal phrases, and headline fragments that were incorrectly geocoded.

**What changed:**
- `backend/app/article_utils.py`: Replaced broad capitalized-phrase extraction with conservative headline-prefix, article-dateline, and known-place rules.
- `backend/app/article_utils.py`: Added canonical country aliases and coordinates so country headlines do not require an ambiguous free-text geocoder lookup.
- `backend/app/article_utils.py`: Added public/storage sanitization for months and non-geographic words.
- `backend/app/feed_utils.py`: Added conservative UTF-8 mojibake repair for feed and article text.
- `backend/app/main.py`: Recomputes conservative primary locations for public output and hides stale false coordinate rows.
- `backend/app/feed_utils.py`, `backend/app/services.py`: Added RSS media-image fallback when article pages cannot be fetched.
- `backend/scripts/cleanup_location_data.py`: Added dry-run/apply cleanup for historical invalid hints and locations.
- `backend/tests/test_ingestion_quality.py`: Added regressions for the supplied AllAfrica false locations, country aliases, and broken character encoding.

**How to run or verify:**
- Run `python scripts/cleanup_location_data.py` from `backend` for a dry run.
- Run `python scripts/cleanup_location_data.py --apply` to remove invalid stored location data.
- Run `python -m unittest discover -s tests -v` from `backend`.
- Restart the backend and query public items.

**Output or result:**
- `May`, `April`, `JUSTICE, Legal`, `Policy By July`, and similar phrases are no longer treated as locations.
- Country-prefixed headlines and article datelines are prioritized.
- `MÃ©decins Sans FrontiÃ¨res`-style text is repaired to valid Unicode.
- Existing bad coordinates are suppressed publicly and can be deleted with the cleanup script.

**Known issues or follow-ups:**
- Sources that block article access retain RSS summary text and may not have an image unless the feed supplies media metadata.

### 2026-06-18 - Article Location Enrichment And Reliable-Source Deduplication

**Developer:** Ahan

**Goal:** Derive news locations from article pages, enrich public news records, and keep the most reliable source when multiple sites report the same story.

**What changed:**
- `backend/app/article_utils.py`: Added article-page extraction for JSON-LD, Open Graph, Twitter metadata, body paragraphs, images, dates, location phrases, and configurable geocoding.
- `backend/app/config.py`, `backend/.env.example`: Added geocoder URL, timeout, and rate-limit configuration.
- `backend/app/models.py`: Added the ORM model for the existing `normalized_item_locations` PostGIS table.
- `backend/app/services.py`: Enriches new normalized items from article pages and stores body, image, article time, location hints, coordinates, and PostGIS geography.
- `backend/app/main.py`: Deduplicates public items and events by canonical URL/title similarity and keeps the source with the higher reliability score.
- `backend/app/schemas.py`: Expanded public items with body, image, collection time, source feed URL, and structured locations.
- `backend/db/geoatlas_data_collection_schema.sql`: Added a canonical URL index.
- `backend/db/20260618_article_location_enrichment.sql`: Added an idempotent migration for existing Supabase databases.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Documented enrichment, public fields, geocoding, and deduplication.

**How to run or verify:**
- Configure geocoder settings in `backend/.env`.
- Run ingestion for a working source.
- Query `GET /api/v1/public/items` or `GET /api/v1/public/export.json`.
- Confirm items include article body, image, publication/collection times, and locations.
- Compare duplicate stories from different sources and confirm the public result uses the higher-reliability source.

**Output or result:**
- Location is inferred from the article page rather than RSS location fields.
- Public news includes title, body/details, image, dates, source reliability, and geocoded locations.
- Duplicate public stories are collapsed while raw source records remain stored.

**Known issues or follow-ups:**
- Article extraction is heuristic and intentionally dependency-light; difficult paywalled or JavaScript-only pages may fall back to RSS content.
- Geocoding quality depends on the configured provider and location-name ambiguity.

### 2026-06-18 - RSS Data Cleaning Monitor

**Developer:** Ahan

**Goal:** Make RSS health checking a visible, controllable data-cleaning workflow.

**What changed:**
- `backend/static/index.html`: Added health-check scope selection, a Stop action, and live checked/working/not-working/remaining counters.
- `backend/static/app.js`: Unchecked sources are prioritized and can be checked separately from all existing sources.
- `backend/static/app.js`: RSS checks run with bounded concurrency and update source cards and progress as each result finishes.
- `backend/static/styles.css`: Added distinct `Checking` source styling and compact progress statistics.

**How to run or verify:**
- Choose `Check unchecked` after a CSV import, or `Check all sources` for a full cleanup pass.
- Click `Check RSS health`.
- Watch percentage, checked, working, not-working, and remaining totals.
- Use `Stop` to stop scheduling additional source checks.

**Output or result:**
- New unchecked imports can be cleaned first.
- Working sources become active and visible.
- Broken sources become failing and remain hidden from public output.
- The current page updates while checks complete.

**Known issues or follow-ups:**
- Stop waits for already-running checks to finish; it prevents new checks from starting.

### 2026-06-18 - CSV Import Status Export

**Developer:** Ahan

**Goal:** Export the row-by-row result of the current CSV source import.

**What changed:**
- `backend/static/index.html`: Added `Export import status` to the CSV import panel.
- `backend/static/app.js`: Exports every uploaded CSV row with its line, source fields, import status, and message.
- `backend/static/app.js`: Supports `Ready`, `Not selected`, `Adding`, `Added`, `Skipped duplicate`, `Failed`, and `Invalid` statuses.

**How to run or verify:**
- Upload a CSV and optionally run the import.
- Click `Export import status`.
- Open `geoatlas-import-status-YYYY-MM-DD.csv`.

**Output or result:**
- The exported CSV records the import result for every uploaded link.
- Failed and invalid rows include their error message.

**Known issues or follow-ups:**
- Import status exists in browser memory for the currently uploaded CSV and resets when the file is cleared or the page reloads.

### 2026-06-18 - Bulk CSV Import And Timeout Recovery

**Developer:** Ahan

**Goal:** Fix CSV imports getting stuck or crashing when RSS servers time out.

**What changed:**
- `backend/app/feed_utils.py`: Converts socket read `TimeoutError` into a normal `FeedError` instead of an ASGI 500 traceback.
- `backend/app/services.py`: Added database-only bulk source creation with duplicate URL fingerprint skipping.
- `backend/app/main.py`: Added `POST /api/v1/sources/import`.
- `backend/app/schemas.py`: Added bulk import request/result schemas for batches up to 500.
- `backend/static/app.js`: Imports CSV rows in batches of 250 and maps backend results to `Added`, `Skipped duplicate`, or `Failed`.
- `backend/static/app.js`: Removed per-row RSS detection from CSV import progress.
- `backend/static/index.html`, `backend/static/styles.css`: Added an `Unchecked` source state for newly imported feeds awaiting RSS health validation.

**How to run or verify:**
- Restart the backend and refresh the Source Console.
- Upload the CSV and click `Import selected`.
- Confirm progress advances by batches and does not stop on a slow RSS server.
- Run `Check RSS health` after import to validate and activate unchecked sources.

**Output or result:**
- CSV insertion uses database batches instead of thousands of sequential feed fetches.
- Duplicate links are skipped by the database import service.
- New sources remain hidden until health checked.
- Feed timeouts return readable errors rather than crashing the ASGI request.

**Known issues or follow-ups:**
- RSS health validation remains a separate operation after bulk insertion.

### 2026-06-18 - CSV Import Progress And Row Statuses

**Developer:** Ahan

**Goal:** Show visible CSV import progress and per-row results while database additions are running.

**What changed:**
- `backend/static/index.html`: Added a compact CSV import progress bar with percentage and status text.
- `backend/static/app.js`: Added row statuses for `Ready`, `Adding`, `Added`, `Skipped duplicate`, and `Failed`.
- `backend/static/app.js`: Added aggregate added/skipped/failed counts and efficient preview refreshes every 25 processed rows.
- `backend/static/styles.css`: Reused the compact progress styling so CSV progress remains visible without cluttering the interface.

**How to run or verify:**
- Upload a CSV and click `Import selected`.
- Watch the progress percentage and processed count.
- Confirm row statuses change as imports complete.

**Output or result:**
- Import progress remains visible throughout long imports.
- Duplicate rows are shown as skipped, successful rows as added, and errors as failed.

**Known issues or follow-ups:**
- New-source imports remain sequential because each source performs backend feed detection.

### 2026-06-18 - Skip CSV Duplicates During Database Add

**Developer:** Ahan

**Goal:** Remove duplicate checking from CSV upload and simply skip duplicate sources when adding rows to the database.

**What changed:**
- `backend/static/app.js`: CSV upload now only parses and displays the file; it does not run duplicate API or RSS checks.
- `backend/static/app.js`: Each selected row is submitted normally, and backend `already exists` responses are counted as skipped duplicates instead of failures.
- `backend/static/app.js`: Skipped rows are labeled `Skipped duplicate` in the CSV preview.
- `backend/static/index.html`: Removed the duplicate override selector and fixed import behavior to skip existing sources.

**How to run or verify:**
- Refresh the Source Console and upload a CSV.
- Confirm rows appear immediately without a `checking...` phase.
- Click `Import selected`.
- Confirm existing database sources are reported as skipped and are not inserted again.

**Output or result:**
- CSV size no longer affects upload-time duplicate checking because no duplicate check runs during upload.
- Database duplicate guards remain authoritative during import.

**Known issues or follow-ups:**
- Import duration still depends on network feed detection for genuinely new sources.

### 2026-06-18 - Fast CSV Duplicate Precheck

**Developer:** Ahan

**Goal:** Fix CSV duplicate checking that remained on `checking...` for more than 30 minutes with a 6,008-row file.

**What changed:**
- `backend/app/main.py`: Bulk duplicate checking now loads and indexes stored source fingerprints once instead of querying all sources once per CSV row.
- `backend/app/schemas.py`: Deep network feed detection is now off by default for bulk duplicate prechecks.
- `backend/static/app.js`: Increased duplicate-check batches from 10 to 500 rows and disabled network feed discovery during upload/import prechecks.
- `backend/static/app.js`: Added exact normalized source-name matching to catch stored sources whose discovered `feed_url` differs from the CSV `base url`.
- `backend/static/index.html`: Updated the static asset version so browsers load the faster CSV logic.

**How to run or verify:**
- Restart the backend service.
- Refresh `http://127.0.0.1:8000`.
- Upload the CSV again.
- Confirm the preview appears immediately and `checking...` completes quickly.

**Output or result:**
- Bulk database duplicate checks no longer perform thousands of database scans or RSS network fetches.
- Existing rows are unselected using URL/site fingerprints and exact normalized source names.
- The source-create backend still performs before/after feed-detection duplicate guards during actual import.

**Known issues or follow-ups:**
- A browser refresh is required to stop an already-running old duplicate-check request.

### 2026-06-17 - Thorough CSV Duplicate Detection

**Developer:** Ahan

**Goal:** Stop CSV imports from re-adding sources that are already in the database, even when CSV URLs differ from stored feed URLs.

**What changed:**
- `backend/static/app.js`: CSV duplicate matching now compares against stored `feed_url` and `site_url` URL fingerprints.
- `backend/static/app.js`: CSV load calls a backend duplicate check for locally unmatched rows and unselects matches found through feed detection.
- `backend/static/app.js`: Import rechecks selected rows for duplicates immediately before saving and skips duplicates in skip mode.
- `backend/app/services.py`: Added URL fingerprint matching and duplicate guards before and after feed detection in source creation.
- `backend/app/main.py`: Added `POST /api/v1/sources/duplicates` for protected bulk duplicate checks.
- `backend/app/schemas.py`: Added duplicate-check request and response models.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Documented CSV duplicate guardrails.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Enter a valid generated admin key.
- Upload a CSV whose rows are already present in the database.
- Confirm existing rows are counted as already in DB and start unselected.
- Try importing with `Skip existing links` and confirm duplicates are skipped.

**Output or result:**
- CSV precheck catches exact URL matches, site/feed URL matches, normalized URL variants, and detected feed matches.
- Backend create refuses duplicate sources even if a frontend check misses one.

**Known issues or follow-ups:**
- Deep duplicate checks fetch unmatched URLs and can take time for very large CSV files. A future worker-backed import could show row-level async progress.

### 2026-06-17 - RSS Health Progress Bar

**Developer:** Ahan

**Goal:** Show RSS health-check progress visibly without cluttering the Sources controls.

**What changed:**
- `backend/static/index.html`: Moved health-check progress into a hidden compact progress bar below the source filters.
- `backend/static/app.js`: Added a centralized progress updater for checked count, percent, and final working/not-working totals.
- `backend/static/styles.css`: Styled the health progress as a slim bar that appears only during/after checks and keeps pagination uncluttered.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Enter a valid generated admin key.
- Confirm the Sources panel is not cluttered before checks.
- Click `Check RSS health` and confirm the progress bar fills while sources are checked.

**Output or result:**
- Health progress is visible as a bar with percentage and compact status text.
- The pager row only shows source count and page navigation.

**Known issues or follow-ups:**
- The health check still runs sequentially in the browser. A future worker can provide resumable background progress.

### 2026-06-17 - Automated RSS Health Checks

**Developer:** Ahan

**Goal:** Let the Source Console automatically check whether saved RSS feeds still work and flag sources without manually marking each one.

**What changed:**
- `backend/app/services.py`: Added RSS health-check logic that fetches and parses a source feed, marking it active/visible on success or failing/hidden on error.
- `backend/app/main.py`: Added `POST /api/v1/sources/{source_id}/check-health`.
- `backend/app/schemas.py`: Added a source health-check response model.
- `backend/static/index.html`: Added a `Check RSS health` button and progress summary in the Sources panel.
- `backend/static/app.js`: Added a check-all loop that loads all non-archived sources, checks each RSS feed one by one, updates progress, and refreshes source/output views.
- `backend/static/styles.css`: Adjusted the source pager layout to fit health-check progress.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Documented automatic RSS health checks.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Enter a valid generated admin key.
- Click `Check RSS health`.
- Watch the Sources panel progress text update as feeds are checked.

**Output or result:**
- Working RSS feeds are marked active and visible.
- Broken RSS feeds are marked failing, disabled, and hidden from public output.

**Known issues or follow-ups:**
- The UI checks sources sequentially to avoid request timeouts. A production scheduler or worker can run the same per-source endpoint in the background later.

### 2026-06-17 - Source Management UI Layout

**Developer:** Ahan

**Goal:** Make working and not-working sources visually distinct and clean up the source management layout.

**What changed:**
- `backend/static/index.html`: Added source-panel classes for dedicated filter and pager layout.
- `backend/static/app.js`: Reworked source cards into structured source info, health state, grouped actions, and destructive actions.
- `backend/static/styles.css`: Added distinct working, not-working, and archived source treatments with left accents, health blocks, cleaner action grouping, and responsive layout rules.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Enter a valid generated admin key.
- Check the Sources panel for working, not-working, and archived visual states.
- Use `Working` and `Not working` controls on source cards.

**Output or result:**
- Working sources show a green accent and visible-output health state.
- Not-working sources show a red accent and hidden-output health state.
- Source actions are grouped so normal actions, health marking, and removal actions are easier to scan.

**Known issues or follow-ups:**
- Add bulk health marking later if large CSV imports need mass cleanup.

### 2026-06-17 - Sources Pagination And Total Count

**Developer:** Ahan

**Goal:** Paginate the Sources display and show the total number of sources instead of only loading a fixed first batch.

**What changed:**
- `backend/app/main.py`: Added `offset`, search `q`, and `status` filters to `GET /api/v1/sources`.
- `backend/app/main.py`: Returns `X-Total-Count`, `X-Limit`, and `X-Offset` headers for source list pagination and exposes those headers through CORS.
- `backend/static/index.html`: Added source page size, previous/next buttons, and a source summary area.
- `backend/static/app.js`: Added server-backed source pagination, total count display, page-size switching, and DB-backed search/status filtering.
- `backend/static/app.js`: Keeps a separate full source index for CSV duplicate checks and the output source dropdown while the visible list remains paginated.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Documented source pagination behavior and headers.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Enter a valid generated admin key.
- Confirm the Sources panel shows `Showing X-Y of Z sources`.
- Use `Previous`, `Next`, page size, search, and status filters.

**Output or result:**
- The Sources panel is paginated.
- Total matching source count is visible.
- Search/status filters query the backend and reset to the first page.

**Known issues or follow-ups:**
- The CSV duplicate checker still loads a full source index in the browser. If source volume becomes very large, replace that with a backend bulk duplicate-check endpoint.

### 2026-06-17 - Source Health Marking And Removal

**Developer:** Ahan

**Goal:** Let admins mark source links as working or not working, hide broken sources from public output, and permanently remove unwanted source links/data from the database.

**What changed:**
- `backend/app/schemas.py`: Added request/response models for manual source health marking and purge results.
- `backend/app/main.py`: Added `POST /api/v1/sources/{source_id}/mark` to mark sources working or not working.
- `backend/app/main.py`: Added `DELETE /api/v1/sources/{source_id}/purge` to delete a source plus its event candidates, normalized items, raw fetched items, and ingestion jobs.
- `backend/app/main.py`: Updated public items/events queries so disabled or archived sources no longer appear in public output.
- `backend/static/app.js`: Added source-card controls for `Mark working`, `Mark not working`, and `Remove from DB`.
- `backend/static/styles.css`: Added compact styling for source visibility badges and muted hidden-source cards.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Documented source health and removal behavior.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Enter a valid generated admin key and refresh sources.
- Click `Mark not working` on a source and confirm it becomes hidden from public API output.
- Click `Mark working` to restore it.
- Click `Remove from DB` only when the source and its collected data should be permanently deleted.

**Output or result:**
- Admins can manually classify source links as working or broken.
- Broken/disabled sources are excluded from public source, item, event, and export output.
- Removed sources are purged from the database instead of only archived.

**Known issues or follow-ups:**
- Marking is manual. A later job can auto-check feeds and suggest working/not-working status based on HTTP/feed parsing results.

### 2026-06-17 - CSV Duplicate Precheck

**Developer:** Ahan

**Goal:** Make CSV uploads check existing stored sources first and keep already-saved links unselected by default.

**What changed:**
- `backend/static/app.js`: Compares each CSV `base url` against loaded source `feed_url` values when the CSV is parsed.
- `backend/static/app.js`: Marks rows already present in the database as `Already in DB`, counts them in the CSV summary, and leaves them unchecked on initial load.
- `backend/static/app.js`: Keeps duplicate rows manually selectable so the user can still override existing links when needed.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Enter a valid generated admin key and load sources.
- Upload a CSV with columns `source name`, `base url`, `category`, `region`, and `language`.
- Confirm rows whose `base url` already exists are counted as already in DB and start unchecked.

**Output or result:**
- New CSV rows are selected for add by default.
- Existing CSV rows are visible but unselected, reducing accidental duplicate imports.

**Known issues or follow-ups:**
- Matching is based on normalized CSV `base url` versus stored `feed_url`; redirected URLs or alternate feed aliases can still require backend duplicate handling.

### 2026-06-17 - CSV Source Import

**Developer:** Ahan

**Goal:** Let users upload a CSV to add many RSS sources, review/select rows before import, and decide how duplicate links should be handled.

**What changed:**
- `backend/app/schemas.py`: Added optional source language fields for create/update payloads.
- `backend/app/services.py`: Applies a CSV-provided language override when creating a source.
- `backend/static/index.html`: Added the CSV import panel with file input, duplicate mode, select-all, clear, import, summary, and preview area.
- `backend/static/styles.css`: Added CSV preview table styling, row states, and duplicate/invalid badges.
- `backend/static/app.js`: Added CSV parsing, required-column validation, duplicate detection, row selection, select-all behavior, skip/override duplicate modes, and selected-row import.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Documented CSV format, behavior, and field mapping.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Enter a generated admin key and refresh sources.
- Upload a CSV with columns `source name`, `base url`, `category`, `region`, and `language`.
- Select or unselect individual rows, or use `Select all`.
- Choose `Skip existing links` or `Override existing links`.
- Click `Import selected`.

**Output or result:**
- CSV rows are previewed before import.
- Invalid rows are disabled.
- Existing links are flagged as duplicates.
- Selected new rows are added as sources.
- Selected duplicate rows are either skipped or overridden based on the selected duplicate mode.

**Known issues or follow-ups:**
- Duplicate detection currently compares CSV `base url` to stored `feed_url`. If a website URL redirects or discovers a feed URL already stored under a different URL, the backend may still report it as duplicate during save.
- Add a backend bulk-import endpoint later if imports become large enough to need server-side batching.

### 2026-06-17 - Detected Time Zone Display

**Developer:** Ahan

**Goal:** Translate displayed timestamps in the GeoAtlas Source Console into the browser-detected time zone.

**What changed:**
- `backend/static/index.html`: Added a visible detected time-zone status chip in the top toolbar.
- `backend/static/app.js`: Added browser time-zone detection, localized timestamp formatting, and recursive timestamp conversion for JSON output preview fields.

**How to run or verify:**
- Open `http://127.0.0.1:8000`.
- Confirm the top toolbar shows the detected time zone.
- Check source cards, detected sample items, and JSON output preview timestamps.

**Output or result:**
- The UI detected `Asia/Calcutta` in the current browser session.
- Output preview timestamps are displayed with `GMT+5:30`.
- Browser console showed no errors after reload.

**Known issues or follow-ups:**
- Add a manual time-zone override if analysts need to inspect output in another time zone.

### 2026-06-17 - Source Console UI And Functionality Pass

**Developer:** Ahan

**Goal:** Improve the GeoAtlas Source Console so adding feeds, loading sources, triggering ingestion, and reading output are clearer and less brittle.

**What changed:**
- `backend/static/index.html`: Added API docs link, message bar, admin-key visibility toggle, generated-key hint, clear button, source search/status filters, output source selector, copy-output button, and output summary.
- `backend/static/styles.css`: Added layout and state styles for the new controls, notices, toolbars, selected candidates, danger actions, and mobile behavior.
- `backend/static/app.js`: Reworked UI state management for admin-key loading, source filtering, selectable feed candidates, save/run/archive/view actions, scoped output refresh, JSON copy, and clearer error/success messages.

**How to run or verify:**
- Start the API from `backend` with `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
- Open `http://127.0.0.1:8000`.
- Paste a generated admin key and refresh sources.
- Detect an RSS feed, save it, run ingestion, and confirm output JSON updates.
- Reload the page and check browser console errors.

**Output or result:**
- UI loads with `geoatlas-data-collection: DB ok`.
- Admin key loads protected source data from Supabase.
- RSS detection displays selectable candidates and sample items.
- Saving a source, running ingestion, and scoped output preview work from the UI.
- Browser console showed no errors after reload.

**Known issues or follow-ups:**
- Add a dedicated admin-key management screen if key rotation needs to happen from the browser.
- Add pagination or cursor controls once source/output volume grows.

### 2026-06-17 - Backend Folder And Database Admin Keys

**Developer:** Ahan

**Goal:** Move backend code into a dedicated `backend/` folder and replace the fixed environment admin key with generated admin keys stored in Supabase/Postgres.

**What changed:**
- `backend/`: Moved the FastAPI app, static source console, schema SQL, requirements, and local environment example into the backend folder.
- `backend/app/admin_keys.py`: Added admin key generation, hashing, storage, and validation helpers.
- `backend/app/models.py`: Added the `admin_api_keys` model.
- `backend/app/main.py`: Changed admin route validation to check `X-Admin-Key` against active hashed keys in the database.
- `backend/scripts/generate_admin_key.py`: Added a script that generates a plaintext key, stores only its hash in Supabase/Postgres, and prints the plaintext once.
- `backend/db/geoatlas_data_collection_schema.sql`: Added the `admin_api_keys` table and active-key index.
- `backend/static/index.html`: Updated the Admin key placeholder to refer to generated GeoAtlas admin keys.
- `.gitignore`: Updated ignores for backend-local `.env` and SQLite files.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Documented the new backend folder layout and admin key generation flow.

**How to run or verify:**
- Run `cd backend`.
- Run `python scripts/generate_admin_key.py --name local-admin`.
- Start the API with `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
- Paste the generated key into the GeoAtlas Source Console admin key field.
- Call an admin endpoint such as `GET /api/v1/sources` with `X-Admin-Key`.

**Output or result:**
- Admin keys are now database-backed and can be rotated by generating a new key.
- The backend is now contained in the `backend/` folder.
- `admin_api_keys` exists in Supabase/Postgres and has one active generated key.
- A valid generated key successfully authenticated `GET /api/v1/sources`.
- An invalid key was rejected with HTTP 401.

**Known issues or follow-ups:**
- Add an admin-only key revocation/listing endpoint if key management needs to happen through the UI.
- Add role/scope support if multiple admin key permission levels are needed.

### 2026-06-17 - Supabase Pooler Connection

**Developer:** Ahan

**Goal:** Replace the unreachable direct Supabase Postgres URL with the IPv4-compatible Supabase pooler URI and verify GeoAtlas can use Supabase Postgres.

**What changed:**
- `backend/.env`: Updated `DATABASE_URL` to use the Supabase pooler host. This file is ignored by git and must not be committed.
- Supabase Postgres: GeoAtlas startup created or verified the core data collection tables.
- Supabase Postgres: Applied `backend/db/geoatlas_data_collection_schema.sql` to enable the full table/index shape for the data collection service.

**How to run or verify:**
- Run a SQLAlchemy connection check against `DATABASE_URL`.
- Restart the API with `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
- Call `GET /health`.
- Query `information_schema.tables` for core GeoAtlas data collection tables.
- Call `GET /api/v1/public/items`.

**Output or result:**
- SQLAlchemy connected to Supabase Postgres through the pooler.
- `/health` returned `status: ok` and `database: ok`.
- Core tables found: `external_sources`, `ingestion_jobs`, `ingestion_logs`, `raw_fetched_items`, `normalized_items`, `normalized_item_locations`, and `event_candidates`.
- Expected indexes were created, including trigram and PostGIS GIST indexes.
- Public items endpoint responded with an empty list from the connected database.

**Known issues or follow-ups:**
- Add a migration system before production changes accumulate.

### 2026-06-17 - Supabase Postgres URL Attempt

**Developer:** Ahan

**Goal:** Configure `DATABASE_URL` using the Supabase Postgres password and verify whether GeoAtlas can connect directly to Supabase Postgres.

**What changed:**
- `.env`: Set `DATABASE_URL` to the Supabase direct Postgres connection string using the local password. This file is ignored by git and must not be committed.
- `backend/app/main.py`: Moved database table creation into startup and made `/health` report database errors as degraded health instead of crashing the whole API.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Added a note about using the Supabase pooler connection string when direct IPv6 database access is not available.

**How to run or verify:**
- Restart the API with `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
- Call `GET /health`.
- Test DNS and network access for the direct Supabase database host.

**Output or result:**
- Supabase API keys are configured and the API service starts.
- `DATABASE_URL` is configured as a Postgres URL.
- Direct DB connection failed from this machine because the Supabase direct database host resolves to IPv6 and the local network cannot reach that IPv6 address.
- `/health` now reports database status as `error` with service status `degraded` instead of letting the app crash on startup.

**Known issues or follow-ups:**
- Replace `DATABASE_URL` with the Supabase IPv4-compatible connection pooler URI from Project Settings -> Database -> Connection string.
- After the pooler URL is added, restart the API and recheck `/health` for `database: ok`.

### 2026-06-17 - Supabase Environment Wiring

**Developer:** Ahan

**Goal:** Add the Supabase project URL and API keys to the local runtime environment and make the backend aware of the Supabase configuration.

**What changed:**
- `.env`: Added `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` locally. This file is ignored by git and should not be committed.
- `backend/app/config.py`: Added Supabase URL, anon key, and service-role key settings.
- `backend/app/main.py`: Extended `/health` to report whether Supabase URL/API keys are configured without exposing secret values.
- `.env.example`: Added placeholder Supabase environment variables for future developers.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Documented the difference between Supabase API keys and the Postgres `DATABASE_URL`.

**How to run or verify:**
- Start the API with `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
- Call `GET /health` and confirm Supabase settings show as configured.
- Set `DATABASE_URL` to the Supabase Postgres connection string when ready to store data in Supabase Postgres.

**Output or result:**
- Supabase project API settings are available to the backend through environment variables.
- Local `/health` reports Supabase URL, anon key, and service-role key as configured.
- Supabase REST root was reachable with the service-role key and returned HTTP 200.

**Known issues or follow-ups:**
- A real Supabase Postgres connection still requires the database password or full pooled connection string in `DATABASE_URL`.

### 2026-06-17 - GeoAtlas Data Collection First Build

**Developer:** Ahan

**Goal:** Build the first usable data collection slice for GeoAtlas where an internal user can add RSS/Atom feed links, let the backend auto-detect feed content, ingest entries, store output, and expose public API output without building a public news frontend.

**What changed:**
- `backend/app/main.py`: Added FastAPI routes for feed detection, source CRUD, manual ingestion, job lookup, public items, public events, public sources, JSON export, health, OpenAPI, and the internal source console.
- `backend/app/feed_utils.py`: Added RSS/Atom fetching, URL safety checks, private-network blocking, XML parsing, HTML feed discovery, item hashing, simple category hints, and simple location hints.
- `backend/app/services.py`: Added source detection, source creation, synchronous manual ingestion, raw item storage, normalized item creation, and event candidate creation.
- `backend/app/models.py`: Added SQLAlchemy models for sources, ingestion jobs, raw fetched items, normalized items, and event candidates.
- `backend/app/schemas.py`: Added Pydantic request and response models for admin APIs and public output APIs.
- `backend/static/index.html`, `backend/static/styles.css`, `backend/static/app.js`: Added the internal GeoAtlas Source Console for adding feeds, detecting metadata, saving sources, triggering ingestion, and previewing public JSON output.
- `backend/db/geoatlas_data_collection_schema.sql`: Added Supabase Postgres + PostGIS SQL schema and indexes for the data collection slice.
- `backend/.env.example`: Added GeoAtlas runtime environment variables.
- `backend/requirements.txt`: Added Python dependencies for the FastAPI service.
- `.gitignore`: Added local environment, cache, and SQLite database ignores.
- `docs/GEOATLAS_DATA_COLLECTION_IMPLEMENTATION.md`: Added run instructions, endpoint list, Supabase setup notes, admin key notes, public output contract, and current limits.
- `README.md`, `HLD.md`: Linked the runnable implementation notes and aligned data collection language with GeoAtlas naming.

**How to run or verify:**
- Run `cd backend`.
- Install dependencies with `pip install -r requirements.txt`.
- Start the API with `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
- Open `http://127.0.0.1:8000` to use the GeoAtlas Source Console.
- Check health with `GET /health`.
- Detect a feed with `POST /api/v1/sources/detect`.
- Add a feed with `POST /api/v1/sources/rss`.
- Trigger ingestion with `POST /api/v1/sources/{source_id}/ingest`.
- Read output with `GET /api/v1/public/items` or `GET /api/v1/public/export.json`.

**Output or result:**
- Local API health returned `{"status":"ok","database":"ok","service":"geoatlas-data-collection"}`.
- Browser UI rendered as `GeoAtlas Source Console`.
- RSS detection was verified with NASA's RSS feed.
- Manual ingestion produced normalized public items and event candidates.

**Known issues or follow-ups:**
- Manual ingestion currently runs synchronously inside the API request; move it to a scheduler/worker for production.
- RSS parsing is dependency-light and should later be upgraded with stronger article extraction and feed compatibility.
- Location extraction is currently simple keyword matching; replace with a geocoder or NLP pipeline.
- Add automated tests around URL safety, feed detection, duplicate handling, and public output schemas.
