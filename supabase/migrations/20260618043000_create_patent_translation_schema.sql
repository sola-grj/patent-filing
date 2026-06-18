create extension if not exists pgcrypto with schema extensions;

create type public.organization_type as enum ('customer', 'operations', 'translator_team');
create type public.organization_role as enum ('requester', 'pm', 'ops', 'translator', 'admin');
create type public.request_source_mode as enum ('patent_search', 'upload');
create type public.workflow_stage as enum (
  'draft',
  'submitted',
  'file_selection',
  'parsing',
  'configured',
  'quoted',
  'negotiation',
  'order_pending',
  'production',
  'completed',
  'closed'
);
create type public.request_lifecycle_status as enum (
  'responding',
  'negotiation',
  'in_progress',
  'rejected',
  'completed'
);
create type public.request_file_source as enum ('patent_search', 'upload');
create type public.request_file_status as enum (
  'uploaded',
  'validated',
  'confirmed',
  'parsing',
  'parsed',
  'rejected',
  'failed'
);
create type public.file_parse_status as enum ('pending', 'running', 'completed', 'failed', 'needs_review');
create type public.translation_scope_type as enum (
  'full_text',
  'claims_only',
  'abstract_only',
  'description_and_claims',
  'description_claims_abstract',
  'drawing_text',
  'office_action',
  'response_file',
  'custom_pages',
  'custom_paragraphs'
);
create type public.translation_purpose as enum (
  'overseas_filing',
  'pct_national_phase',
  'paris_convention',
  'european_validation',
  'agent_review',
  'internal_evaluation',
  'litigation_or_invalidity',
  'technical_reference'
);
create type public.translation_quality_level as enum (
  'machine_pretranslation',
  'standard_human',
  'patent_translator',
  'patent_translator_review',
  'patent_translator_native_review',
  'local_agent_review'
);
create type public.delivery_option as enum ('standard', 'expedited', 'custom');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'rejected', 'superseded', 'expired');
create type public.negotiation_status as enum ('open', 'pending_pm', 'accepted', 'rejected', 'countered', 'closed');
create type public.pm_decision as enum ('pending', 'reasonable', 'unreasonable', 'countered');
create type public.order_status as enum ('pending_confirmation', 'in_progress', 'closed', 'completed');
create type public.offline_confirmation_status as enum ('pending', 'confirmed', 'waived', 'failed');
create type public.translation_task_type as enum (
  'translation',
  'review',
  'native_review',
  'local_agent_review',
  'formatting',
  'delivery'
);
create type public.translation_task_status as enum (
  'assigned',
  'in_progress',
  'reviewing',
  'completed',
  'cancelled'
);
create type public.deliverable_status as enum ('draft', 'submitted', 'accepted', 'rejected');
create type public.comment_visibility as enum ('internal', 'requester', 'translator', 'all');

create sequence if not exists public.translation_request_no_seq;
create sequence if not exists public.translation_order_no_seq;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  phone text,
  default_language text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.organization_type not null default 'customer',
  billing_info jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, role)
);

