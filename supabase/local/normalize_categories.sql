-- Docker only. Do not apply to remote Supabase.
begin;
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
  if actor is distinct from 'c3063ccd-d819-49ef-98cf-948681c33b03'::uuid then
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
notify pgrst, 'reload schema';
commit;
