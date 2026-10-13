begin;
create unique index if not exists bank_accounts_user_id_id_unique on public.bank_accounts(user_id,id);
create table if not exists public.bank_monthly_balances (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank_account_id bigint not null,
  month date not null check (extract(day from month) = 1 and month between date '1956-01-01' and date '9998-12-01'),
  opening_amount bigint not null default 0 check (opening_amount between -9007199254740991 and 9007199254740991),
  carryover_amount bigint not null default 0 check (carryover_amount between -9007199254740991 and 9007199254740991),
  updated_at timestamptz not null default now(),
  primary key(user_id,bank_account_id,month),
  foreign key(user_id,bank_account_id) references public.bank_accounts(user_id,id) on delete cascade,
  check (opening_amount + carryover_amount between -9007199254740991 and 9007199254740991)
);
alter table public.bank_monthly_balances enable row level security;
alter table public.bank_monthly_balances force row level security;
drop policy if exists bank_monthly_balances_owner_guard on public.bank_monthly_balances;
create policy bank_monthly_balances_owner_guard on public.bank_monthly_balances as restrictive for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists bank_monthly_balances_owner_access on public.bank_monthly_balances;
create policy bank_monthly_balances_owner_access on public.bank_monthly_balances for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select,insert,update,delete on public.bank_monthly_balances to authenticated;
revoke all on public.bank_monthly_balances from anon;
notify pgrst, 'reload schema';
commit;