create table public.translation_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique default (
    'REQ-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.translation_request_no_seq')::text, 6, '0')
  ),
  organization_id uuid not null references public.organizations(id),
  requester_id uuid not null references auth.users(id),
  source_mode public.request_source_mode not null,
  workflow_stage public.workflow_stage not null default 'draft',
  requester_status public.request_lifecycle_status not null default 'responding',
  pm_status public.request_lifecycle_status not null default 'responding',
  title text,
  special_requirements text,
  submitted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patent_searches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.translation_requests(id) on delete cascade,
  query text not null,
  detected_patent_type text,
  status text not null default 'pending',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patent_candidates (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.patent_searches(id) on delete cascade,
  patent_number text,
  title text,
  jurisdiction text,
  application_no text,
  publication_no text,
  applicants jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patent_file_versions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.patent_candidates(id) on delete cascade,
  version_label text,
  file_type text,
  language text,
  source_url text,
  is_selected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.translation_requests(id) on delete cascade,
  source public.request_file_source not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_role text,
  language text,
  version_label text,
  confirmed_for_translation boolean not null default false,
  status public.request_file_status not null default 'uploaded',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table public.file_parse_results (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null unique references public.request_files(id) on delete cascade,
  parse_status public.file_parse_status not null default 'pending',
  text_storage_path text,
  word_count integer not null default 0 check (word_count >= 0),
  page_count integer not null default 0 check (page_count >= 0),
  claim_count integer not null default 0 check (claim_count >= 0),
  technical_fields text[] not null default '{}'::text[],
  structure_json jsonb not null default '{}'::jsonb,
  ocr_required boolean not null default false,
  manual_review_required boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.translation_requirements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.translation_requests(id) on delete cascade,
  source_language text not null,
  target_language text not null,
  scope_type public.translation_scope_type not null,
  scope_details jsonb not null default '{}'::jsonb,
  purpose public.translation_purpose not null,
  quality_level public.translation_quality_level not null,
  delivery_option public.delivery_option not null default 'standard',
  due_at timestamptz,
  is_urgent boolean not null default false,
  terminology_notes text,
  config_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terminology_glossaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  source_language text not null,
  target_language text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terminology_entries (
  id uuid primary key default gen_random_uuid(),
  glossary_id uuid not null references public.terminology_glossaries(id) on delete cascade,
  source_term text not null,
  target_term text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pricing_rule_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'USD',
  is_active boolean not null default false,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.pricing_rule_sets(id) on delete cascade,
  factor_type text not null,
  factor_key text not null,
  multiplier numeric(12, 4),
  fixed_amount numeric(12, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_set_id, factor_type, factor_key)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.translation_requests(id) on delete cascade,
  rule_set_id uuid references public.pricing_rule_sets(id),
  version_no integer not null default 1 check (version_no > 0),
  status public.quote_status not null default 'draft',
  currency text not null default 'USD',
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  estimated_delivery_at timestamptz,
  valid_until timestamptz,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  breakdown_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, version_no)
);

create table public.quote_negotiations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.translation_requests(id) on delete cascade,
  quote_id uuid references public.quotes(id),
  initiated_by uuid references auth.users(id),
  expected_amount numeric(12, 2) check (expected_amount is null or expected_amount >= 0),
  expected_delivery_at timestamptz,
  adjustment_notes text,
  reject_reason text,
  pm_decision public.pm_decision not null default 'pending',
  status public.negotiation_status not null default 'open',
  response_quote_id uuid references public.quotes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default (
    'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.translation_order_no_seq')::text, 6, '0')
  ),
  request_id uuid not null unique references public.translation_requests(id),
  accepted_quote_id uuid references public.quotes(id),
  organization_id uuid not null references public.organizations(id),
  requester_id uuid not null references auth.users(id),
  status public.order_status not null default 'pending_confirmation',
  offline_confirmation_status public.offline_confirmation_status not null default 'pending',
  confirmed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.translation_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  request_file_id uuid references public.request_files(id),
  assigned_pm_id uuid references auth.users(id),
  assigned_translator_id uuid references auth.users(id),
  task_type public.translation_task_type not null default 'translation',
  status public.translation_task_status not null default 'assigned',
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_deliverables (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.translation_tasks(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  version_no integer not null default 1 check (version_no > 0),
  language text,
  submitted_by uuid references auth.users(id),
  status public.deliverable_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, version_no)
);

