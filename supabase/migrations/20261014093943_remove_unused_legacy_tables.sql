-- Unused legacy tables; refuse to remove records or dependent objects.
begin;
lock table public.bank_balances, public.card_settings, public.card_types in access exclusive mode;
do $$ begin
 if exists(select 1 from public.bank_balances) or exists(select 1 from public.card_settings) or exists(select 1 from public.card_types) then
  raise exception 'Legacy tables contain data; deletion aborted';
 end if;
end $$;
drop table public.bank_balances, public.card_settings, public.card_types;
notify pgrst, 'reload schema';
commit;
