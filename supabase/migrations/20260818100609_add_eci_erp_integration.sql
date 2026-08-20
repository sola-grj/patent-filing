create table public.eci_erp_tokens (
  provider text primary key,
  access_token_ciphertext text not null,
  encryption_iv text not null,
  encryption_tag text not null,
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider = lower(trim(provider)))
);

comment on table public.eci_erp_tokens is
  'Encrypted server-side access tokens for the ECI ERP integration.';

create table public.eci_erp_customers (
  client_id bigint primary key,
  client_name text not null,
  normalized_login text not null,
  company_name text not null,
  is_black boolean not null default false,
  organization_id uuid references public.organizations(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  raw_snapshot jsonb not null default '{}'::jsonb,
  sync_error text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_name = trim(client_name)),
  check (normalized_login = lower(trim(normalized_login))),
  check (company_name = trim(company_name))
);

create index eci_erp_customers_normalized_login_idx
  on public.eci_erp_customers(normalized_login);
create index eci_erp_customers_organization_idx
  on public.eci_erp_customers(organization_id)
  where organization_id is not null;
create unique index eci_erp_customers_auth_user_unique_idx
  on public.eci_erp_customers(auth_user_id)
  where auth_user_id is not null;

comment on table public.eci_erp_customers is
  'Server-only mapping between ERP patent customers and Pat organizations/users.';

create table public.eci_erp_sync_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running',
  source_count integer not null default 0,
  success_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('running', 'succeeded', 'partial', 'failed')),
  check (source_count >= 0 and success_count >= 0 and error_count >= 0)
);

create index eci_erp_sync_runs_started_idx
  on public.eci_erp_sync_runs(started_at desc);
create unique index eci_erp_sync_runs_one_running_idx
  on public.eci_erp_sync_runs((true))
  where status = 'running';

create table public.eci_erp_integration_errors (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  external_identifier text,
  error_code text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index eci_erp_integration_errors_created_idx
  on public.eci_erp_integration_errors(created_at desc);

create trigger set_eci_erp_tokens_updated_at
before update on public.eci_erp_tokens
for each row execute function public.set_updated_at();

create trigger set_eci_erp_customers_updated_at
before update on public.eci_erp_customers
for each row execute function public.set_updated_at();

create trigger set_eci_erp_sync_runs_updated_at
before update on public.eci_erp_sync_runs
for each row execute function public.set_updated_at();

alter table public.eci_erp_tokens enable row level security;
alter table public.eci_erp_customers enable row level security;
alter table public.eci_erp_sync_runs enable row level security;
alter table public.eci_erp_integration_errors enable row level security;

revoke all on table public.eci_erp_tokens from anon, authenticated;
revoke all on table public.eci_erp_customers from anon, authenticated;
revoke all on table public.eci_erp_sync_runs from anon, authenticated;
revoke all on table public.eci_erp_integration_errors from anon, authenticated;

grant select, insert, update, delete on table public.eci_erp_tokens to service_role;
grant select, insert, update, delete on table public.eci_erp_customers to service_role;
grant select, insert, update, delete on table public.eci_erp_sync_runs to service_role;
grant select, insert, update, delete on table public.eci_erp_integration_errors to service_role;
