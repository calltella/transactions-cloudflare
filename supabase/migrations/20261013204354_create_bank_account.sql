begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- A narrow privileged operation creates the shared payment method and the caller's account together.
create or replace function private.create_bank_account(
  account_name text, bank_name text, branch_name text, account_holder text,
  opening_balance bigint, opening_balance_date date, is_active boolean, memo text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  method_id bigint;
  method_type text;
  account_id bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if account_name is null or btrim(account_name) = '' or length(btrim(account_name)) > 200
    or length(coalesce(bank_name, '')) > 200 or length(coalesce(branch_name, '')) > 200
    or length(coalesce(account_holder, '')) > 200 or length(coalesce(memo, '')) > 5000
    or is_active is null or (opening_balance is null) <> (opening_balance_date is null)
    or opening_balance not between -9007199254740991 and 9007199254740991
    or (opening_balance_date is not null and (opening_balance_date < date '0001-01-01' or opening_balance_date > date '9999-12-31')) then
    raise exception 'Invalid account' using errcode = '22023';
  end if;
  insert into public.payment_methods(name, type) values (btrim(account_name), 'bank_account')
    on conflict (name) do nothing;
  select id, type into method_id, method_type from public.payment_methods
    where name = btrim(account_name) for update;
  if method_type is distinct from 'bank_account' then
    raise exception 'Name belongs to another payment type' using errcode = '22023';
  end if;
  insert into public.bank_accounts(user_id, payment_method_id, bank_name, branch_name, account_holder,
    opening_balance, opening_balance_date, is_active, memo)
  values (actor, method_id, nullif(btrim(bank_name), ''), nullif(btrim(branch_name), ''), nullif(btrim(account_holder), ''),
    opening_balance, opening_balance_date, is_active, nullif(btrim(memo), '')) returning id into account_id;
  return account_id;
end $$;
revoke all on function private.create_bank_account(text,text,text,text,bigint,date,boolean,text) from public, anon;
grant execute on function private.create_bank_account(text,text,text,text,bigint,date,boolean,text) to authenticated;

create or replace function public.create_bank_account(
  account_name text, bank_name text, branch_name text, account_holder text,
  opening_balance bigint, opening_balance_date date, is_active boolean, memo text
) returns bigint language sql security invoker set search_path = '' as $$
  select private.create_bank_account(account_name,bank_name,branch_name,account_holder,
    opening_balance,opening_balance_date,is_active,memo);
$$;
revoke all on function public.create_bank_account(text,text,text,text,bigint,date,boolean,text) from public, anon;
grant execute on function public.create_bank_account(text,text,text,text,bigint,date,boolean,text) to authenticated;
notify pgrst, 'reload schema';
commit;
