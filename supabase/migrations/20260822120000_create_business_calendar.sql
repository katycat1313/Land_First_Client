-- Unified business calendar for outreach targets, follow-ups, tasks, and activities.
-- Browser clients access this data through the password-protected Worker API only.

create extension if not exists pgcrypto;

create table if not exists public.business_calendar_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('outreach', 'follow_up', 'task', 'activity')),
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '' check (char_length(description) <= 4000),
  scheduled_date date not null,
  scheduled_time time,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'skipped')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  target_count integer check (target_count is null or target_count between 1 and 1000),
  completed_count integer not null default 0 check (completed_count between 0 and 1000),
  opportunity_id text,
  source text not null default 'user' check (source in ('user', 'pac', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_calendar_date_status_idx
  on public.business_calendar_items (scheduled_date, status);

create index if not exists business_calendar_opportunity_idx
  on public.business_calendar_items (opportunity_id)
  where opportunity_id is not null;

alter table public.business_calendar_items enable row level security;
revoke all on table public.business_calendar_items from anon, authenticated;
grant select, insert, update, delete on table public.business_calendar_items to service_role;

comment on table public.business_calendar_items is 'Real business execution plan shared by the founder and P.A.C.';
