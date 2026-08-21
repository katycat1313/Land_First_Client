-- Durable P.A.C. conversation threads and message history.
-- Access is server-only through the service role; browser clients use the
-- password-protected application API and never receive Supabase credentials.

create extension if not exists pgcrypto;

create table if not exists public.pac_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null unique,
  title text not null default 'P.A.C. Partner Conversation',
  rolling_summary text not null default '',
  personalization jsonb not null default '{}'::jsonb,
  summarized_message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.pac_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.pac_conversations(id) on delete cascade,
  client_message_id text not null unique,
  role text not null check (role in ('user', 'pac', 'system')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists pac_messages_conversation_created_idx
  on public.pac_messages (conversation_id, created_at desc);

create index if not exists pac_conversations_last_message_idx
  on public.pac_conversations (last_message_at desc);

alter table public.pac_conversations enable row level security;
alter table public.pac_messages enable row level security;

revoke all on table public.pac_conversations from anon, authenticated;
revoke all on table public.pac_messages from anon, authenticated;
grant select, insert, update, delete on table public.pac_conversations to service_role;
grant select, insert, update, delete on table public.pac_messages to service_role;
grant usage, select on sequence public.pac_messages_id_seq to service_role;

comment on table public.pac_conversations is 'Persistent P.A.C. conversation threads with distilled long-term personalization.';
comment on table public.pac_messages is 'Ordered, deduplicated P.A.C. chat turns retained for conversational continuity.';
