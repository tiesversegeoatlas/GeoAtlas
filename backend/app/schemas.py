from datetime import datetime

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
    reliability_score: float
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


class PublicItemsResponse(BaseModel):
    items: list[PublicItem]
    next_cursor: str | None = None


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
