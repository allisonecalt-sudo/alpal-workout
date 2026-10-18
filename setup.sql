-- Locked store for this app (guest schema + 2 anon RPCs). The final state as run (field named check_0_10).
-- ONE batch. A multi-statement simple query already runs as one implicit transaction; keep BEGIN/COMMIT if the API accepts them.
begin;

create schema if not exists guest;                          -- not exposed by the Data API
revoke all on schema guest from public, anon, authenticated;
grant usage on schema guest to service_role;

create table guest.users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(display_name) <= 60),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  tell_whatsapp text check (tell_whatsapp ~ '^[0-9]{8,15}$'),
  created_at timestamptz not null default now()
);
create table guest.program (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guest.users(id) on delete cascade,
  week int not null check (week between 1 and 520),
  data jsonb not null check (pg_column_size(data) <= 32768),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index program_one_active on guest.program (guest_id) where active;
create table guest.sessions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guest.users(id) on delete cascade,
  client_id text not null check (client_id ~ '^[0-9a-fA-F-]{8,64}$'),
  done_at timestamptz not null check (done_at > now() - interval '1 year' and done_at < now() + interval '1 day'),
  week int check (week between 1 and 520),
  moves jsonb check (pg_column_size(moves) <= 8192),
  feel text check (feel in ('easy','right','hard')),
  check_0_10 int check (check_0_10 between 0 and 10),
  note text check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (guest_id, client_id)
);
create table guest.attempts (                               -- brute-force throttle
  bucket timestamptz primary key,
  fails int not null default 0
);

alter table guest.users    enable row level security;
alter table guest.program  enable row level security;
alter table guest.sessions enable row level security;
alter table guest.attempts enable row level security;
revoke all on all tables in schema guest from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema guest to service_role;

-- helpers (not callable by anon: revoked below)
create or replace function public.guest_code_hash(p_code text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code,''), '[^0-9A-Za-z]', '', 'g')), 'UTF8')), 'hex')
$$;
create or replace function public.guest_locked() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(fails), 0) >= 30 from guest.attempts where bucket > now() - interval '15 minutes'
$$;
create or replace function public.guest_note_fail() returns void
language sql security definer set search_path = '' as $$
  insert into guest.attempts (bucket, fails) values (date_bin('10 minutes', now(), timestamptz 'epoch'), 1)
  on conflict (bucket) do update set fails = guest.attempts.fails + 1
$$;

create or replace function public.guest_load(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_user guest.users%rowtype;
begin
  if public.guest_locked() then return null; end if;
  select * into v_user from guest.users where code_hash = public.guest_code_hash(p_code);
  if not found then perform public.guest_note_fail(); return null; end if;
  return json_build_object(
    'name', v_user.display_name,
    'tell_whatsapp', v_user.tell_whatsapp,
    'program', (select json_build_object('week', p.week, 'data', p.data)
                from guest.program p where p.guest_id = v_user.id and p.active limit 1),
    'sessions', coalesce((select json_agg(json_build_object('done_at', s.done_at, 'week', s.week,
                                            'feel', s.feel, 'check_0_10', s.check_0_10) order by s.done_at desc)
                          from (select * from guest.sessions where guest_id = v_user.id
                                order by done_at desc limit 30) s), '[]'::json));
end $$;

create or replace function public.guest_save_session(p_code text, p_session json) returns json
language plpgsql security definer set search_path = '' as $$
declare v_user guest.users%rowtype; v_recent int; v_total int;
begin
  if public.guest_locked() then return json_build_object('ok', false, 'reason', 'locked'); end if;
  if pg_column_size(p_session) > 16384 then return json_build_object('ok', false, 'reason', 'too big'); end if;
  select * into v_user from guest.users where code_hash = public.guest_code_hash(p_code);
  if not found then perform public.guest_note_fail(); return json_build_object('ok', false, 'reason', 'bad code'); end if;
  select count(*) filter (where created_at > now() - interval '1 day'), count(*)
    into v_recent, v_total from guest.sessions where guest_id = v_user.id;
  if v_recent >= 20 or v_total >= 5000 then return json_build_object('ok', false, 'reason', 'too many'); end if;
  insert into guest.sessions (guest_id, client_id, done_at, week, moves, feel, check_0_10, note)
  values (v_user.id, p_session->>'client_id', (p_session->>'done_at')::timestamptz, (p_session->>'week')::int,
          (p_session->'moves')::jsonb, p_session->>'feel', (p_session->>'check_0_10')::int, nullif(p_session->>'note',''))
  on conflict (guest_id, client_id) do nothing;
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false, 'reason', 'bad input');
end $$;

-- privileges: close the PUBLIC default, open only the two entry points to anon (same transaction = no window)
revoke all on function public.guest_code_hash(text)            from public, anon, authenticated;
revoke all on function public.guest_locked()                   from public, anon, authenticated;
revoke all on function public.guest_note_fail()                from public, anon, authenticated;
revoke all on function public.guest_load(text)                 from public, anon, authenticated;
revoke all on function public.guest_save_session(text, json)   from public, anon, authenticated;
grant execute on function public.guest_load(text)               to anon, service_role;
grant execute on function public.guest_save_session(text, json) to anon, service_role;

notify pgrst, 'reload schema';
commit;
