begin;
alter table public.transactions add column if not exists card_deferred boolean not null default false;
notify pgrst, 'reload schema';
commit;
