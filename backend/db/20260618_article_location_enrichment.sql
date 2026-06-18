create extension if not exists postgis;
create extension if not exists pg_trgm;

alter table normalized_items add column if not exists body text;
alter table normalized_items add column if not exists image_url text;
alter table normalized_items add column if not exists location_hints jsonb;
alter table normalized_items add column if not exists extraction_status text not null default 'processed';

create table if not exists normalized_item_locations (
  id uuid primary key default gen_random_uuid(),
  normalized_item_id uuid not null references normalized_items(id),
  name text not null,
  country_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  geog geography(Point, 4326),
  confidence numeric(4,3),
  created_at timestamptz not null default now()
);

create index if not exists idx_normalized_canonical_url on normalized_items (canonical_url);
create index if not exists idx_normalized_title_trgm on normalized_items using gin (title gin_trgm_ops);
create index if not exists idx_item_locations_geog on normalized_item_locations using gist (geog);
