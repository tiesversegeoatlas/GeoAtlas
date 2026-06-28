alter table external_sources
  add column if not exists ai_credibility_score double precision;

alter table external_sources
  add column if not exists ai_assessment_count integer not null default 0;

alter table external_sources
  add column if not exists ai_assessed_at timestamptz;

create index if not exists idx_sources_ai_credibility
  on external_sources (ai_credibility_score desc)
  where ai_credibility_score is not null;
