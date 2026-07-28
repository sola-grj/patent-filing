do $$
begin
  create type public.patent_processing_status as enum (
    'pending',
    'processing',
    'completed',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.patents
  add column if not exists processing_status public.patent_processing_status
    not null default 'pending',
  add column if not exists analysis_snapshot jsonb
    not null default '{}'::jsonb,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_completed_at timestamptz,
  add column if not exists processing_error text;

create index if not exists patents_processing_queue_idx
  on public.patents(processing_status, processing_started_at)
  where processing_status in ('pending', 'processing', 'failed');
