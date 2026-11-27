-- ================================================================
--  Listo Team – baza danych (Supabase). Wklej całość: SQL Editor → New query → Run.
--  Skrypt można uruchamiać wielokrotnie (tworzy brakujące elementy, aktualizuje funkcje).
-- ================================================================
create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- tabele ----------
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 80),
  invite_code text not null unique default lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  timezone    text not null default 'Europe/Warsaw',
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create table if not exists public.ws_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  name         text,
  email        text,
  color        text,
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists ws_members_user on public.ws_members (user_id);
-- każde zadanie / projekt / etykieta / filtr to jeden wiersz – synchronizacja zmian na żywo
create table if not exists public.ws_items (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           text not null,
  kind         text not null check (kind in ('task', 'project', 'label', 'filter')),
  data         jsonb not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid(),
  primary key (workspace_id, id)
);
create table if not exists public.ws_calendars (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  scope        text not null check (scope in ('team', 'personal')),
  name         text not null,
  color        text,
  url          text not null check (url ~* '^https://'),
  created_at   timestamptz not null default now()
);
create table if not exists public.ws_notifications (
  id           bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  actor_id     uuid,
  kind         text not null,
  task_id      text,
  title        text,
  body         text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists ws_notifications_user on public.ws_notifications (user_id, created_at desc);
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs (user_id);
create table if not exists public.team_prefs (
  user_id  uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  state    jsonb,
  saved_at timestamptz not null default now()
);
create table if not exists public.ws_reminders_sent (
  workspace_id uuid not null,
  task_id      text not null,
  stamp        text not null,
  sent_at      timestamptz not null default now(),
  primary key (workspace_id, task_id, stamp)
);
-- sekrety serwera (klucze VAPID, hasło funkcji push) – schemat niewidoczny przez API
create schema if not exists private;
create table if not exists private.secrets (key text primary key, value text not null);
revoke all on schema private from anon, authenticated;

-- ---------- funkcje pomocnicze (bez rekurencji w regułach RLS) ----------
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ws_members where workspace_id = ws and user_id = auth.uid());
$$;
create or replace function public.is_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ws_members where workspace_id = ws and user_id = auth.uid() and role in ('owner', 'admin'));
$$;
create or replace function public.member_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(m.name, ''), split_part(coalesce(m.email, ''), '@', 1), 'Ktoś') from public.ws_members m where m.user_id = uid limit 1;
$$;

