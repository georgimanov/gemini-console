-- Per-user reference/preference data that was previously shared static files under
-- resources/: templates (user-owned, editable copies), food preferences, and the
-- supplement/vitamin catalog. Weight itself doesn't get a new table — it's Garmin-style
-- observed data and goes straight into garmin_metrics (category "body") alongside
-- weight/body_fat_pct already synced from Garmin.

-- User-owned copies of what were shared markdown templates (morning briefing, meal plan).
create table if not exists user_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  slug        text not null,
  content     text not null,
  updated_at  timestamptz not null default now(),
  unique (user_id, slug)
);

-- Food preferences / nutrition catalog (was resources/data/food-list.xml).
create table if not exists food_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  category       text not null,
  name           text not null,
  kcal_per_100g  numeric,
  protein_g      numeric,
  carbs_g        numeric,
  fat_g          numeric,
  nutrients      jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  unique (user_id, name)
);

-- Supplement/vitamin catalog (was resources/data/supplements-and-vitamins.xml).
create table if not exists supplements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null,  -- supplement | amino_acid | vitamin
  name          text not null,
  brand         text,
  serving_info  jsonb not null default '{}',
  nutrition     jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  unique (user_id, name)
);

-- Observed supplement intake — same "dynamic, specific to a person" treatment as weight;
-- no source file yet, so this starts empty like chat_sessions did.
create table if not exists supplement_logs (
  id             bigserial primary key,
  user_id        uuid not null references users(id) on delete cascade,
  supplement_id  uuid not null references supplements(id) on delete cascade,
  date           date not null,
  amount         text,
  taken_at       timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists supplement_logs_user_date_idx on supplement_logs (user_id, date);
