create table if not exists public_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  active boolean not null default true,
  requests_per_minute integer not null default 60,
  monthly_request_limit integer not null default 100000,
  monthly_request_count integer not null default 0,
  usage_month text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_public_api_keys_active
  on public_api_keys (active);
