alter table public.translation_requirements
  add column target_languages text[];

update public.translation_requirements
set target_languages = array[target_language]
where target_languages is null or cardinality(target_languages) = 0;

alter table public.translation_requirements
  alter column target_languages set not null;

alter table public.translation_requirements
  add constraint translation_requirements_target_languages_nonempty
  check (cardinality(target_languages) > 0);
