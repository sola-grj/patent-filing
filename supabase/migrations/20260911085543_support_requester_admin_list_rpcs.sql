do $$
declare
  target_function regprocedure;
  function_sql text;
begin
  foreach target_function in array array[
    'public.get_requester_request_page(text,text,text,integer,integer,text)'::regprocedure,
    'public.get_requester_draft_page(text,text,text,integer,integer)'::regprocedure
  ] loop
    function_sql := pg_get_functiondef(target_function);

    if position('member.role = ''requester''' in function_sql) = 0 then
      raise exception 'Expected requester role check was not found in %', target_function;
    end if;

    execute replace(
      function_sql,
      'member.role = ''requester''',
      'member.role in (''requester'', ''requester_admin'')'
    );
  end loop;
end;
$$;
