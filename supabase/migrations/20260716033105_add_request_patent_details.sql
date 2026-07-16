alter table public.request_patents
  add column language text,
  add column first_priority_date date,
  add column international_filing_date date,
  add column filing_deadline_30_months date,
  add column filing_deadline_31_months date,
  add column total_pages integer not null default 0 check (total_pages >= 0);
