-- Docker Supabase only. Do not apply to remote Supabase.
-- Run against the existing transaction_types table.
-- Developer UUID matches the configured developer; keep both in sync if changed.
begin;

alter table public.transaction_types enable row level security;

drop policy if exists transaction_types_read on public.transaction_types;
create policy transaction_types_read on public.transaction_types
  for select to authenticated using (true);
drop policy if exists transaction_types_developer_delete on public.transaction_types;
create policy transaction_types_developer_delete on public.transaction_types
  for delete to authenticated
  using ((select auth.uid()) = 'd629d117-2f96-481b-9980-329fbf581f68'::uuid);
drop policy if exists transaction_types_developer_insert on public.transaction_types;
create policy transaction_types_developer_insert on public.transaction_types
  for insert to authenticated
  with check ((select auth.uid()) = 'd629d117-2f96-481b-9980-329fbf581f68'::uuid);

grant select, insert, delete on public.transaction_types to authenticated;
do $$
declare sequence_name text := pg_get_serial_sequence('public.transaction_types', 'id');
begin
  if sequence_name is not null then
    execute format('grant usage, select on sequence %s to authenticated', sequence_name::regclass);
  end if;
end $$;

create or replace function public.normalize_transaction_types()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  names text[];
  deleted_count bigint;
  deleted_transactions_count bigint;
  registered_count bigint;
begin
  if actor is distinct from 'd629d117-2f96-481b-9980-329fbf581f68'::uuid then
    raise exception 'Developer access required' using errcode = '42501';
  end if;

  -- Snapshot only the authenticated user's source values; preserve their spelling.
  select array_agg(source.type order by source.type) into names
    from (select distinct type from public.transactions_work where user_id = actor) source;

  -- Serialize rebuilds, and roll deletion back if any insertion fails.
  lock table public.transactions, public.transaction_types in share row exclusive mode;
  delete from public.transactions where id is not null;
  get diagnostics deleted_transactions_count = row_count;
  delete from public.transaction_types where id is not null;
  get diagnostics deleted_count = row_count;
  insert into public.transaction_types (name) select unnest(names);
  get diagnostics registered_count = row_count;

  return jsonb_build_object('deletedCount', deleted_count, 'deletedTransactionsCount', deleted_transactions_count, 'registeredCount', registered_count);
end $$;

revoke all on function public.normalize_transaction_types() from public, anon;
grant execute on function public.normalize_transaction_types() to authenticated;

notify pgrst, 'reload schema';
commit;
