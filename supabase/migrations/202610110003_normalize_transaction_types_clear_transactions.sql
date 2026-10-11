-- Remote Supabase: update normalization to delete all transactions first.
begin;

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
  if actor is distinct from 'c34a94a8-fcb8-4ca8-a1ab-6f097059effd'::uuid then
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
