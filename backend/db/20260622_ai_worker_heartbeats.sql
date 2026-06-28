create table if not exists ai_worker_heartbeats (
  worker_id text primary key,
  worker_name text not null,
  slot integer not null,
  process_id integer not null,
  host_name text not null,
  status text not null default 'starting',
  current_job_id uuid,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  cpu_percent double precision,
  available_memory_gb double precision,
  status_message text,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);

create index if not exists idx_ai_worker_heartbeat
  on ai_worker_heartbeats (heartbeat_at desc);
