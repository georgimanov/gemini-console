-- Initial schema: users (Google-only auth), athlete profile, personas,
-- Garmin metrics/activities, versioned plans, and chat history.

create extension if not exists pgcrypto;

-- ── Identity ─────────────────────────────────────────────
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  google_sub     text unique not null,
  email          text unique not null,
  display_name   text,
  avatar_url     text,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz not null default now()
);

create table if not exists athlete_profiles (
  user_id     uuid primary key references users(id) on delete cascade,
  location    text,
  attributes  jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ── Personas (config-as-data) ────────────────────────────
create table if not exists personas (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  slug                 text not null,
  title                text not null,
  mission              text,
  definition           jsonb not null,
  referenced_documents text[] not null default '{}',
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, slug)
);

-- ── Garmin sync ───────────────────────────────────────────
create table if not exists garmin_metrics (
  id         bigserial primary key,
  user_id    uuid not null references users(id) on delete cascade,
  date       date not null,
  category   text not null,
  metric     text not null,
  value      numeric not null,
  unit       text,
  synced_at  timestamptz not null default now(),
  unique (user_id, date, metric)
);
create index if not exists garmin_metrics_user_category_date_idx on garmin_metrics (user_id, category, date);

create table if not exists garmin_activities (
  id                          bigserial primary key,
  user_id                     uuid not null references users(id) on delete cascade,
  activity_id                 bigint not null,
  date                        date not null,
  start_time                  timestamptz not null,
  activity_type               text not null,
  activity_name               text,
  duration_seconds            numeric,
  distance_m                  numeric,
  calories                    numeric,
  average_hr                  numeric,
  max_hr                      numeric,
  aerobic_training_effect     numeric,
  anaerobic_training_effect   numeric,
  training_effect_label       text,
  activity_training_load      numeric,
  moderate_intensity_minutes  numeric,
  vigorous_intensity_minutes  numeric,
  vo2_max                     numeric,
  raw                         jsonb not null,
  synced_at                   timestamptz not null default now(),
  unique (user_id, activity_id)
);
create index if not exists garmin_activities_user_date_idx on garmin_activities (user_id, date);

-- ── Plans (persona-generated, versioned) ─────────────────
create table if not exists plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  persona_id  uuid not null references personas(id) on delete cascade,
  date        date not null,
  created_at  timestamptz not null default now(),
  unique (persona_id, date)
);

create table if not exists plan_versions (
  id        bigserial primary key,
  plan_id   uuid not null references plans(id) on delete cascade,
  version   integer not null,
  content   text not null,
  saved_at  timestamptz not null default now(),
  unique (plan_id, version)
);

-- ── Chat sessions (currently in-memory only) ─────────────
create table if not exists chat_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  persona_id      uuid references personas(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now()
);

create table if not exists chat_messages (
  id          bigserial primary key,
  session_id  uuid not null references chat_sessions(id) on delete cascade,
  role        text not null check (role in ('user', 'model')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_session_created_idx on chat_messages (session_id, created_at);
