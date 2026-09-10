-- Server-side notification and email flows read the requester's contact email
-- with the service-role client. RLS bypass does not replace table privileges.
grant select on table public.profiles to service_role;
