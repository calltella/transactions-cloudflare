-- Production setup: run in the remote Supabase SQL Editor.
-- Defines functions and RLS only; does not call normalization or transfer functions.
-- Administrator: c34a94a8-fcb8-4ca8-a1ab-6f097059effd
begin;


-- Source: 202610110001_transactions_work_rls.sql
-- Apply to the existing transactions_work table before enabling CSV imports.

alter table public.transactions_work enable row level security;
alter table public.transactions_work force row level security;

-- A restrictive guard also constrains any older permissive policies.
drop policy if exists transactions_work_owner_guard on public.transactions_work;
create policy transactions_work_owner_guard on public.transactions_work
  as restrictive for all to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists transactions_work_owner_access on public.transactions_work;
create policy transactions_work_owner_access on public.transactions_work
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.transactions_work to authenticated;
revoke all on public.transactions_work from anon;

do $$
declare
  sequence_name text := pg_get_serial_sequence('public.transactions_work', 'id');
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated' and (rolsuper or rolbypassrls)) then
    raise exception 'authenticated must not bypass RLS';
  end if;
  if sequence_name is not null then
    execute format('grant usage, select on sequence %s to authenticated', sequence_name::regclass);
  end if;
end $$;

create index if not exists transactions_work_user_date_id_idx
  on public.transactions_work (user_id, date desc, id desc);



-- Source: 202610110002_normalize_transaction_types.sql
-- Run against the existing transaction_types table.
-- Developer UUID matches the configured developer; keep both in sync if changed.

alter table public.transaction_types enable row level security;

drop policy if exists transaction_types_read on public.transaction_types;
create policy transaction_types_read on public.transaction_types
  for select to authenticated using (true);
drop policy if exists transaction_types_developer_delete on public.transaction_types;
create policy transaction_types_developer_delete on public.transaction_types
  for delete to authenticated
  using ((select auth.uid()) = 'c34a94a8-fcb8-4ca8-a1ab-6f097059effd'::uuid);
drop policy if exists transaction_types_developer_insert on public.transaction_types;
create policy transaction_types_developer_insert on public.transaction_types
  for insert to authenticated
  with check ((select auth.uid()) = 'c34a94a8-fcb8-4ca8-a1ab-6f097059effd'::uuid);

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



-- Source: 202610110005_normalize_payment_methods.sql
-- Remote Supabase administrator only. Rebuild payment methods atomically.

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
  if actor is distinct from 'c34a94a8-fcb8-4ca8-a1ab-6f097059effd'::uuid then
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



-- Source: 202610110006_normalize_categories.sql
-- Remote Supabase administrator only.
create or replace function public.normalize_categories()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  source_rows jsonb;
  deleted_transactions bigint;
  deleted_parents bigint;
  deleted_children bigint;
  registered_parents bigint;
  registered_children bigint;
begin
  if actor is distinct from 'c34a94a8-fcb8-4ca8-a1ab-6f097059effd'::uuid then
    raise exception 'Developer access required' using errcode = '42501';
  end if;

  -- Snapshot the user's distinct pairs together to retain their relationships.
  select coalesce(jsonb_agg(to_jsonb(source)), '[]'::jsonb) into source_rows
    from (select distinct parent_category, child_category
      from public.transactions_work
      where user_id = actor and parent_category is not null
        and btrim(parent_category) <> '') source;

  lock table public.transactions, public.parent_categories, public.child_categories
    in share row exclusive mode;
  delete from public.transactions where id is not null;
  get diagnostics deleted_transactions = row_count;
  delete from public.child_categories where id is not null;
  get diagnostics deleted_children = row_count;
  delete from public.parent_categories where id is not null;
  get diagnostics deleted_parents = row_count;

  insert into public.parent_categories (name)
    select distinct source.parent_category
    from jsonb_to_recordset(source_rows) as source(parent_category text, child_category text)
    order by source.parent_category;
  get diagnostics registered_parents = row_count;

  insert into public.child_categories (parent_category_id, name)
    select distinct parent.id, source.child_category
    from jsonb_to_recordset(source_rows) as source(parent_category text, child_category text)
    join public.parent_categories parent on parent.name = source.parent_category
    where source.child_category is not null and btrim(source.child_category) <> ''
    order by parent.id, source.child_category;
  get diagnostics registered_children = row_count;

  return jsonb_build_object(
    'deletedTransactionsCount', deleted_transactions,
    'deletedParentsCount', deleted_parents,
    'deletedChildrenCount', deleted_children,
    'registeredParentsCount', registered_parents,
    'registeredChildrenCount', registered_children);
end $$;
revoke all on function public.normalize_categories() from public, anon;
grant execute on function public.normalize_categories() to authenticated;


-- Source: 202610110007_insert_normalized_transactions.sql
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
