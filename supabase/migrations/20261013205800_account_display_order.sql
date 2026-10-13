begin;
alter table public.bank_accounts add column if not exists sort_order integer not null default 2147483647;
alter table public.credit_cards add column if not exists sort_order integer not null default 2147483647;
create index if not exists bank_accounts_user_order_idx on public.bank_accounts(user_id, sort_order, id);
create index if not exists credit_cards_user_order_idx on public.credit_cards(user_id, sort_order, id);

create or replace function public.reorder_accounts(account_kind text, account_ids bigint[])
returns void language plpgsql security invoker set search_path = '' as $$
declare matched integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if account_kind not in ('bank', 'card') or account_kind is null or account_ids is null
    or cardinality(account_ids) < 1 or cardinality(account_ids) > 10000
    or exists (select 1 from unnest(account_ids) id where id is null or id < 1)
    or (select count(distinct id) from unnest(account_ids) id) <> cardinality(account_ids) then
    raise exception 'Invalid order' using errcode = '22023';
  end if;
  if account_kind = 'bank' then
    perform id from public.bank_accounts where user_id = auth.uid() and id = any(account_ids) order by id for update;
    select count(*) into matched from public.bank_accounts where user_id = auth.uid() and id = any(account_ids);
    if matched <> cardinality(account_ids) then raise exception 'Invalid ownership' using errcode = '42501'; end if;
    update public.bank_accounts a set sort_order = ordered.position::integer
      from unnest(account_ids) with ordinality ordered(id, position)
      where a.id = ordered.id and a.user_id = auth.uid();
  else
    perform id from public.credit_cards where user_id = auth.uid() and id = any(account_ids) order by id for update;
    select count(*) into matched from public.credit_cards where user_id = auth.uid() and id = any(account_ids);
    if matched <> cardinality(account_ids) then raise exception 'Invalid ownership' using errcode = '42501'; end if;
    update public.credit_cards a set sort_order = ordered.position::integer
      from unnest(account_ids) with ordinality ordered(id, position)
      where a.id = ordered.id and a.user_id = auth.uid();
  end if;
end $$;
revoke all on function public.reorder_accounts(text,bigint[]) from public, anon;
grant execute on function public.reorder_accounts(text,bigint[]) to authenticated;
notify pgrst, 'reload schema';
commit;
