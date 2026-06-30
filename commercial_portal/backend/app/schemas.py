from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class PortalRegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    organization: str | None = Field(default=None, max_length=255)


class PortalLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class PortalPlanResponse(BaseModel):
    id: str
    code: str
    name: str
    description: str | None = None
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
    organization: str | None = None
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
    created_at: datetime
    revoked_at: datetime | None = None
    requests_per_minute: int
    monthly_request_limit: int
    monthly_request_count: int
    plaintext_key: str | None = None


class PortalInvoiceResponse(BaseModel):
    id: str
    user_id: str
    plan_code: str
    amount_inr: int
    currency: str
    status: str
    due_date: datetime | None = None
    paid_at: datetime | None = None
    notes: str | None = None
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
    monthly_revenue_inr: int
    total_invoices: int
    hidden_admin_slug: str


class PortalPlanUpsertRequest(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    monthly_price_inr: int = Field(ge=0)
    requests_per_minute: int = Field(ge=1)
    monthly_request_limit: int = Field(ge=1)
    max_api_keys: int = Field(ge=1)
    active: bool = True
    public_visible: bool = True


class PortalInvoiceCreateRequest(BaseModel):
    user_id: str
    plan_code: str = Field(min_length=2, max_length=32)
    amount_inr: int = Field(ge=0)
    status: str = Field(min_length=2, max_length=32)
    notes: str | None = None


class PortalUserAdminUpdateRequest(BaseModel):
    plan_id: str | None = None
    billing_status: str | None = Field(default=None, max_length=32)
    active: bool | None = None
    is_admin: bool | None = None
