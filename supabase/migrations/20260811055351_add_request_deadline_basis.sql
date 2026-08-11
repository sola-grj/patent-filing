alter table public.request_patents
  add column grant_publication_date date,
  add column rule_71_3_communication_date date;

alter table public.translation_requirements
  add column pct_chapter_code text
  check (pct_chapter_code is null or pct_chapter_code in ('chapter_i', 'chapter_ii'));

update public.translation_requirements as requirement
set pct_chapter_code = 'chapter_i'
from public.translation_requests as request
where request.id = requirement.request_id
  and request.channel_code = 'pct'
  and 'filing' = any(requirement.service_types)
  and requirement.pct_chapter_code is null;

comment on column public.request_patents.grant_publication_date is
  'First B1 publication date from the official European Patent Register.';

comment on column public.request_patents.rule_71_3_communication_date is
  'Latest IGRA DATE_OF_DISPATCH from the official European Patent Register.';

comment on column public.translation_requirements.pct_chapter_code is
  'PCT national-phase deadline column: chapter_i uses Article 22; chapter_ii uses Article 39(1).';
