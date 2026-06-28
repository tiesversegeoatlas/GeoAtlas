# GeoAtlas Production AI Pipeline

## Purpose

The AI pipeline converts normalized news into structured, reviewable
intelligence suggestions. AI is advisory only: it cannot publish, verify,
archive, delete, or directly overwrite canonical news records.

The implementation incorporates the useful goals from the
`sriom-ai-pipeline` branch while replacing its standalone RSS script,
hard-coded country list, fixed category score, and JSON-file output with
GeoAtlas-native jobs, database records, provider adapters, schema validation,
auditing, and failure isolation.

## Capabilities

Each analysis can suggest:

- factual AI summary used as the displayed summary;
- an exactly 200-word source-grounded AI body used as the displayed body;
- event type and normalized categories;
- country, state, or regional scope, followed by server-side geocoding when
  possible, including country/state-only stories that have no city location;
- named actors;
- event date;
- risk score and level;
- an explicit AI breaking-news decision and article-grounded reason, subject to
  backend freshness and minimum-score guardrails before it appears in the
  intelligence feed;
- urgency score;
- importance score;
- claim-quality score;
- verification status;
- confidence;
- short evidence and risk-factor lists.
- live web corroboration with consulted URLs retained internally for auditing;
  web-only facts are not added to the public summary or body.

## Providers

Supported modes:

| Provider | Configuration |
| --- | --- |
| Heuristic | Always available; deterministic and has no external cost |
| Ollama | `GEOATLAS_AI_PROVIDER=ollama`, a local model name, and optional local base URL |
| Gemini | `GEOATLAS_AI_PROVIDER=gemini` with `GEOATLAS_AI_API_KEY` |
| OpenAI-compatible | `GEOATLAS_AI_PROVIDER=openai` with an API key and optional base URL |

Provider output uses a strict Pydantic/JSON schema. Gemini requests use
structured JSON generation. OpenAI-compatible requests use strict JSON schema
response formatting. Ollama uses its native `/api/chat` endpoint with the same
JSON schema and does not require an API key. If the external provider fails and
`GEOATLAS_AI_FALLBACK_ON_ERROR=true`, GeoAtlas records a deterministic
heuristic suggestion instead.

## Safety and production behavior

- Article text is treated as untrusted data, not instructions.
- API keys and source credentials are never included in prompts.
- Input size is bounded.
- Provider calls have timeouts, transient-error retries, and backoff.
- Every output is validated before storage.
- Risk and confidence are calibrated using source reliability.
- Identical inputs reuse cached suggestions.
- Forced reanalysis refreshes the same cache record rather than creating
  uncontrolled duplicates.
- AI work runs in isolated subprocesses with bounded concurrency and a hard
  whole-job timeout.
- A lightweight dispatcher resumes queued work after restart and uses a
  PostgreSQL advisory lock to avoid multi-process duplicate dispatch.
- Suggestions remain `pending_review` until a future analyst workflow approves
  or rejects them.

## Public enrichment and ranking

GeoAtlas can use an approved suggestion, or a pending suggestion with at least
0.78 confidence, as a display fallback:

- missing or extremely short summaries receive the AI summary;
- overly long summaries can be replaced in API output by a concise summary;
- missing/short bodies receive the source-grounded briefing;
- absent categories receive structured AI categories;
- absent explicit locations receive AI location text and server-geocoded
  coordinates. A broad source-country fallback does not block AI location
  enrichment when the article itself lacks a location.

These fallbacks do not overwrite the stored RSS/article fields. The public API
returns `ai_enriched_fields` so clients can identify which values came from AI.

Feed ordering uses:

- 50% source credibility;
- 25% AI importance;
- 10% claim quality;
- 15% recency.

Source credibility begins with the administrator-controlled reliability score,
then applies transparent operational adjustments for successful or failed
fetching. Low-credibility sources receive an additional ranking penalty.
Duplicate reports always retain the version from the more credible source.
This prevents a flood of weak sources from displacing stronger reporting while
still allowing a genuinely urgent low-credibility claim to remain visible for
review.

AI does not independently declare a publisher trustworthy. Credibility is
anchored in configured editorial judgment and observable source behavior;
AI assesses the quality and importance of individual reports.

## Additional useful AI capabilities

The same audited suggestion framework can later support:

- multilingual translation and language normalization;
- entity extraction for people, organizations, weapons, infrastructure, and
  affected industries;