-- ---------- zespół: utworzenie, dołączenie, nowy kod ----------
create or replace function public.create_workspace(ws_name text, member_name text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid; em text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email into em from auth.users where id = auth.uid();
  insert into public.workspaces (name, created_by) values (trim(ws_name), auth.uid()) returning id into ws;
  insert into public.ws_members (workspace_id, user_id, role, name, email) values (ws, auth.uid(), 'owner', nullif(trim(member_name), ''), em);
  return ws;
end $$;
create or replace function public.join_workspace(code text, member_name text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid; em text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into ws from public.workspaces where invite_code = lower(trim(code));
  if ws is null then return null; end if;
  select email into em from auth.users where id = auth.uid();
  insert into public.ws_members (workspace_id, user_id, role, name, email)
  values (ws, auth.uid(), 'member', nullif(trim(member_name), ''), em)
  on conflict (workspace_id, user_id) do update set name = coalesce(nullif(trim(excluded.name), ''), public.ws_members.name);
  return ws;
end $$;
create or replace function public.regenerate_invite(ws uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin(ws) then raise exception 'forbidden'; end if;
  c := lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  update public.workspaces set invite_code = c where id = ws;
  return c;
end $$;
create or replace function public.send_test_notification() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ws_notifications (user_id, kind, title, body)
  values (auth.uid(), 'test', 'Test powiadomień ✓', 'Powiadomienia push działają na tym urządzeniu.');
end $$;

-- ---------- uprawnienia i reguły RLS ----------
alter table public.workspaces enable row level security;
alter table public.ws_members enable row level security;
alter table public.ws_items enable row level security;
alter table public.ws_calendars enable row level security;
alter table public.ws_notifications enable row level security;
alter table public.push_subs enable row level security;
alter table public.team_prefs enable row level security;
alter table public.ws_reminders_sent enable row level security;

grant usage on schema public to authenticated;
grant select, update on public.workspaces to authenticated;
grant select, update, delete on public.ws_members to authenticated;
grant select, insert, update, delete on public.ws_items to authenticated;
grant select, insert, update, delete on public.ws_calendars to authenticated;
grant select, update, delete on public.ws_notifications to authenticated;
grant select, insert, update, delete on public.push_subs to authenticated;
grant select, insert, update, delete on public.team_prefs to authenticated;
revoke all on public.workspaces, public.ws_members, public.ws_items, public.ws_calendars, public.ws_notifications, public.push_subs, public.team_prefs, public.ws_reminders_sent from anon;
revoke all on public.ws_reminders_sent from authenticated;
grant execute on function public.create_workspace(text, text), public.join_workspace(text, text), public.regenerate_invite(uuid), public.send_test_notification(), public.is_member(uuid), public.is_admin(uuid) to authenticated;
revoke execute on function public.create_workspace(text, text), public.join_workspace(text, text), public.regenerate_invite(uuid), public.send_test_notification() from public, anon;
grant execute on function public.create_workspace(text, text), public.join_workspace(text, text), public.regenerate_invite(uuid), public.send_test_notification() to authenticated;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'lt:%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
create policy "lt: zespoły – odczyt"      on public.workspaces for select using (public.is_member(id));
create policy "lt: zespoły – zmiana"      on public.workspaces for update using (public.is_admin(id)) with check (public.is_admin(id));
create policy "lt: osoby – odczyt"        on public.ws_members for select using (public.is_member(workspace_id));
create policy "lt: osoby – zmiana"        on public.ws_members for update using (user_id = auth.uid() or public.is_admin(workspace_id)) with check (user_id = auth.uid() or public.is_admin(workspace_id));
create policy "lt: osoby – usunięcie"     on public.ws_members for delete using ((user_id = auth.uid() and role <> 'owner') or (public.is_admin(workspace_id) and role <> 'owner'));
create policy "lt: elementy – odczyt"     on public.ws_items for select using (public.is_member(workspace_id));
create policy "lt: elementy – dodanie"    on public.ws_items for insert with check (public.is_member(workspace_id));
create policy "lt: elementy – zmiana"     on public.ws_items for update using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "lt: elementy – usunięcie"  on public.ws_items for delete using (public.is_member(workspace_id));
create policy "lt: kalendarze – odczyt"   on public.ws_calendars for select using ((scope = 'team' and public.is_member(workspace_id)) or owner_id = auth.uid());
create policy "lt: kalendarze – dodanie"  on public.ws_calendars for insert with check (owner_id = auth.uid() and public.is_member(workspace_id));
create policy "lt: kalendarze – zmiana"   on public.ws_calendars for update using (owner_id = auth.uid() or (scope = 'team' and public.is_admin(workspace_id)));
create policy "lt: kalendarze – usunięcie" on public.ws_calendars for delete using (owner_id = auth.uid() or (scope = 'team' and public.is_admin(workspace_id)));
create policy "lt: powiadomienia – odczyt" on public.ws_notifications for select using (user_id = auth.uid());
create policy "lt: powiadomienia – zmiana" on public.ws_notifications for update using (user_id = auth.uid());
create policy "lt: powiadomienia – usunięcie" on public.ws_notifications for delete using (user_id = auth.uid());
create policy "lt: push – własne"         on public.push_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "lt: ustawienia – własne"   on public.team_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- ochrona ról: nikt nie nada sobie uprawnień ----------
create or replace function public.ws_members_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.user_id <> old.user_id or new.workspace_id <> old.workspace_id or new.email is distinct from old.email then raise exception 'forbidden'; end if;
  if new.role is distinct from old.role and (not public.is_admin(old.workspace_id) or old.role = 'owner' or new.role = 'owner') then raise exception 'forbidden'; end if;
  return new;
end $$;
drop trigger if exists ws_members_guard on public.ws_members;
create trigger ws_members_guard before update on public.ws_members for each row execute function public.ws_members_guard();

-- ---------- znacznik czasu zmian ----------
create or replace function public.ws_items_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); if auth.uid() is not null then new.updated_by := auth.uid(); end if; return new; end $$;
drop trigger if exists ws_items_touch on public.ws_items;
create trigger ws_items_touch before insert or update on public.ws_items for each row execute function public.ws_items_touch();

-- ---------- powiadomienia o przypisaniu, zmianie statusu i komentarzach ----------
create or replace function public.ws_items_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := coalesce(auth.uid(), new.updated_by);
  title text := coalesce(new.data->>'title', 'Zadanie');
  who text := coalesce(public.member_name(actor), 'Ktoś');
  new_a jsonb := coalesce(new.data->'assignees', '[]'::jsonb);
  old_a jsonb := case when tg_op = 'UPDATE' then coalesce(old.data->'assignees', '[]'::jsonb) else '[]'::jsonb end;
  is_ev boolean := new.data->>'kind' = 'event';
  st_new int; st_old int; u text; rcpt uuid; c jsonb; n_old int; n_new int;
  when_txt text := '';
begin
  if new.kind <> 'task' then return new; end if;
  if new.data->>'due' is not null then
    when_txt := ' · ' || to_char((new.data->>'due')::date, 'DD.MM') || coalesce(' ' || nullif(new.data->>'time', ''), '');
  end if;
  -- nowe przypisania
  for u in select jsonb_array_elements_text(new_a) except select jsonb_array_elements_text(old_a) loop
    begin rcpt := u::uuid; exception when others then continue; end;
    if rcpt is distinct from actor and exists (select 1 from ws_members where workspace_id = new.workspace_id and user_id = rcpt) then
      insert into ws_notifications (workspace_id, user_id, actor_id, kind, task_id, title, body)
      values (new.workspace_id, rcpt, actor, 'assigned', new.id, title, who || (case when is_ev then ' dodał(a) Cię do wydarzenia' else ' przypisał(a) Ci zadanie' end) || when_txt);
    end if;
  end loop;
  if tg_op = 'UPDATE' then
    -- zmiana statusu (nie zaczęte / w trakcie / ukończone)
    st_new := case when coalesce((new.data->>'completed')::boolean, false) then 2 else coalesce(nullif(new.data->>'status', '')::int, 0) end;
    st_old := case when coalesce((old.data->>'completed')::boolean, false) then 2 else coalesce(nullif(old.data->>'status', '')::int, 0) end;
    if st_new <> st_old then
      for rcpt in
        select distinct x::uuid from (
          select jsonb_array_elements_text(new_a) as x
          union select new.data->>'createdBy'
        ) s where x ~ '^[0-9a-f-]{36}$'
      loop
        if rcpt is distinct from actor and exists (select 1 from ws_members where workspace_id = new.workspace_id and user_id = rcpt) then
          insert into ws_notifications (workspace_id, user_id, actor_id, kind, task_id, title, body)
          values (new.workspace_id, rcpt, actor, case when st_new = 2 then 'done' else 'status' end, new.id, title,
            who || case st_new when 2 then ' ukończył(a) 🟢' when 1 then ' zaczął/zaczęła – w trakcie 🟡' else ' cofnął/cofnęła do „nie zaczęte”' end);
        end if;
      end loop;
    end if;
    -- nowe komentarze
    n_old := jsonb_array_length(coalesce(old.data->'comments', '[]'::jsonb));
    n_new := jsonb_array_length(coalesce(new.data->'comments', '[]'::jsonb));
    if n_new > n_old then
      c := new.data->'comments'->(n_new - 1);
      for rcpt in
        select distinct x::uuid from (
          select jsonb_array_elements_text(new_a) as x
          union select new.data->>'createdBy'
          union select e->>'by' from jsonb_array_elements(coalesce(new.data->'comments', '[]'::jsonb)) e
        ) s where x ~ '^[0-9a-f-]{36}$'
      loop
        if rcpt is distinct from actor and exists (select 1 from ws_members where workspace_id = new.workspace_id and user_id = rcpt) then
          insert into ws_notifications (workspace_id, user_id, actor_id, kind, task_id, title, body)
          values (new.workspace_id, rcpt, actor, 'comment', new.id, title, who || ': ' || left(coalesce(c->>'text', ''), 140));
        end if;
      end loop;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ws_items_notify on public.ws_items;
create trigger ws_items_notify after insert or update on public.ws_items for each row execute function public.ws_items_notify();

-- ---------- wysyłka push: każde nowe powiadomienie → funkcja „push” (Edge Function) ----------
create or replace function public.ws_notify_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text; prefs jsonb;
begin
  select value into url from private.secrets where key = 'push_url';
  select value into secret from private.secrets where key = 'push_secret';
  if url is null or secret is null then return new; end if;
  if not exists (select 1 from push_subs where user_id = new.user_id) then return new; end if;
  -- wyłączone w ustawieniach: rodzaj powiadomienia lub projekt
  select p.state->'settings' into prefs from team_prefs p where p.user_id = new.user_id;
  if prefs is not null then
    if coalesce(prefs->'notifOff', '[]'::jsonb) ? new.kind then return new; end if;
    if new.task_id is not null and exists (select 1 from ws_items i where i.workspace_id = new.workspace_id and i.id = new.task_id
        and coalesce(prefs->'notifMuteProj', '[]'::jsonb) ? coalesce(i.data->>'projectId', 'inbox')) then return new; end if;
  end if;
  perform net.http_post(url := url, body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret), timeout_milliseconds := 8000);
  return new;
end $$;
drop trigger if exists ws_notify_push on public.ws_notifications;
create trigger ws_notify_push after insert on public.ws_notifications for each row execute function public.ws_notify_push();

-- konfiguracja dla funkcji „push” (czytana kluczem serwisowym – niedostępna dla aplikacji)
create or replace function public.push_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(key, value) from private.secrets where key in ('push_secret', 'vapid_public', 'vapid_private', 'vapid_subject');
$$;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- ---------- przypomnienia przed godziną zadania / wydarzenia (co minutę) ----------
create or replace function public.ws_send_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare r record; rcpt uuid; u text;
begin
  for r in
    select i.workspace_id, i.id, i.data, w.timezone,
      ((i.data->>'due') || ' ' || (i.data->>'time'))::timestamp at time zone w.timezone as starts,
      coalesce(nullif(i.data->>'remind', '')::int, 10) as mins
    from ws_items i join workspaces w on w.id = i.workspace_id
    where i.kind = 'task'
      and coalesce((i.data->>'completed')::boolean, false) = false
      and coalesce(i.data->>'due', '') ~ '^\d{4}-\d{2}-\d{2}$'
      and coalesce(i.data->>'time', '') ~ '^\d{2}:\d{2}$'
      and (i.data->>'due')::date between current_date - 1 and current_date + 2
  loop
    if r.mins < 0 then continue; end if;
    if r.starts - make_interval(mins => r.mins) > now() or r.starts - make_interval(mins => r.mins) < now() - interval '3 minutes' then continue; end if;
    begin
      insert into ws_reminders_sent (workspace_id, task_id, stamp) values (r.workspace_id, r.id, (r.data->>'due') || ' ' || (r.data->>'time') || ' ' || r.mins);
    exception when unique_violation then continue;
    end;
    for u in select jsonb_array_elements_text(case when jsonb_array_length(coalesce(r.data->'assignees', '[]'::jsonb)) > 0 then r.data->'assignees' else jsonb_build_array(r.data->>'createdBy') end) loop
      begin rcpt := u::uuid; exception when others then continue; end;
      if exists (select 1 from ws_members where workspace_id = r.workspace_id and user_id = rcpt) then
        insert into ws_notifications (workspace_id, user_id, kind, task_id, title, body)
        values (r.workspace_id, rcpt, 'reminder', r.id, coalesce(r.data->>'title', 'Zadanie'),
          case when r.mins = 0 then 'Zaczyna się teraz' else 'Za ' || case when r.mins >= 1440 then (r.mins / 1440) || ' d.' when r.mins >= 60 then (r.mins / 60) || ' godz.' else r.mins || ' min' end end
          || ' · ' || (r.data->>'time') || coalesce('–' || nullif(r.data->>'endTime', ''), '') || coalesce(' · ' || nullif(r.data->>'location', ''), ''));
      end if;
    end loop;
  end loop;
  delete from ws_reminders_sent where sent_at < now() - interval '7 days';
  delete from ws_notifications where created_at < now() - interval '60 days';
end $$;
revoke execute on function public.ws_send_reminders() from public, anon, authenticated;
do $$ begin
  perform cron.unschedule('listo-team-reminders') where exists (select 1 from cron.job where jobname = 'listo-team-reminders');
  perform cron.schedule('listo-team-reminders', '* * * * *', 'select public.ws_send_reminders()');
end $$;

-- ---------- zadania po terminie: codzienne przypomnienie o 8:00 (czas zespołu) i „Przypomnij” z Raportów ----------
create or replace function public.ws_send_overdue() returns void
language plpgsql security definer set search_path = public as $$
declare r record; n int; titles text; first_id text;
begin
  for r in
    select m.workspace_id, m.user_id, w.timezone
    from ws_members m join workspaces w on w.id = m.workspace_id
    where extract(hour from now() at time zone w.timezone) = 8
      and coalesce((select p.state->'settings'->>'overduePush' from team_prefs p where p.user_id = m.user_id), 'true') <> 'false'
  loop
    select count(*), string_agg(x.title, ', ' order by x.due), (array_agg(x.id order by x.due))[1]
      into n, titles, first_id
    from (
      select i.id, coalesce(i.data->>'title', 'Zadanie') as title, i.data->>'due' as due
      from ws_items i
      where i.workspace_id = r.workspace_id and i.kind = 'task'
        and coalesce((i.data->>'completed')::boolean, false) = false
        and coalesce(i.data->>'kind', 'task') <> 'event'
        and coalesce(i.data->>'due', '') ~ '^\d{4}-\d{2}-\d{2}$'
        and (i.data->>'due')::date < (now() at time zone r.timezone)::date
        and coalesce(i.data->'assignees', '[]'::jsonb) ? r.user_id::text
      limit 50
    ) x;
    if n = 0 then continue; end if;
    begin
      insert into ws_reminders_sent (workspace_id, task_id, stamp) values (r.workspace_id, r.user_id::text, 'overdue ' || (now() at time zone r.timezone)::date);
    exception when unique_violation then continue;
    end;
    insert into ws_notifications (workspace_id, user_id, kind, task_id, title, body)
    values (r.workspace_id, r.user_id, 'overdue', case when n = 1 then first_id end,
      case when n = 1 then 'Masz 1 zadanie po terminie' else 'Masz ' || n || ' zadań po terminie' end,
      left(titles, 180));
  end loop;
end $$;
revoke execute on function public.ws_send_overdue() from public, anon, authenticated;
do $$ begin
  perform cron.unschedule('listo-team-overdue') where exists (select 1 from cron.job where jobname = 'listo-team-overdue');
  perform cron.schedule('listo-team-overdue', '5 * * * *', 'select public.ws_send_overdue()');
end $$;

create or replace function public.nudge_overdue(ws uuid, target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; who text;
begin
  if not public.is_member(ws) or not exists (select 1 from ws_members where workspace_id = ws and user_id = target) then raise exception 'forbidden'; end if;
  select count(*) into n from ws_items i
  where i.workspace_id = ws and i.kind = 'task'
    and coalesce((i.data->>'completed')::boolean, false) = false
    and coalesce(i.data->>'due', '') ~ '^\d{4}-\d{2}-\d{2}$' and (i.data->>'due')::date < current_date
    and coalesce(i.data->'assignees', '[]'::jsonb) ? target::text;
  if n = 0 then raise exception 'brak zaległych zadań'; end if;
  begin
    insert into ws_reminders_sent (workspace_id, task_id, stamp) values (ws, target::text, 'nudge ' || to_char(now(), 'YYYY-MM-DD HH24'));
  exception when unique_violation then raise exception 'limit: przypomnienie wysłano w tej godzinie';
  end;
  select coalesce(name, 'Ktoś z zespołu') into who from ws_members where workspace_id = ws and user_id = auth.uid();
  insert into ws_notifications (workspace_id, user_id, actor_id, kind, title, body)
  values (ws, target, auth.uid(), 'nudge', 'Przypomnienie o zaległych zadaniach', who || ' przypomina: masz ' || n || case when n = 1 then ' zadanie' when n < 5 then ' zadania' else ' zadań' end || ' po terminie');
end $$;
revoke execute on function public.nudge_overdue(uuid, uuid) from public, anon;
grant execute on function public.nudge_overdue(uuid, uuid) to authenticated;

-- ---------- zmiany na żywo (Realtime) ----------
do $$
declare t text;
begin
  foreach t in array array['ws_items', 'ws_members', 'ws_notifications', 'ws_calendars'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
