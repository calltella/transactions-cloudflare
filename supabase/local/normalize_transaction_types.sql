-- Administration is based on current Auth app_metadata, never user_metadata or a fixed UUID.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- SECURITY DEFINER is required only to read the caller's protected Auth record.
-- No arguments: a caller cannot inspect another user's privileges.
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
    where id = (select auth.uid())
      and raw_app_meta_data -> 'role' = '"admin"'::jsonb
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- Run against the existing transaction_types table.
-- Administrator privileges are read from Auth app_metadata.

alter table public.transaction_types enable row level security;

drop policy if exists transaction_types_read on public.transaction_types;
create policy transaction_types_read on public.transaction_types
  for select to authenticated using (true);
drop policy if exists transaction_types_developer_delete on public.transaction_types;
create policy transaction_types_developer_delete on public.transaction_types
  for delete to authenticated
  using ((select private.is_admin()));
drop policy if exists transaction_types_developer_insert on public.transaction_types;
create policy transaction_types_developer_insert on public.transaction_types
  for insert to authenticated
  with check ((select private.is_admin()));

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
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
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