- cross-source story clustering and corroboration counts;
- contradiction and disputed-claim detection;
- timeline construction from related reports;
- casualty and infrastructure-impact extraction;
- watchlist matching and personalized alert prioritization;
- misinformation indicators and sensational-language detection;
- trend detection across countries, categories, and time;
- analyst briefing generation using only approved/cited source records;
- semantic search embeddings and related-story retrieval.

For production safety, each capability should remain schema-constrained,
source-cited, confidence-scored, auditable, and reviewable.

## Database tables

### `ai_analysis_jobs`

Tracks queued, running, successful, and failed analysis jobs, including
provider, model, force flag, timestamps, errors, and the resulting suggestion.

### `ai_suggestions`

Stores immutable-style structured output metadata:

- normalized item and optional event-candidate reference;
- provider and model;
- prompt version;
- input hash;
- structured JSON payload;
- confidence;
- review status.

The cache key covers the item, input hash, provider, model, and prompt version.

## Admin API

All AI endpoints require a valid `X-Admin-Key`.

### Queue analysis

```http
POST /api/v1/ai/analyze
Content-Type: application/json

{
  "item_ids": ["normalized-item-uuid"],
  "latest_limit": 0,
  "force": false
}
```

To analyze the latest 20 normalized items:

```json
{
  "latest_limit": 20
}
```

### Inspect jobs

```http
GET /api/v1/ai/jobs?status=running&limit=50
```

### Inspect suggestions

```http
GET /api/v1/ai/suggestions?item_id={uuid}&status=pending_review
```

### Approve or reject a suggestion

```http
POST /api/v1/ai/suggestions/{suggestion_id}/review
Content-Type: application/json

{
  "status": "approved"
}
```

Review changes only the suggestion status; it does not publish or overwrite an
event.

## Environment

```env
GEOATLAS_AI_ENABLED=false
GEOATLAS_AI_PROVIDER=heuristic
GEOATLAS_AI_MODEL=gpt-4.1-mini
GEOATLAS_AI_API_KEY=
GEOATLAS_AI_BASE_URL=
GEOATLAS_AI_WEB_SEARCH_ENABLED=false
GEOATLAS_AI_WEB_SEARCH_REQUIRED=true
GEOATLAS_AI_TIMEOUT_SECONDS=30
GEOATLAS_AI_MAX_RETRIES=2
GEOATLAS_AI_MAX_INPUT_CHARS=12000
GEOATLAS_AI_WORKER_COUNT=2
GEOATLAS_AI_JOB_TIMEOUT_SECONDS=120
GEOATLAS_AI_AUTO_ANALYZE=false
GEOATLAS_AI_SCHEDULER_POLL_SECONDS=5
GEOATLAS_AI_SCHEDULER_BATCH_SIZE=20
GEOATLAS_AI_FALLBACK_ON_ERROR=true
GEOATLAS_AI_BACKFILL_WORKER_COUNT=1
GEOATLAS_AI_ADAPTIVE_WORKERS=true
GEOATLAS_AI_WORKER_MAX_CPU_PERCENT=80
GEOATLAS_AI_WORKER_MIN_FREE_MEMORY_GB=2.0
GEOATLAS_AI_AUX_WORKER_MEMORY_STEP_GB=1.5
GEOATLAS_AI_RESOURCE_CHECK_SECONDS=5
GEOATLAS_AI_BACKFILL_JOB_PAUSE_SECONDS=0.25
```

For local Ollama testing:

```env
GEOATLAS_AI_ENABLED=true
GEOATLAS_AI_PROVIDER=ollama
GEOATLAS_AI_MODEL=llama3.1:8b
GEOATLAS_AI_API_KEY=
GEOATLAS_AI_BASE_URL=http://127.0.0.1:11434
GEOATLAS_AI_TIMEOUT_SECONDS=120
GEOATLAS_AI_WORKER_COUNT=1
GEOATLAS_AI_AUTO_ANALYZE=false
GEOATLAS_AI_FALLBACK_ON_ERROR=false
```

For paid OpenAI API auto-analysis of only newly ingested items:

```env
GEOATLAS_AI_ENABLED=true
GEOATLAS_AI_PROVIDER=openai
GEOATLAS_AI_MODEL=gpt-4.1-mini
GEOATLAS_AI_API_KEY=sk-...
GEOATLAS_AI_BASE_URL=https://api.openai.com/v1
GEOATLAS_AI_WEB_SEARCH_ENABLED=true
GEOATLAS_AI_WEB_SEARCH_REQUIRED=true
GEOATLAS_AI_TIMEOUT_SECONDS=45
GEOATLAS_AI_MAX_RETRIES=2
GEOATLAS_AI_WORKER_COUNT=1
GEOATLAS_AI_JOB_TIMEOUT_SECONDS=90
GEOATLAS_AI_AUTO_ANALYZE=true
GEOATLAS_AI_SCHEDULER_BATCH_SIZE=1
GEOATLAS_AI_FALLBACK_ON_ERROR=true
```

