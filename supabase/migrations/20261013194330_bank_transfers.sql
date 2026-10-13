begin;
alter table public.transactions add column if not exists transfer_id uuid;
create index if not exists transactions_transfer_idx on public.transactions (user_id, transfer_id) where transfer_id is not null;

create or replace function public.create_bank_transfer(source_bank_id bigint, destination_bank_id bigint, transfer_date date, transfer_amount integer, transfer_memo text default '')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source_method bigint;
  destination_method bigint;
  income_type bigint;
  expense_type bigint;
  transfer uuid := gen_random_uuid();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if source_bank_id is null or destination_bank_id is null or source_bank_id = destination_bank_id
    or transfer_date is null or transfer_amount is null or transfer_amount <= 0
    or length(coalesce(transfer_memo, '')) > 5000 then raise exception 'Invalid transfer'; end if;
  -- Lock in ID order to keep concurrent transfers and account edits consistent.
  perform id from public.bank_accounts where user_id = actor and id in (source_bank_id, destination_bank_id) order by id for share;
  select payment_method_id into source_method from public.bank_accounts where id = source_bank_id and user_id = actor and is_active;
  select payment_method_id into destination_method from public.bank_accounts where id = destination_bank_id and user_id = actor and is_active;
  if source_method is null or destination_method is null or source_method = destination_method then raise exception 'Invalid accounts'; end if;
  select id into income_type from public.transaction_types where name = '収入' order by id limit 1;
  select id into expense_type from public.transaction_types where name = '支出' order by id limit 1;
  if income_type is null or expense_type is null then raise exception 'Transaction types missing'; end if;
  insert into public.transactions(user_id, date, type_id, payment_method_id, amount, memo, transfer_id)
  values (actor, transfer_date, expense_type, source_method, transfer_amount, '口座間振替（出金）' || case when coalesce(transfer_memo, '') = '' then '' else '：' || transfer_memo end, transfer),
    (actor, transfer_date, income_type, destination_method, transfer_amount, '口座間振替（入金）' || case when coalesce(transfer_memo, '') = '' then '' else '：' || transfer_memo end, transfer);
  return transfer;
end $$;

create or replace function public.delete_bank_transfer(transaction_id bigint, bank_id bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare transfer uuid; removed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select t.transfer_id into transfer from public.transactions t join public.bank_accounts b on b.payment_method_id = t.payment_method_id and b.user_id = t.user_id
    where t.id = transaction_id and b.id = bank_id and t.user_id = auth.uid();
  if transfer is null then raise exception 'Transfer not found'; end if;
  delete from public.transactions where transfer_id = transfer and user_id = auth.uid();
  get diagnostics removed = row_count;
  if removed <> 2 then raise exception 'Incomplete transfer'; end if;
end $$;
revoke all on function public.create_bank_transfer(bigint, bigint, date, integer, text) from public, anon;
revoke all on function public.delete_bank_transfer(bigint, bigint) from public, anon;
grant execute on function public.create_bank_transfer(bigint, bigint, date, integer, text) to authenticated;
grant execute on function public.delete_bank_transfer(bigint, bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
