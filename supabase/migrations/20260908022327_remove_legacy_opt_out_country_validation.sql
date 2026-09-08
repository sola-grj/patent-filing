-- Opt Out is now represented by the selected Traditional Validation service item.
-- The legacy opt_out_country_ids column remains for historical compatibility,
-- but new requests intentionally persist an empty array.
alter table public.translation_requirements
  drop constraint if exists translation_requirements_opt_out_scope_valid;