This configuration was exercised locally on June 21, 2026 with
`llama3.1:8b`. The pipeline returned a schema-valid result and reported
`used_provider=ollama`; heuristic fallback was disabled for the verification.
Keep `GEOATLAS_AI_AUTO_ANALYZE=false` until individual test jobs have acceptable
quality and latency on the host machine.

The active local development configuration enables automatic analysis for new
normalized items. Because `llama3.1:8b` takes roughly 90 seconds per tested
article on this machine, it uses one worker and dispatches one queued job at a
time. Public API records expose whether AI was applied, provider/model,
confidence, and which display fields were enriched. The frontend displays
these details on news cards and event pages.

Completed low-confidence analyses remain visible as `AI analyzed` with
`review pending`; they do not alter canonical display content. Approved or
high-confidence suggestions are marked `AI enriched` and may fill missing
display fields under the existing safeguards.

Text and location use separate safety thresholds:

- at 0.65 confidence, AI may provide a strictly source-grounded summary and
  reconstruct missing body prose at approximately 200 words without adding
  claims;
- at 0.78 confidence, AI location may be used only when it includes a country
  code or geocoded coordinates;
- absent geographic evidence remains `Location unconfirmed` instead of being
  guessed from the publisher or topic.

Normal ingestion queues AI only for new normalized items when
`GEOATLAS_AI_ENABLED=true` and `GEOATLAS_AI_AUTO_ANALYZE=true`. Historical news
is not sent to paid AI unless an operator intentionally runs the backfill
commands below.

Event pages place the collected or reconstructed body first, followed by the
separately labeled AI summary.

## One-time Ollama backfill

Queue every normalized item that does not yet have an Ollama suggestion:

```powershell
python -m app.ai_backfill queue
```

Run the queued work with the adaptive worker pool without starting the web API:

```powershell
python -m app.ai_backfill_pool
```

`GEOATLAS_AI_BACKFILL_WORKER_COUNT=3` creates one primary and two auxiliary
worker slots. Every slot checks CPU and available RAM before claiming another
job. The primary slot requires the configured minimum free memory. Each
auxiliary slot requires an additional
`GEOATLAS_AI_AUX_WORKER_MEMORY_STEP_GB`, and its CPU ceiling is progressively
lower. This lets the pool accelerate when the machine is idle and contract
automatically while the frontend, ingestion, or other applications need the
resources.

Each article runs in a separate subprocess bounded by
`GEOATLAS_AI_JOB_TIMEOUT_SECONDS`. A timed-out article is terminated, moved to
the back of the queue once, and permanently failed only if its single automatic
retry also times out. Before claiming work, workers mark jobs successful when a
matching current-prompt suggestion already exists and avoid articles already
owned by another active worker. The short backfill pause controls database
pressure without adding the normal scheduler's multi-second polling delay.

The command is resumable and skips items that already have a matching
suggestion or active job. Check progress with:

```powershell
python -m app.ai_backfill status
```

Each completed article analysis updates its source's AI credibility assessment.
The score aggregates up to 100 recent AI claim-quality, confidence,
verification, and evidence assessments. It is stored separately from editorial
reliability and receives at most 35% weight in the public credibility rank.
Rebuild every source score from completed suggestions with:

```powershell
python -m app.ai_backfill rank-sources
```

Apply `backend/db/20260621_source_ai_credibility.sql` before using this feature
on an existing database.

External AI is disabled by default. Heuristic analysis remains available when
the provider is unset, disabled, unavailable, or intentionally avoided.
Automatic analysis of newly ingested items is also disabled by default so
enabling an external provider cannot silently create a large bill.

## Migration

Apply:

```text
backend/db/20260620_ai_pipeline.sql
```

New databases also receive these tables through
`backend/db/geoatlas_data_collection_schema.sql` and SQLAlchemy metadata.

## Recommended next production step

For multi-machine deployment, replace the local subprocess launcher with the
durable SQS/Redis worker architecture described in the local large-scale
hosting guide. The service and database contracts can remain unchanged.
