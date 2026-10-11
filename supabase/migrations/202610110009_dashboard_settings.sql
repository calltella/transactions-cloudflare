begin;
create table public.dashboard_settings (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 month_start_day smallint not null default 1 check(month_start_day between 1 and 31),
 month_end_day smallint not null default 0 check(month_end_day between 0 and 31),
 updated_at timestamptz not null default now()
);
alter table public.dashboard_settings enable row level security;
alter table public.dashboard_settings force row level security;
create policy dashboard_settings_owner_guard on public.dashboard_settings as restrictive for all to public using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy dashboard_settings_owner_access on public.dashboard_settings for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.dashboard_settings to authenticated;
revoke all on public.dashboard_settings from anon;
notify pgrst, 'reload schema';
commit;
