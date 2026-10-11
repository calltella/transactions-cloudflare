begin;
alter table public.dashboard_settings
  add column if not exists month_start_holiday_adjustment text not null default 'none'
  check (month_start_holiday_adjustment in ('none', 'previous', 'next'));
notify pgrst, 'reload schema';
commit;
