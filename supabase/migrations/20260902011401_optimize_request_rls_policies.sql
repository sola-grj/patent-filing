-- FOR ALL policies also participate in SELECT, so the previous paired
-- SELECT/FOR ALL policies evaluated both permission branches on every read.

drop policy if exists "Request files follow request read access" on public.request_files;
drop policy if exists "Request files follow request manage access" on public.request_files;
create policy "Request files follow request read access"
on public.request_files for select to authenticated
using (
  private.can_read_request(request_files.request_id)
  or exists (
    select 1
    from public.orders request_order
    join public.translation_tasks task on task.order_id = request_order.id
    where request_order.request_id = request_files.request_id
      and task.assigned_translator_id = (select auth.uid())
      and (task.request_file_id is null or task.request_file_id = request_files.id)
  )
);
create policy "Request files follow request insert access"
on public.request_files for insert to authenticated
with check (private.can_manage_request(request_id));
create policy "Request files follow request update access"
on public.request_files for update to authenticated
using (private.can_manage_request(request_id))
with check (private.can_manage_request(request_id));
create policy "Request files follow request delete access"
on public.request_files for delete to authenticated
using (private.can_manage_request(request_id));

drop policy if exists "Patent searches follow request manage access" on public.patent_searches;
create policy "Patent searches follow request insert access"
on public.patent_searches for insert to authenticated
with check (private.can_manage_request(request_id));
create policy "Patent searches follow request update access"
on public.patent_searches for update to authenticated
using (private.can_manage_request(request_id)) with check (private.can_manage_request(request_id));
create policy "Patent searches follow request delete access"
on public.patent_searches for delete to authenticated
using (private.can_manage_request(request_id));

drop policy if exists "Requirements follow request manage access" on public.translation_requirements;
create policy "Requirements follow request insert access"
on public.translation_requirements for insert to authenticated
with check (private.can_manage_request(request_id));
create policy "Requirements follow request update access"
on public.translation_requirements for update to authenticated
using (private.can_manage_request(request_id)) with check (private.can_manage_request(request_id));
create policy "Requirements follow request delete access"
on public.translation_requirements for delete to authenticated
using (private.can_manage_request(request_id));

drop policy if exists "Request patents follow request manage access" on public.request_patents;
create policy "Request patents follow request insert access"
on public.request_patents for insert to authenticated
with check (private.can_manage_request(request_id));
create policy "Request patents follow request update access"
on public.request_patents for update to authenticated
using (private.can_manage_request(request_id)) with check (private.can_manage_request(request_id));
create policy "Request patents follow request delete access"
on public.request_patents for delete to authenticated
using (private.can_manage_request(request_id));

drop policy if exists "Config versions follow request manage access" on public.request_config_versions;
create policy "Config versions follow request insert access"
on public.request_config_versions for insert to authenticated
with check (private.can_manage_request(request_id));
create policy "Config versions follow request update access"
on public.request_config_versions for update to authenticated
using (private.can_manage_request(request_id)) with check (private.can_manage_request(request_id));
create policy "Config versions follow request delete access"
on public.request_config_versions for delete to authenticated
using (private.can_manage_request(request_id));

drop policy if exists "Quotes follow request manage access" on public.quotes;
create policy "Quotes follow request insert access"
on public.quotes for insert to authenticated
with check (private.can_manage_request(request_id));
create policy "Quotes follow request update access"
on public.quotes for update to authenticated
using (private.can_manage_request(request_id)) with check (private.can_manage_request(request_id));
create policy "Quotes follow request delete access"
on public.quotes for delete to authenticated
using (private.can_manage_request(request_id));

drop policy if exists "Negotiations follow request manage access" on public.quote_negotiations;
create policy "Negotiations follow request insert access"
on public.quote_negotiations for insert to authenticated
with check (private.can_manage_request(request_id));
create policy "Negotiations follow request update access"
on public.quote_negotiations for update to authenticated
using (private.can_manage_request(request_id)) with check (private.can_manage_request(request_id));
create policy "Negotiations follow request delete access"
on public.quote_negotiations for delete to authenticated
using (private.can_manage_request(request_id));

drop policy if exists "Parse results follow request manage access" on public.file_parse_results;
create policy "Parse results follow request insert access"
on public.file_parse_results for insert to authenticated
with check (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
));
create policy "Parse results follow request update access"
on public.file_parse_results for update to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
)) with check (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
));
create policy "Parse results follow request delete access"
on public.file_parse_results for delete to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
));

drop policy if exists "Parse jobs follow request manage access" on public.file_parse_jobs;
create policy "Parse jobs follow request insert access"
on public.file_parse_jobs for insert to authenticated
with check (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
));
create policy "Parse jobs follow request update access"
on public.file_parse_jobs for update to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
)) with check (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
));
create policy "Parse jobs follow request delete access"
on public.file_parse_jobs for delete to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
));

