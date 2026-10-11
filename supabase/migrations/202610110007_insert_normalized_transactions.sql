begin;
-- Shared lookup tables must be readable by the user's SDK/RPC session.
do $$
declare table_name text;
begin
  foreach table_name in array array['transaction_types', 'payment_methods', 'parent_categories', 'child_categories'] loop
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_lookup_read', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (true)', table_name || '_lookup_read', table_name);
  end loop;
end $$;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;
drop policy if exists transactions_owner_guard on public.transactions;
create policy transactions_owner_guard on public.transactions as restrictive for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists transactions_owner_access on public.transactions;
create policy transactions_owner_access on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.transactions to authenticated;
revoke all on public.transactions from anon;
do $$
declare sequence_name text := pg_get_serial_sequence('public.transactions', 'id');
begin
  if sequence_name is not null then
    execute format('grant usage, select on sequence %s to authenticated', sequence_name::regclass);
  end if;
end $$;

create or replace function public.insert_normalized_transactions()
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  rows_to_insert jsonb;
  unresolved boolean;
  inserted_count bigint;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Serialize transfers with rebuilds; RLS still limits reads and writes to the user.
  lock table public.transactions in share row exclusive mode;
  if exists (select 1 from public.transactions where user_id = actor) then
    raise exception 'Transactions already exist' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', actor, 'date', w.date, 'type_id', t.id,
    'payment_method_id', pm.id, 'parent_category_id', p.id, 'child_category_id', ch.id,
    'amount', w.amount, 'location', w.location, 'memo', w.memo,
    'note', w.note, 'tag', w.tag, 'created_at', w.created_at)), '[]'::jsonb),
    coalesce(bool_or(t.id is null
      or (nullif(btrim(w.payment_method), '') is not null and pm.id is null)
      or (nullif(btrim(w.parent_category), '') is not null and p.id is null)
      or (nullif(btrim(w.child_category), '') is not null and ch.id is null)), false)
    into rows_to_insert, unresolved
    from public.transactions_work w
    left join public.transaction_types t on t.name = w.type
    left join public.payment_methods pm on pm.name = w.payment_method
      and nullif(btrim(w.payment_method), '') is not null
    left join public.parent_categories p on p.name = w.parent_category
      and nullif(btrim(w.parent_category), '') is not null
    left join public.child_categories ch on ch.parent_category_id = p.id and ch.name = w.child_category
      and nullif(btrim(w.child_category), '') is not null
    where w.user_id = actor;
  if unresolved then
    raise exception 'Unresolved normalized values' using errcode = 'P0001';
  end if;

  insert into public.transactions
    (user_id, date, type_id, payment_method_id, parent_category_id, child_category_id,
     amount, location, memo, note, tag, created_at)
    select user_id, date, type_id, payment_method_id, parent_category_id, child_category_id,
      amount, location, memo, note, tag, created_at
    from jsonb_populate_recordset(null::public.transactions, rows_to_insert);
  get diagnostics inserted_count = row_count;
  return jsonb_build_object('insertedCount', inserted_count);
end $$;
revoke all on function public.insert_normalized_transactions() from public, anon;
grant execute on function public.insert_normalized_transactions() to authenticated;
notify pgrst, 'reload schema';
commit;
