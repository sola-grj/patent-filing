alter table public.translation_requests
add column if not exists draft_payload jsonb not null default '{}'::jsonb,
add column if not exists last_draft_step text;
