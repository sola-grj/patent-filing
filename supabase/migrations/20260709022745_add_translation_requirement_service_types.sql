create type public.translation_service_type as enum (
  'translation',
  'filing',
  'european_patent_grant_registration',
  'epv'
);

create type public.patent_entity_type as enum (
  'large_entity',
  'small_entity',
  'micro_entity'
);

alter table public.translation_requirements
  add column service_types public.translation_service_type[],
  add column entity_type public.patent_entity_type;

update public.translation_requirements
set service_types = array['translation']::public.translation_service_type[]
where service_types is null or cardinality(service_types) = 0;

alter table public.translation_requirements
  alter column service_types set not null;

alter table public.translation_requirements
  add constraint translation_requirements_service_types_nonempty
  check (cardinality(service_types) > 0);
