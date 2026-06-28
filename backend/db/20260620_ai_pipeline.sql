create table if not exists ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  normalized_item_id uuid not null references normalized_items(id),
  event_candidate_id uuid references event_candidates(id),
  suggestion_type text not null default 'event_analysis',
  provider text not null,
  model_name text not null,
  prompt_version text not null,
  input_hash text not null,
  output_payload jsonb not null,
  confidence double precision not null default 0,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  constraint uq_ai_suggestion_cache unique (
    normalized_item_id, input_hash, provider, model_name, prompt_version
  )
);

create table if not exists ai_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  normalized_item_id uuid not null references normalized_items(id),
  status text not null default 'queued',
  provider text not null,
  model_name text not null,
  force boolean not null default false,
  suggestion_id uuid references ai_suggestions(id),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_jobs_status_created
  on ai_analysis_jobs (status, created_at);

create index if not exists idx_ai_suggestions_item_created
  on ai_suggestions (normalized_item_id, created_at desc);

create index if not exists idx_ai_suggestions_review_status
  on ai_suggestions (status, created_at desc);
