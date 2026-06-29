from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class DetectRequest(BaseModel):
    url: HttpUrl
    fetch_sample_items: bool = True


class LatestItemPreview(BaseModel):
    title: str | None = None
    url: str | None = None
    published_at: datetime | None = None


class FeedCandidate(BaseModel):
    feed_url: str
    feed_type: str
    title: str | None = None
    site_url: str | None = None
    language: str | None = None
    score: float
    latest_items: list[LatestItemPreview] = []
    warnings: list[str] = []


class DetectResponse(BaseModel):
    input_url: str
    status: str
    candidates: list[FeedCandidate]
    warnings: list[str] = []


class SourceCreate(BaseModel):
    name: str | None = None
    feed_url: HttpUrl
    fetch_interval_minutes: int = Field(default=30, ge=5, le=1440)
    reliability_score: float = Field(default=0.7, ge=0, le=1)
    enabled: bool = True
    category_scope: list[str] | None = None
    country_scope: str | None = None
    language: str | None = None


class SourceUpdate(BaseModel):
    name: str | None = None
    fetch_interval_minutes: int | None = Field(default=None, ge=5, le=1440)
    reliability_score: float | None = Field(default=None, ge=0, le=1)
    enabled: bool | None = None
    category_scope: list[str] | None = None
    country_scope: str | None = None
    detected_language: str | None = None


class SourceMarkRequest(BaseModel):
    working: bool


class SourcePurgeResponse(BaseModel):
    source_id: str
    deleted_events: int
    deleted_normalized_items: int
    deleted_raw_items: int
    deleted_jobs: int
    deleted_sources: int


class SourceResponse(BaseModel):
    id: str
    name: str
    connector_type: str
    feed_url: str
    site_url: str | None
    detected_title: str | None
    detected_feed_type: str | None
    detected_language: str | None
    fetch_interval_minutes: int
    reliability_score: float
    ai_credibility_score: float | None = None
    ai_assessment_count: int = 0
    ai_assessed_at: datetime | None = None
    enabled: bool
    archived: bool
    status: str
    category_scope: list[str] | None
    country_scope: str | None
    last_success_at: datetime | None
    last_failure_at: datetime | None
    last_error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SourceHealthCheckResponse(BaseModel):
    source: SourceResponse
    working: bool
    message: str


class SourceDuplicateCheckRequest(BaseModel):
    urls: list[str]
    detect_unmatched: bool = False


class SourceDuplicateCheckItem(BaseModel):
    url: str
    duplicate_id: str | None = None
    duplicate_name: str | None = None
    matched_by: str | None = None


class SourceDuplicateCheckResponse(BaseModel):
    items: list[SourceDuplicateCheckItem]


class SourceBulkImportRequest(BaseModel):
    sources: list[SourceCreate] = Field(min_length=1, max_length=500)


class SourceBulkImportItem(BaseModel):
    feed_url: str
    status: str
    source_id: str | None = None
    message: str | None = None


class SourceBulkImportResponse(BaseModel):
    added: int
    skipped: int
    failed: int
    items: list[SourceBulkImportItem]


class JobResponse(BaseModel):
    id: str
    source_id: str
    trigger_type: str
    status: str
    fetched_count: int
    duplicate_raw_count: int
    normalized_count: int
    event_candidate_count: int
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class IngestResponse(BaseModel):
    job: JobResponse


class PublicSource(BaseModel):
    id: str
    name: str
    feed_url: str
    site_url: str | None
    credibility_score: float
    credibility_tier: str
    last_success_at: datetime | None


class PublicLocation(BaseModel):
    name: str
    country_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    confidence: float | None = None


class PublicItem(BaseModel):
    id: str
    source: PublicSource
    canonical_url: str | None
    title: str
    summary: str | None
    body: str | None
    image_url: str | None
    language: str | None
    published_at: datetime | None
    collected_at: datetime
    category_hints: list[str] | None
    location_hints: list[dict] | None
    locations: list[PublicLocation]
    extraction_status: str
    risk_level: str | None = None
    risk_score: int | None = None
    urgency_score: int | None = None
    importance_score: int | None = None
    claim_quality_score: int | None = None
    is_breaking: bool = False
    breaking_reason: str | None = None
    credibility_score: float
    rank_score: float


class PublicItemsResponse(BaseModel):
    items: list[PublicItem]
    next_cursor: str | None = None
    total: int = 0
    offset: int = 0
    limit: int = 25


class PublicRiskTimelinePoint(BaseModel):
    date: str
    label: str
    risk: int
    events: int


class PublicRiskBreakdown(BaseModel):
    label: str
    value: int
    count: int


class PublicOverview(BaseModel):
    total_news: int
    high_risk_events: int
    countries_affected: int
    policy_events: int
    overall_risk: int
    timeline: list[PublicRiskTimelinePoint]
    breakdown: list[PublicRiskBreakdown]
    generated_at: datetime


class PublicEvent(BaseModel):
    id: str
    source_id: str
    normalized_item_id: str
    title: str
    summary: str | None
    category_hints: list[str] | None
    location_hints: list[dict] | None
    risk_hint: str
    publication_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AIAnalyzeRequest(BaseModel):
    item_ids: list[str] = Field(default_factory=list, max_length=100)
    latest_limit: int = Field(default=0, ge=0, le=100)
    force: bool = False


class AIAnalysisJobResponse(BaseModel):
    id: str
    normalized_item_id: str
    status: str
    provider: str
    model_name: str
    force: bool
    suggestion_id: str | None
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AIAnalyzeResponse(BaseModel):
    jobs: list[AIAnalysisJobResponse]


class AIWorkerProgress(BaseModel):
    worker_id: str
    worker_name: str
    slot: int
    process_id: int
    host_name: str
    status: str
    current_job_id: str | None = None
    completed_count: int
    failed_count: int
    cpu_percent: float | None = None
    available_memory_gb: float | None = None
    status_message: str | None = None
    started_at: datetime
    heartbeat_at: datetime


class AIProgressResponse(BaseModel):
    enabled: bool
    auto_analyze: bool
    provider: str
    model: str
    prompt_version: str
    worker_status: str
    worker_capacity: int
    adaptive_workers: bool
    total_items: int
    analyzed_items: int
    remaining_items: int
    progress_percent: float
    queued_jobs: int
    dispatched_jobs: int
    running_jobs: int
    successful_jobs: int
    failed_jobs: int
    ranked_sources: int
    total_sources: int
    latest_completed_at: datetime | None = None
    workers: list[AIWorkerProgress]


class AISuggestionResponse(BaseModel):
    id: str
    normalized_item_id: str
    event_candidate_id: str | None
    suggestion_type: str
    provider: str
    model_name: str
    prompt_version: str
    output_payload: dict
    confidence: float
    status: Literal["pending_review", "approved", "rejected"]
    created_at: datetime

    model_config = {"from_attributes": True}


class AIReviewRequest(BaseModel):
    status: Literal["approved", "rejected"]
