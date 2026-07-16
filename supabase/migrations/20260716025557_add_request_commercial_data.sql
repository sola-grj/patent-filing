create table public.dictionary_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  code text not null,
  label text not null,
  iso_country_code text,
  country_group text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, code)
);

insert into public.dictionary_items (category, code, label, sort_order) values
  ('request_channel', 'ep', 'EP', 10),
  ('request_channel', 'pct', 'PCT', 20),
  ('request_channel', 'paris_convention', 'Paris Convention', 30),
  ('request_channel', 'upload_files', 'Upload Files', 40),
  ('service_type', 'translation', 'Translation', 10),
  ('service_type', 'filing', 'Filing', 20),
  ('service_type', 'european_patent_grant_registration', 'European Patent Grant Registration', 30),
  ('service_type', 'epv', 'EPV', 40),
  ('filing_type', 'submission', 'Submission', 10),
  ('filing_type', 'annuity', 'Annuity', 20),
  ('application_type', 'invention', 'Invention', 10),
  ('application_type', 'utility_model', 'Utility Model', 20),
  ('application_type', 'design', 'Industrial Design', 30),
  ('application_type', 'trademark', 'Trademark', 40),
  ('entity_type', 'large_entity', 'Large', 10),
  ('entity_type', 'small_entity', 'Small', 20),
  ('entity_type', 'micro_entity', 'Micro', 30),
  ('epv_type', 'traditional_validation', 'Traditional Validation', 10),
  ('epv_type', 'unitary_effect', 'Unitary Effect', 20);

insert into public.dictionary_items
  (category, code, label, iso_country_code, country_group, sort_order)
values
  ('jurisdiction', 'BE', 'Belgium', 'BE', 'member', 10),
  ('jurisdiction', 'DE', 'Germany', 'DE', 'member', 20),
  ('jurisdiction', 'FR', 'France', 'FR', 'member', 30),
  ('jurisdiction', 'LU', 'Luxembourg', 'LU', 'member', 40),
  ('jurisdiction', 'NL', 'Netherlands', 'NL', 'member', 50),
  ('jurisdiction', 'CH', 'Switzerland', 'CH', 'member', 60),
  ('jurisdiction', 'GB', 'United Kingdom', 'GB', 'member', 70),
  ('jurisdiction', 'SE', 'Sweden', 'SE', 'member', 80),
  ('jurisdiction', 'IT', 'Italy', 'IT', 'member', 90),
  ('jurisdiction', 'AT', 'Austria', 'AT', 'member', 100),
  ('jurisdiction', 'LI', 'Liechtenstein', 'LI', 'member', 110),
  ('jurisdiction', 'GR', 'Greece', 'GR', 'member', 120),
  ('jurisdiction', 'ES', 'Spain', 'ES', 'member', 130),
  ('jurisdiction', 'DK', 'Denmark', 'DK', 'member', 140),
  ('jurisdiction', 'MC', 'Monaco', 'MC', 'member', 150),
  ('jurisdiction', 'PT', 'Portugal', 'PT', 'member', 160),
  ('jurisdiction', 'IE', 'Ireland', 'IE', 'member', 170),
  ('jurisdiction', 'FI', 'Finland', 'FI', 'member', 180),
  ('jurisdiction', 'CY', 'Cyprus', 'CY', 'member', 190),
  ('jurisdiction', 'TR', 'Türkiye', 'TR', 'member', 200),
  ('jurisdiction', 'BG', 'Bulgaria', 'BG', 'member', 210),
  ('jurisdiction', 'CZ', 'Czech Republic', 'CZ', 'member', 220),
  ('jurisdiction', 'EE', 'Estonia', 'EE', 'member', 230),
  ('jurisdiction', 'SK', 'Slovakia', 'SK', 'member', 240),
  ('jurisdiction', 'SI', 'Slovenia', 'SI', 'member', 250),
  ('jurisdiction', 'HU', 'Hungary', 'HU', 'member', 260),
  ('jurisdiction', 'RO', 'Romania', 'RO', 'member', 270),
  ('jurisdiction', 'PL', 'Poland', 'PL', 'member', 280),
  ('jurisdiction', 'IS', 'Iceland', 'IS', 'member', 290),
  ('jurisdiction', 'LT', 'Lithuania', 'LT', 'member', 300),
  ('jurisdiction', 'LV', 'Latvia', 'LV', 'member', 310),
  ('jurisdiction', 'MT', 'Malta', 'MT', 'member', 320),
  ('jurisdiction', 'HR', 'Croatia', 'HR', 'member', 330),
  ('jurisdiction', 'NO', 'Norway', 'NO', 'member', 340),
  ('jurisdiction', 'MK', 'North Macedonia', 'MK', 'member', 350),
  ('jurisdiction', 'SM', 'San Marino', 'SM', 'member', 360),
  ('jurisdiction', 'AL', 'Albania', 'AL', 'member', 370),
  ('jurisdiction', 'RS', 'Serbia', 'RS', 'member', 380),
  ('jurisdiction', 'ME', 'Montenegro', 'ME', 'member', 390),
  ('jurisdiction', 'MD', 'Republic of Moldova', 'MD', 'member', 400),
  ('jurisdiction', 'BA', 'Bosnia and Herzegovina', 'BA', 'extension', 410),
  ('jurisdiction', 'MA', 'Morocco', 'MA', 'validation', 420),
  ('jurisdiction', 'TN', 'Tunisia', 'TN', 'validation', 430),
  ('jurisdiction', 'KH', 'Cambodia', 'KH', 'validation', 440),
  ('jurisdiction', 'GE', 'Georgia', 'GE', 'validation', 450),
  ('jurisdiction', 'LA', 'Lao People''s Democratic Republic', 'LA', 'validation', 460);