create table public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.translation_requests(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  author_id uuid not null references auth.users(id),
  body text not null,
  visibility public.comment_visibility not null default 'all',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_members_user_id_idx on public.organization_members(user_id);
create index translation_requests_org_stage_idx on public.translation_requests(organization_id, workflow_stage);
create index translation_requests_requester_idx on public.translation_requests(requester_id);
create index patent_searches_request_id_idx on public.patent_searches(request_id);
create index patent_candidates_search_id_idx on public.patent_candidates(search_id);
create index patent_file_versions_candidate_id_idx on public.patent_file_versions(candidate_id);
create index request_files_request_id_idx on public.request_files(request_id);
create index file_parse_results_file_id_idx on public.file_parse_results(file_id);
create index quotes_request_status_idx on public.quotes(request_id, status);
create index quote_negotiations_request_status_idx on public.quote_negotiations(request_id, status);
create index orders_org_status_idx on public.orders(organization_id, status);
create index translation_tasks_order_status_idx on public.translation_tasks(order_id, status);
create index translation_tasks_translator_idx on public.translation_tasks(assigned_translator_id);
create index request_events_request_created_idx on public.request_events(request_id, created_at desc);
create index comments_entity_idx on public.comments(entity_type, entity_id);
create index notifications_recipient_read_idx on public.notifications(recipient_id, read_at);

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger set_organization_members_updated_at before update on public.organization_members for each row execute function public.set_updated_at();
create trigger set_translation_requests_updated_at before update on public.translation_requests for each row execute function public.set_updated_at();
create trigger set_patent_searches_updated_at before update on public.patent_searches for each row execute function public.set_updated_at();
create trigger set_patent_candidates_updated_at before update on public.patent_candidates for each row execute function public.set_updated_at();
create trigger set_patent_file_versions_updated_at before update on public.patent_file_versions for each row execute function public.set_updated_at();
create trigger set_request_files_updated_at before update on public.request_files for each row execute function public.set_updated_at();
create trigger set_file_parse_results_updated_at before update on public.file_parse_results for each row execute function public.set_updated_at();
create trigger set_translation_requirements_updated_at before update on public.translation_requirements for each row execute function public.set_updated_at();
create trigger set_terminology_glossaries_updated_at before update on public.terminology_glossaries for each row execute function public.set_updated_at();
create trigger set_terminology_entries_updated_at before update on public.terminology_entries for each row execute function public.set_updated_at();
create trigger set_pricing_rule_sets_updated_at before update on public.pricing_rule_sets for each row execute function public.set_updated_at();
create trigger set_pricing_rules_updated_at before update on public.pricing_rules for each row execute function public.set_updated_at();
create trigger set_quotes_updated_at before update on public.quotes for each row execute function public.set_updated_at();
create trigger set_quote_negotiations_updated_at before update on public.quote_negotiations for each row execute function public.set_updated_at();
create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger set_translation_tasks_updated_at before update on public.translation_tasks for each row execute function public.set_updated_at();
create trigger set_task_deliverables_updated_at before update on public.task_deliverables for each row execute function public.set_updated_at();
create trigger set_comments_updated_at before update on public.comments for each row execute function public.set_updated_at();
create trigger set_notifications_updated_at before update on public.notifications for each row execute function public.set_updated_at();

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.user_id = auth.uid()
      and member.role in ('pm', 'ops', 'admin')
  );
$$;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_org_id
      and member.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles public.organization_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_org_id
      and member.user_id = auth.uid()
      and member.role = any(allowed_roles)
  );
$$;

create or replace function public.can_access_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.translation_requests request
    where request.id = target_request_id
      and (
        request.requester_id = auth.uid()
        or public.is_org_member(request.organization_id)
        or public.is_platform_staff()
      )
  );
$$;

create or replace function public.can_access_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders ord
    where ord.id = target_order_id
      and (
        ord.requester_id = auth.uid()
        or public.is_org_member(ord.organization_id)
        or public.is_platform_staff()
      )
  );
$$;

