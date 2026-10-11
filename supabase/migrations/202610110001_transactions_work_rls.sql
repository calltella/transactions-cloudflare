-- Apply to the existing transactions_work table before enabling CSV imports.
begin;

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

commit;