alter table public.translation_requests
  add column channel_code text;

alter table public.translation_requirements
  add column filing_type_code text,
  add column application_type_code text,
  add column entity_type_code text,
  add column epv_type_code text,
  add column jurisdiction_codes text[] not null default '{}'::text[];

update public.translation_requests
set channel_code = case
  when source_mode = 'upload' then 'upload_files'
  when draft_payload #>> '{config,purpose}' = 'european_validation' then 'ep'
  when draft_payload #>> '{config,purpose}' = 'pct_national_phase' then 'pct'
  when draft_payload #>> '{config,purpose}' = 'paris_convention' then 'paris_convention'
  else null
end;

update public.translation_requirements
set
  filing_type_code = nullif(config_snapshot ->> 'filingType', ''),
  application_type_code = nullif(config_snapshot ->> 'filingApplicationType', ''),
  entity_type_code = coalesce(nullif(config_snapshot ->> 'entityType', ''), entity_type::text),
  epv_type_code = nullif(config_snapshot ->> 'epvType', '')
where config_snapshot <> '{}'::jsonb or entity_type is not null;

create table public.request_patents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.translation_requests(id) on delete cascade,
  patent_number text not null,
  application_no text,
  publication_no text,
  title text,
  abstract text,
  jurisdiction text,
  source text,
  applicants jsonb not null default '[]'::jsonb,
  inventors jsonb not null default '[]'::jsonb,
  filing_date date,
  publication_date date,
  legal_status text,
  ipc_codes text[] not null default '{}'::text[],
  cpc_codes text[] not null default '{}'::text[],
  abstract_word_count integer not null default 0 check (abstract_word_count >= 0),
  description_word_count integer not null default 0 check (description_word_count >= 0),
  claims_word_count integer not null default 0 check (claims_word_count >= 0),
  claims_count integer not null default 0 check (claims_count >= 0),
  drawing_count integer not null default 0 check (drawing_count >= 0),
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dictionary_items_category_active_idx
  on public.dictionary_items(category, is_active, sort_order);
create index translation_requests_channel_idx on public.translation_requests(channel_code);
create index request_patents_patent_number_idx on public.request_patents(patent_number);

create trigger set_dictionary_items_updated_at
before update on public.dictionary_items
for each row execute function public.set_updated_at();

create trigger set_request_patents_updated_at
before update on public.request_patents
for each row execute function public.set_updated_at();

alter table public.dictionary_items enable row level security;
alter table public.request_patents enable row level security;

grant select on public.dictionary_items to authenticated;
grant select, insert, update, delete on public.request_patents to authenticated;

create policy "Authenticated users can read active dictionaries"
on public.dictionary_items for select
to authenticated
using (is_active);

create policy "Request patents follow request access"
on public.request_patents for all
to authenticated
using (public.can_access_request(request_id))
with check (public.can_access_request(request_id));
