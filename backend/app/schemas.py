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


class PortalRegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=255)
    organization: str | None = Field(default=None, max_length=255)
    password: str = Field(min_length=8, max_length=160)


class PortalLoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=160)


class PortalPlanResponse(BaseModel):
    id: str
    code: str
    name: str
    description: str | None
    monthly_price_inr: int
    requests_per_minute: int
    monthly_request_limit: int
    max_api_keys: int
    active: bool
    public_visible: bool

    model_config = {"from_attributes": True}


class PortalUserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    organization: str | None
    is_admin: bool
    active: bool
    billing_status: str
    created_at: datetime
    plan: PortalPlanResponse | None = None


class PortalApiKeyResponse(BaseModel):
    id: str
    label: str
    key_prefix: str
    active: bool
    requests_per_minute: int
    monthly_request_limit: int
    monthly_request_count: int
    usage_month: str
    created_at: datetime
    last_used_at: datetime | None
    plaintext_key: str | None = None


class PortalInvoiceResponse(BaseModel):
    id: str
    plan_code: str
    amount_inr: int
    currency: str
    status: str
    due_date: datetime | None
    paid_at: datetime | None
    notes: str | None
    issued_at: datetime

    model_config = {"from_attributes": True}


class PortalDashboardResponse(BaseModel):
    user: PortalUserResponse
    plan: PortalPlanResponse | None
    api_keys: list[PortalApiKeyResponse]
    invoices: list[PortalInvoiceResponse]
    hidden_admin_slug: str | None = None


class PortalCreateApiKeyRequest(BaseModel):
    label: str = Field(min_length=2, max_length=120)


class PortalAdminOverviewResponse(BaseModel):
    total_users: int
    active_users: int
    total_api_keys: int
    active_api_keys: int
    monthly_requests: int
    monthly_revenue_inr: int
    total_invoices: int
    hidden_admin_slug: str


class PortalPlanUpsertRequest(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    monthly_price_inr: int = Field(ge=0)
    requests_per_minute: int = Field(ge=1, le=100000)
    monthly_request_limit: int = Field(ge=1)
    max_api_keys: int = Field(ge=1, le=100)
    active: bool = True
    public_visible: bool = True


class PortalInvoiceCreateRequest(BaseModel):
    user_id: str
    amount_inr: int = Field(ge=0)
    status: str = Field(min_length=2, max_length=32)
    plan_code: str = Field(min_length=2, max_length=32)
    notes: str | None = Field(default=None, max_length=500)


class PortalUserAdminUpdateRequest(BaseModel):
    plan_id: str | None = None
    billing_status: str = Field(min_length=2, max_length=32)
    active: bool = True
    is_admin: bool = False