-- Keep the read policy on parse results from re-querying the same file through
-- private.can_read_request_file(file.id).
drop policy if exists "Parse results follow request read access" on public.file_parse_results;
create policy "Parse results follow request read access"
on public.file_parse_results for select to authenticated
using (exists (
  select 1
  from public.request_files file
  where file.id = file_parse_results.file_id
    and (
      private.can_read_request(file.request_id)
      or exists (
        select 1
        from public.orders request_order
        join public.translation_tasks task on task.order_id = request_order.id
        where request_order.request_id = file.request_id
          and task.assigned_translator_id = (select auth.uid())
          and (task.request_file_id is null or task.request_file_id = file.id)
      )
    )
));

drop policy if exists "Patent candidates follow request manage access" on public.patent_candidates;
create policy "Patent candidates follow request insert access" on public.patent_candidates
for insert to authenticated with check (exists (
  select 1 from public.patent_searches search
  where search.id = search_id and private.can_manage_request(search.request_id)
));
create policy "Patent candidates follow request update access" on public.patent_candidates
for update to authenticated using (exists (
  select 1 from public.patent_searches search
  where search.id = search_id and private.can_manage_request(search.request_id)
)) with check (exists (
  select 1 from public.patent_searches search
  where search.id = search_id and private.can_manage_request(search.request_id)
));
create policy "Patent candidates follow request delete access" on public.patent_candidates
for delete to authenticated using (exists (
  select 1 from public.patent_searches search
  where search.id = search_id and private.can_manage_request(search.request_id)
));

drop policy if exists "Patent file versions follow request manage access" on public.patent_file_versions;
create policy "Patent file versions follow request insert access" on public.patent_file_versions
for insert to authenticated with check (exists (
  select 1 from public.patent_candidates candidate
  join public.patent_searches search on search.id = candidate.search_id
  where candidate.id = candidate_id and private.can_manage_request(search.request_id)
));
create policy "Patent file versions follow request update access" on public.patent_file_versions
for update to authenticated using (exists (
  select 1 from public.patent_candidates candidate
  join public.patent_searches search on search.id = candidate.search_id
  where candidate.id = candidate_id and private.can_manage_request(search.request_id)
)) with check (exists (
  select 1 from public.patent_candidates candidate
  join public.patent_searches search on search.id = candidate.search_id
  where candidate.id = candidate_id and private.can_manage_request(search.request_id)
));
create policy "Patent file versions follow request delete access" on public.patent_file_versions
for delete to authenticated using (exists (
  select 1 from public.patent_candidates candidate
  join public.patent_searches search on search.id = candidate.search_id
  where candidate.id = candidate_id and private.can_manage_request(search.request_id)
));

drop policy if exists "Config files follow request manage access" on public.request_config_files;
create policy "Config files follow request insert access" on public.request_config_files
for insert to authenticated with check (exists (
  select 1 from public.request_config_versions config
  where config.id = config_version_id and private.can_manage_request(config.request_id)
));
create policy "Config files follow request update access" on public.request_config_files
for update to authenticated using (exists (
  select 1 from public.request_config_versions config
  where config.id = config_version_id and private.can_manage_request(config.request_id)
)) with check (exists (
  select 1 from public.request_config_versions config
  where config.id = config_version_id and private.can_manage_request(config.request_id)
));
create policy "Config files follow request delete access" on public.request_config_files
for delete to authenticated using (exists (
  select 1 from public.request_config_versions config
  where config.id = config_version_id and private.can_manage_request(config.request_id)
));

drop policy if exists "Quote items follow request manage access" on public.quote_items;
create policy "Quote items follow request insert access" on public.quote_items
for insert to authenticated with check (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
));
create policy "Quote items follow request update access" on public.quote_items
for update to authenticated using (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
)) with check (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
));
create policy "Quote items follow request delete access" on public.quote_items
for delete to authenticated using (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
));

drop policy if exists "Quote factors follow request manage access" on public.quote_factor_snapshots;
create policy "Quote factors follow request insert access" on public.quote_factor_snapshots
for insert to authenticated with check (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
));
create policy "Quote factors follow request update access" on public.quote_factor_snapshots
for update to authenticated using (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
)) with check (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
));
create policy "Quote factors follow request delete access" on public.quote_factor_snapshots
for delete to authenticated using (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
));

drop policy if exists "Negotiation messages follow request manage access" on public.quote_negotiation_messages;
create policy "Negotiation messages follow request insert access" on public.quote_negotiation_messages
for insert to authenticated with check (exists (
  select 1 from public.quote_negotiations negotiation
  where negotiation.id = negotiation_id and private.can_manage_request(negotiation.request_id)
));
create policy "Negotiation messages follow request update access" on public.quote_negotiation_messages
for update to authenticated using (exists (
  select 1 from public.quote_negotiations negotiation
  where negotiation.id = negotiation_id and private.can_manage_request(negotiation.request_id)
)) with check (exists (
  select 1 from public.quote_negotiations negotiation
  where negotiation.id = negotiation_id and private.can_manage_request(negotiation.request_id)
));
create policy "Negotiation messages follow request delete access" on public.quote_negotiation_messages
for delete to authenticated using (exists (
  select 1 from public.quote_negotiations negotiation
  where negotiation.id = negotiation_id and private.can_manage_request(negotiation.request_id)
));
