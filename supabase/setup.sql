-- منيو فاملي تايم: جداول المنيو والإحصائيات والأدمن
-- يتشغّل مرة وحدة من Supabase → SQL Editor. ما يلمس جداول دفتر المطعم.
-- قبل التشغيل: غيّر YOUR_EMAIL@example.com (بالأسفل) للإيميل اللي تدخل بيه.

create extension if not exists pgcrypto;

-- ١) الجداول
create table if not exists public.fm_menu (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fm_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'مشرف'
);

create table if not exists public.fm_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  user_id uuid default auth.uid(),
  who text,
  changes jsonb not null default '[]'::jsonb
);

create table if not exists public.fm_versions (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  who text,
  note text,
  data jsonb not null
);

create table if not exists public.fm_events (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  vid text,
  kind text not null,
  ref text,
  tbl text,
  device text,
  is_new boolean
);
create index if not exists fm_events_ts_idx on public.fm_events (ts);
create index if not exists fm_events_kind_ts_idx on public.fm_events (kind, ts);

-- ٢) دالة: هل المستخدم الحالي أدمن؟
create or replace function public.fm_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fm_admins where user_id = auth.uid());
$$;

-- ٣) الصلاحيات (RLS)
alter table public.fm_menu     enable row level security;
alter table public.fm_admins   enable row level security;
alter table public.fm_log      enable row level security;
alter table public.fm_versions enable row level security;
alter table public.fm_events   enable row level security;

grant select on public.fm_menu to anon, authenticated;
grant insert, update on public.fm_menu to authenticated;
grant select on public.fm_admins to authenticated;
grant select, insert on public.fm_log to authenticated;
grant select, insert, delete on public.fm_versions to authenticated;
grant insert on public.fm_events to anon, authenticated;
grant select, delete on public.fm_events to authenticated;
grant execute on function public.fm_is_admin() to anon, authenticated;

drop policy if exists fm_menu_read on public.fm_menu;
create policy fm_menu_read on public.fm_menu for select to anon, authenticated using (true);
drop policy if exists fm_menu_ins on public.fm_menu;
create policy fm_menu_ins on public.fm_menu for insert to authenticated with check (public.fm_is_admin());
drop policy if exists fm_menu_upd on public.fm_menu;
create policy fm_menu_upd on public.fm_menu for update to authenticated using (public.fm_is_admin()) with check (public.fm_is_admin());

drop policy if exists fm_admins_self on public.fm_admins;
create policy fm_admins_self on public.fm_admins for select to authenticated using (public.fm_is_admin());

drop policy if exists fm_log_read on public.fm_log;
create policy fm_log_read on public.fm_log for select to authenticated using (public.fm_is_admin());
drop policy if exists fm_log_ins on public.fm_log;
create policy fm_log_ins on public.fm_log for insert to authenticated with check (public.fm_is_admin() and user_id = auth.uid());

drop policy if exists fm_versions_all on public.fm_versions;
create policy fm_versions_all on public.fm_versions for all to authenticated using (public.fm_is_admin()) with check (public.fm_is_admin());

-- الزبون يكدر يضيف حدث إحصائي بس (ما يكدر يقرا أو يمسح)
drop policy if exists fm_events_ins on public.fm_events;
create policy fm_events_ins on public.fm_events for insert to anon, authenticated with check (
  kind in ('visit','section','item','search','wa','call','maps','wifi','share','lang','install')
  and length(coalesce(vid, '')) <= 40
  and length(coalesce(ref, '')) <= 60
  and length(coalesce(tbl, '')) <= 12
  and length(coalesce(device, '')) <= 20
  and ts between now() - interval '5 minutes' and now() + interval '5 minutes'
);
drop policy if exists fm_events_read on public.fm_events;
create policy fm_events_read on public.fm_events for select to authenticated using (public.fm_is_admin());
drop policy if exists fm_events_del on public.fm_events;
create policy fm_events_del on public.fm_events for delete to authenticated using (public.fm_is_admin());

