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

-- Supabase administrator only. Rebuild payment methods atomically.

create or replace function public.normalize_payment_methods()
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
  select array_agg(source.payment_method order by source.payment_method) into names
    from (select distinct payment_method from public.transactions_work where user_id = actor and payment_method is not null and btrim(payment_method) <> '') source;

  -- Serialize rebuilds, and roll deletion back if any insertion fails.
  lock table public.transactions, public.payment_methods in share row exclusive mode;
  delete from public.transactions where id is not null;
  get diagnostics deleted_transactions_count = row_count;
  delete from public.payment_methods where id is not null;
  get diagnostics deleted_count = row_count;
  insert into public.payment_methods (name, type)
    select name, case
      when name = '現金' then 'cash'
      when name like '%銀行%' then 'bank_account'
      when name like '%カード%' then 'credit_card'
      else 'other'
    end
    from unnest(names) as source(name);
  get diagnostics registered_count = row_count;

  return jsonb_build_object('deletedCount', deleted_count, 'deletedTransactionsCount', deleted_transactions_count, 'registeredCount', registered_count);
end $$;

revoke all on function public.normalize_payment_methods() from public, anon;
grant execute on function public.normalize_payment_methods() to authenticated;
notify pgrst, 'reload schema';
commit;
