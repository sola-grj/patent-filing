alter table public.translation_requests
  add column reference_no text;

create index translation_requests_requester_reference_no_idx
  on public.translation_requests (requester_id, reference_no)
  where reference_no is not null;
