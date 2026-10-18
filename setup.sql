-- setup.sql: the locked store for this app. Written as a file only; NOT run by the build.
-- The phone never touches a table. It calls two functions with the public anon key, and each
-- function checks an access code (stored only as a hash). Everything else is locked.
--
-- Tables have RLS on and NO policies, and anon/authenticated have no grants on them.
-- Only the service role (the owner's own tools) can read or write rows directly.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables
create table if not exists public.guest_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  code_hash text unique not null,
  tell_whatsapp text,
  created_at timestamptz default now()
);

create table if not exists public.guest_program (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guest_users on delete cascade,
  week int not null,
  data jsonb not null,
  active boolean default false,
  updated_at timestamptz default now()
);

-- At most one active program row per guest.
create unique index if not exists guest_program_one_active
  on public.guest_program (guest_id) where active;

create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guest_users on delete cascade,
  client_id text unique not null,
  done_at timestamptz not null,
  week int,
  moves jsonb,
  feel text check (feel in ('easy', 'right', 'hard')),
  check_0_10 int check (check_0_10 between 0 and 10),
  note text check (length(note) <= 2000),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------- lock the tables
alter table public.guest_users enable row level security;
alter table public.guest_program enable row level security;
alter table public.guest_sessions enable row level security;

revoke all on public.guest_users from anon, authenticated;
revoke all on public.guest_program from anon, authenticated;
revoke all on public.guest_sessions from anon, authenticated;

grant all on public.guest_users to service_role;
grant all on public.guest_program to service_role;
grant all on public.guest_sessions to service_role;

-- ---------------------------------------------------------------- guest_load
-- Returns {name, tell_whatsapp, program, sessions} or null for a bad code.
-- program is the active row's data plus its week; sessions are the last 30.
create or replace function public.guest_load(p_code text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.guest_users;
  v_program json;
  v_sessions json;
begin
  select * into v_user
  from public.guest_users
  where code_hash = encode(extensions.digest(upper(coalesce(p_code, '')), 'sha256'), 'hex');

  if not found then
    return null;
  end if;

  select (gp.data || jsonb_build_object('week', gp.week))::json into v_program
  from public.guest_program gp
  where gp.guest_id = v_user.id and gp.active
  limit 1;

  select coalesce(json_agg(s order by s.done_at desc), '[]'::json) into v_sessions
  from (
    select gs.done_at, gs.week, gs.feel, gs.check_0_10
    from public.guest_sessions gs
    where gs.guest_id = v_user.id
    order by gs.done_at desc
    limit 30
  ) s;

  return json_build_object(
    'name', v_user.display_name,
    'tell_whatsapp', v_user.tell_whatsapp,
    'program', v_program,
    'sessions', v_sessions
  );
end;
$$;

-- ---------------------------------------------------------------- guest_save_session
-- Checks the code, then each field, then inserts. A repeated client_id is ignored, so a
-- retry from the phone never duplicates. Returns {ok:true} or {ok:false, reason}.
create or replace function public.guest_save_session(p_code text, p_session json)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_client_id text;
  v_done_at timestamptz;
  v_week int;
  v_moves jsonb;
  v_feel text;
  v_check int;
  v_note text;
begin
  select id into v_user_id
  from public.guest_users
  where code_hash = encode(extensions.digest(upper(coalesce(p_code, '')), 'sha256'), 'hex');

  if not found then
    return json_build_object('ok', false, 'reason', 'bad_code');
  end if;

  if p_session is null or json_typeof(p_session) <> 'object' then
    return json_build_object('ok', false, 'reason', 'bad_session');
  end if;

  begin
    v_client_id := p_session->>'client_id';
    v_done_at := (p_session->>'done_at')::timestamptz;
    v_week := (p_session->>'week')::int;
    v_moves := (p_session->'moves')::jsonb;
    v_feel := p_session->>'feel';
    v_check := (p_session->>'check_0_10')::int;
    v_note := p_session->>'note';
  exception when others then
    return json_build_object('ok', false, 'reason', 'bad_session');
  end;

  if v_client_id is null or length(v_client_id) not between 1 and 64 then
    return json_build_object('ok', false, 'reason', 'bad_client_id');
  end if;
  if v_done_at is null then
    return json_build_object('ok', false, 'reason', 'bad_done_at');
  end if;
  if v_moves is not null and (jsonb_typeof(v_moves) <> 'array' or jsonb_array_length(v_moves) > 100) then
    return json_build_object('ok', false, 'reason', 'bad_moves');
  end if;
  if v_feel is not null and v_feel not in ('easy', 'right', 'hard') then
    return json_build_object('ok', false, 'reason', 'bad_feel');
  end if;
  if v_check is not null and v_check not between 0 and 10 then
    return json_build_object('ok', false, 'reason', 'bad_check');
  end if;
  if v_note is not null and length(v_note) > 2000 then
    return json_build_object('ok', false, 'reason', 'note_too_long');
  end if;

  insert into public.guest_sessions (guest_id, client_id, done_at, week, moves, feel, check_0_10, note)
  values (v_user_id, v_client_id, v_done_at, v_week, v_moves, v_feel, v_check, v_note)
  on conflict (client_id) do nothing;

  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- who may call them
revoke all on function public.guest_load(text) from public, anon, authenticated;
revoke all on function public.guest_save_session(text, json) from public, anon, authenticated;
grant execute on function public.guest_load(text) to anon;
grant execute on function public.guest_save_session(text, json) to anon;
grant execute on function public.guest_load(text) to service_role;
grant execute on function public.guest_save_session(text, json) to service_role;
