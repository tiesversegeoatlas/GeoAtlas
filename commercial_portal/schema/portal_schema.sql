CREATE TABLE IF NOT EXISTS public_api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT 1,
    requests_per_minute INTEGER NOT NULL DEFAULT 60,
    monthly_request_limit INTEGER NOT NULL DEFAULT 100000,
    monthly_request_count INTEGER NOT NULL DEFAULT 0,
    usage_month TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS portal_plans (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NULL,
    monthly_price_inr INTEGER NOT NULL DEFAULT 0,
    requests_per_minute INTEGER NOT NULL DEFAULT 60,
    monthly_request_limit INTEGER NOT NULL DEFAULT 10000,
    max_api_keys INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT 1,
    public_visible BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    organization TEXT NULL,
    password_hash TEXT NOT NULL,
    plan_id TEXT NULL REFERENCES portal_plans(id),
    is_admin BOOLEAN NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT 1,
    billing_status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES portal_users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES portal_users(id),
    public_api_key_id TEXT NOT NULL UNIQUE REFERENCES public_api_keys(id),
    label TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS portal_invoices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES portal_users(id),
    plan_code TEXT NOT NULL,
    amount_inr INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'free',
    due_date TIMESTAMP NULL,
    paid_at TIMESTAMP NULL,
    notes TEXT NULL,
    issued_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users(email);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_portal_api_keys_user ON portal_api_keys(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_portal_invoices_user ON portal_invoices(user_id, issued_at);