create or replace function public.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.translation_tasks task
    join public.orders ord on ord.id = task.order_id
    where task.id = target_task_id
      and (
        task.assigned_pm_id = auth.uid()
        or task.assigned_translator_id = auth.uid()
        or ord.requester_id = auth.uid()
        or public.is_org_member(ord.organization_id)
        or public.is_platform_staff()
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.translation_requests enable row level security;
alter table public.patent_searches enable row level security;
alter table public.patent_candidates enable row level security;
alter table public.patent_file_versions enable row level security;
alter table public.request_files enable row level security;
alter table public.file_parse_results enable row level security;
alter table public.translation_requirements enable row level security;
alter table public.terminology_glossaries enable row level security;
alter table public.terminology_entries enable row level security;
alter table public.pricing_rule_sets enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_negotiations enable row level security;
alter table public.orders enable row level security;
alter table public.translation_tasks enable row level security;
alter table public.task_deliverables enable row level security;
alter table public.request_events enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy "Profiles are visible to owner and staff" on public.profiles for select using (user_id = auth.uid() or public.is_platform_staff());
create policy "Profiles can be inserted by owner" on public.profiles for insert with check (user_id = auth.uid());
create policy "Profiles can be updated by owner or staff" on public.profiles for update using (user_id = auth.uid() or public.is_platform_staff()) with check (user_id = auth.uid() or public.is_platform_staff());

create policy "Organizations are visible to members and staff" on public.organizations for select using (public.is_org_member(id) or public.is_platform_staff());
create policy "Organizations can be inserted by staff" on public.organizations for insert with check (public.is_platform_staff());
create policy "Organizations can be updated by admins and staff" on public.organizations for update using (public.has_org_role(id, array['admin']::public.organization_role[]) or public.is_platform_staff());

create policy "Organization members are visible to members and staff" on public.organization_members for select using (user_id = auth.uid() or public.is_org_member(organization_id) or public.is_platform_staff());
create policy "Organization members can be managed by staff" on public.organization_members for all using (public.is_platform_staff()) with check (public.is_platform_staff());

create policy "Requests are visible to participants" on public.translation_requests for select using (public.can_access_request(id));
create policy "Requests can be created by org members" on public.translation_requests for insert with check ((requester_id = auth.uid() and public.is_org_member(organization_id)) or public.is_platform_staff());
create policy "Requests can be updated by participants" on public.translation_requests for update using (public.can_access_request(id)) with check (public.can_access_request(id));

create policy "Patent searches follow request access" on public.patent_searches for all using (public.can_access_request(request_id)) with check (public.can_access_request(request_id));
create policy "Patent candidates follow request access" on public.patent_candidates for all using (
  exists (
    select 1 from public.patent_searches search
    where search.id = search_id and public.can_access_request(search.request_id)
  )
) with check (
  exists (
    select 1 from public.patent_searches search
    where search.id = search_id and public.can_access_request(search.request_id)
  )
);
create policy "Patent file versions follow request access" on public.patent_file_versions for all using (
  exists (
    select 1
    from public.patent_candidates candidate
    join public.patent_searches search on search.id = candidate.search_id
    where candidate.id = candidate_id and public.can_access_request(search.request_id)
  )
) with check (
  exists (
    select 1
    from public.patent_candidates candidate
    join public.patent_searches search on search.id = candidate.search_id
    where candidate.id = candidate_id and public.can_access_request(search.request_id)
  )
);

create policy "Request files follow request access" on public.request_files for all using (public.can_access_request(request_id)) with check (public.can_access_request(request_id));
create policy "Parse results follow file access" on public.file_parse_results for all using (
  exists (
    select 1 from public.request_files file
    where file.id = file_id and public.can_access_request(file.request_id)
  )
) with check (
  exists (
    select 1 from public.request_files file
    where file.id = file_id and public.can_access_request(file.request_id)
  )
);
create policy "Translation requirements follow request access" on public.translation_requirements for all using (public.can_access_request(request_id)) with check (public.can_access_request(request_id));

create policy "Glossaries follow organization access" on public.terminology_glossaries for all using (public.is_org_member(organization_id) or public.is_platform_staff()) with check (public.is_org_member(organization_id) or public.is_platform_staff());
create policy "Terminology entries follow glossary access" on public.terminology_entries for all using (
  exists (
    select 1 from public.terminology_glossaries glossary
    where glossary.id = glossary_id and (public.is_org_member(glossary.organization_id) or public.is_platform_staff())
  )
) with check (
  exists (
    select 1 from public.terminology_glossaries glossary
    where glossary.id = glossary_id and (public.is_org_member(glossary.organization_id) or public.is_platform_staff())
  )
);

create policy "Pricing rule sets are visible to authenticated users" on public.pricing_rule_sets for select using (auth.uid() is not null);
create policy "Pricing rule sets are managed by staff" on public.pricing_rule_sets for all using (public.is_platform_staff()) with check (public.is_platform_staff());
create policy "Pricing rules are visible to authenticated users" on public.pricing_rules for select using (auth.uid() is not null);
create policy "Pricing rules are managed by staff" on public.pricing_rules for all using (public.is_platform_staff()) with check (public.is_platform_staff());

create policy "Quotes follow request access" on public.quotes for select using (public.can_access_request(request_id));
create policy "Quotes can be created by staff" on public.quotes for insert with check (public.is_platform_staff());
create policy "Quotes can be updated by request participants" on public.quotes for update using (public.can_access_request(request_id)) with check (public.can_access_request(request_id));

create policy "Negotiations follow request access" on public.quote_negotiations for all using (public.can_access_request(request_id)) with check (public.can_access_request(request_id));

create policy "Orders are visible to participants" on public.orders for select using (public.can_access_order(id));
create policy "Orders can be created by staff" on public.orders for insert with check (public.is_platform_staff());
create policy "Orders can be updated by staff" on public.orders for update using (public.is_platform_staff()) with check (public.is_platform_staff());

create policy "Tasks are visible to assigned users and staff" on public.translation_tasks for select using (public.can_access_task(id));
create policy "Tasks can be created by staff" on public.translation_tasks for insert with check (public.is_platform_staff());
create policy "Tasks can be updated by assigned users and staff" on public.translation_tasks for update using (public.can_access_task(id)) with check (public.can_access_task(id));

create policy "Deliverables follow task access" on public.task_deliverables for select using (public.can_access_task(task_id));
create policy "Deliverables can be created by task participants" on public.task_deliverables for insert with check (public.can_access_task(task_id) and (submitted_by = auth.uid() or public.is_platform_staff()));
create policy "Deliverables can be updated by task participants" on public.task_deliverables for update using (public.can_access_task(task_id)) with check (public.can_access_task(task_id));

create policy "Events are visible to workflow participants" on public.request_events for select using (
  public.is_platform_staff()
  or (request_id is not null and public.can_access_request(request_id))
  or (order_id is not null and public.can_access_order(order_id))
);
create policy "Events can be inserted by workflow participants" on public.request_events for insert with check (
  actor_id = auth.uid()
  and (
    public.is_platform_staff()
    or (request_id is not null and public.can_access_request(request_id))
    or (order_id is not null and public.can_access_order(order_id))
  )
);

create policy "Comments are visible to authenticated users" on public.comments for select using (auth.uid() is not null);
create policy "Comments can be created by author" on public.comments for insert with check (author_id = auth.uid());
create policy "Comments can be updated by author or staff" on public.comments for update using (author_id = auth.uid() or public.is_platform_staff()) with check (author_id = auth.uid() or public.is_platform_staff());

create policy "Notifications are visible to recipient and staff" on public.notifications for select using (recipient_id = auth.uid() or public.is_platform_staff());
create policy "Notifications can be created by staff" on public.notifications for insert with check (public.is_platform_staff());
create policy "Notifications can be updated by recipient or staff" on public.notifications for update using (recipient_id = auth.uid() or public.is_platform_staff()) with check (recipient_id = auth.uid() or public.is_platform_staff());
