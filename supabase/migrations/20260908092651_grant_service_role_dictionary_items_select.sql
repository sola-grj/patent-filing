-- Server-side dictionary caching uses the service-role client. The local
-- service_role needs table-level SELECT in addition to its RLS bypass.
grant select on table public.dictionary_items to service_role;