-- ٤) الإحصائيات (تنحسب بالسيرفر، للأدمن بس)
create or replace function public.fm_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
  d int := greatest(1, least(coalesce(p_days, 30), 365));
  since timestamptz := now() - make_interval(days => d);
  today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  if not public.fm_is_admin() then
    raise exception 'not allowed';
  end if;
  with e as (
    select kind, ref, tbl, device, is_new, vid, (ts at time zone 'Asia/Baghdad') as lt
    from public.fm_events where ts >= since
  ), v as (select * from e where kind = 'visit')
  select jsonb_build_object(
    'days', d,
    'today', (select count(distinct vid) from public.fm_events
              where kind = 'visit' and (ts at time zone 'Asia/Baghdad')::date = today),
    'today_views', (select count(*) from public.fm_events
              where kind = 'visit' and (ts at time zone 'Asia/Baghdad')::date = today),
    'week', (select count(distinct vid) from public.fm_events where kind = 'visit' and ts >= now() - interval '7 days'),
    'period', (select count(distinct vid) from v),
    'views', (select count(*) from v),
    'new', (select count(distinct vid) from v where is_new),
    'returning', (select count(distinct vid) from v where not coalesce(is_new, false)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('d', x.dd, 'n', x.n) order by x.dd)
               from (select lt::date dd, count(distinct vid) n from v group by 1) x), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('h', x.h, 'n', x.n) order by x.h)
               from (select extract(hour from lt)::int h, count(*) n from v group by 1) x), '[]'::jsonb),
    'weekdays', coalesce((select jsonb_agg(jsonb_build_object('w', x.w, 'n', x.n) order by x.w)
               from (select extract(dow from lt)::int w, count(*) n from v group by 1) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(jsonb_build_object('k', x.ref, 'n', x.n) order by x.n desc)
               from (select ref, count(*) n from e where kind = 'section' and ref is not null group by ref) x), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('k', x.ref, 'n', x.n) order by x.n desc)
               from (select ref, count(*) n from e where kind = 'item' and ref is not null group by ref order by 2 desc limit 15) x), '[]'::jsonb),
    'searches', coalesce((select jsonb_agg(jsonb_build_object('k', x.ref, 'n', x.n) order by x.n desc)
               from (select lower(ref) ref, count(*) n from e where kind = 'search' and ref is not null group by 1 order by 2 desc limit 15) x), '[]'::jsonb),
    'actions', coalesce((select jsonb_object_agg(x.kind, x.n)
               from (select kind, count(*) n from e where kind in ('wa','call','maps','wifi','share','lang','install') group by kind) x), '{}'::jsonb),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('k', x.tbl, 'n', x.n) order by x.n desc)
               from (select tbl, count(distinct vid) n from v where tbl is not null and tbl <> '' group by tbl) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('k', x.device, 'n', x.n) order by x.n desc)
               from (select coalesce(device, 'other') device, count(distinct vid) n from v group by 1) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.fm_stats(int) from public;
grant execute on function public.fm_stats(int) to authenticated;

-- ٥) مكان صور الأصناف (الكل يشوفها، الأدمن بس يرفع)
insert into storage.buckets (id, name, public) values ('fm-images', 'fm-images', true)
on conflict (id) do nothing;
drop policy if exists fm_img_read on storage.objects;
create policy fm_img_read on storage.objects for select using (bucket_id = 'fm-images');
drop policy if exists fm_img_ins on storage.objects;
create policy fm_img_ins on storage.objects for insert to authenticated with check (bucket_id = 'fm-images' and public.fm_is_admin());
drop policy if exists fm_img_upd on storage.objects;
create policy fm_img_upd on storage.objects for update to authenticated using (bucket_id = 'fm-images' and public.fm_is_admin());
drop policy if exists fm_img_del on storage.objects;
create policy fm_img_del on storage.objects for delete to authenticated using (bucket_id = 'fm-images' and public.fm_is_admin());

-- ٦) خلّي حسابك أدمن (غيّر الإيميل)
insert into public.fm_admins (user_id, name)
select id, 'المالك' from auth.users where email = 'YOUR_EMAIL@example.com'
on conflict (user_id) do nothing;

-- تأكد: لازم يطلع سطر واحد على الأقل
select a.name, u.email from public.fm_admins a join auth.users u on u.id = a.user_id;
