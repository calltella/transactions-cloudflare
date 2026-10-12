-- Docker only. Do not apply to remote Supabase.
begin;

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
  if actor is distinct from 'c3063ccd-d819-49ef-98cf-948681c33b03'::uuid then
    raise exception 'Developer access required' using errcode = '42501';
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
