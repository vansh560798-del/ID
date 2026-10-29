-- St. Arnold's ID Portal: Supabase setup
-- Run in Supabase Dashboard -> SQL Editor.
-- Public reads; only signed-in users with trusted app_metadata.role admin/teacher can write.

create extension if not exists pgcrypto;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  cls integer not null default 0,
  title text not null,
  message text not null default '',
  target text not null default 'All',
  "authorRole" text not null default 'Admin',
  type text not null default 'Announcement',
  "fileUrl" text,
  "fileName" text,
  "fileSize" bigint not null default 0,
  "storagePath" text,
  ts bigint not null default ((extract(epoch from now()) * 1000)::bigint)
);

create index if not exists items_ts_desc_idx on public.items (ts desc);
alter table public.items enable row level security;

drop policy if exists "Public can read items" on public.items;
create policy "Public can read items" on public.items for select to anon, authenticated using (true);

drop policy if exists "Teachers and admins can insert items" on public.items;
create policy "Teachers and admins can insert items" on public.items for insert to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'teacher'));

drop policy if exists "Teachers and admins can update items" on public.items;
create policy "Teachers and admins can update items" on public.items for update to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'teacher'))
with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'teacher'));

drop policy if exists "Teachers and admins can delete items" on public.items;
create policy "Teachers and admins can delete items" on public.items for delete to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'teacher'));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='items') then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;
