-- Migration (v1.4), run after the earlier ones: notes (voice or text) from the phone + spoken how-to audio per move, both private; guest_load returns her last 20 notes.
begin;
create table guest.messages (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guest.users(id) on delete cascade,
  client_id text not null check (client_id ~ '^[0-9a-fA-F-]{8,64}$'),
  kind text not null check (kind in ('voice','text')),
  text text check (length(text) <= 4000),
  audio bytea check (octet_length(audio) <= 4194304),
  mime text check (length(mime) <= 60),
  duration_sec int check (duration_sec between 0 and 600),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (guest_id, client_id),
  check ((kind = 'voice' and audio is not null) or (kind = 'text' and text is not null and length(btrim(text)) > 0))
);
create table guest.audio (
  guest_id uuid not null references guest.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  mp3 bytea not null check (octet_length(mp3) <= 2097152),
  created_at timestamptz not null default now(),
  primary key (guest_id, name)
);
alter table guest.messages enable row level security;
alter table guest.audio enable row level security;
revoke all on guest.messages, guest.audio from public, anon, authenticated;
grant select, insert, update, delete on guest.messages, guest.audio to service_role;

create or replace function public.guest_save_message(p_code text, p_msg json) returns json
language plpgsql security definer set search_path = '' as $$
declare v_user guest.users%rowtype; v_recent int; v_total int; v_audio bytea;
begin
  if public.guest_locked() then return json_build_object('ok', false, 'reason', 'locked'); end if;
  if pg_column_size(p_msg) > 6000000 then return json_build_object('ok', false, 'reason', 'too big'); end if;
  select * into v_user from guest.users where code_hash = public.guest_code_hash(p_code);
  if not found then perform public.guest_note_fail(); return json_build_object('ok', false, 'reason', 'bad code'); end if;
  select count(*) filter (where created_at > now() - interval '1 day'), count(*)
    into v_recent, v_total from guest.messages where guest_id = v_user.id;
  if v_recent >= 30 or v_total >= 1000 then return json_build_object('ok', false, 'reason', 'too many'); end if;
  if p_msg->>'kind' = 'voice' then
    v_audio := decode(regexp_replace(coalesce(p_msg->>'audio_b64',''), '\s', '', 'g'), 'base64');
  end if;
  insert into guest.messages (guest_id, client_id, kind, text, audio, mime, duration_sec)
  values (v_user.id, p_msg->>'client_id', p_msg->>'kind', nullif(btrim(p_msg->>'text'),''), v_audio,
          p_msg->>'mime', (p_msg->>'duration_sec')::int)
  on conflict (guest_id, client_id) do nothing;
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false, 'reason', 'bad input');
end $$;

create or replace function public.guest_get_audio(p_code text, p_name text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_user guest.users%rowtype; v_mp3 bytea;
begin
  if public.guest_locked() then return json_build_object('locked', true); end if;
  select * into v_user from guest.users where code_hash = public.guest_code_hash(p_code);
  if not found then perform public.guest_note_fail(); return null; end if;
  select a.mp3 into v_mp3 from guest.audio a where a.guest_id = v_user.id and a.name = p_name;
  if v_mp3 is null then return json_build_object('missing', true); end if;
  return json_build_object('mime', 'audio/mpeg', 'b64', translate(encode(v_mp3, 'base64'), E'\n', ''));
end $$;
create or replace function public.guest_load(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_user guest.users%rowtype;
begin
  if public.guest_locked() then return json_build_object('locked', true); end if;
  select * into v_user from guest.users where code_hash = public.guest_code_hash(p_code);
  if not found then perform public.guest_note_fail(); return null; end if;
  return json_build_object(
    'name', v_user.display_name,
    'tell_whatsapp', v_user.tell_whatsapp,
    'program', (select json_build_object('week', p.week, 'data', p.data)
                from guest.program p where p.guest_id = v_user.id and p.active limit 1),
    'sessions', coalesce((select json_agg(json_build_object('client_id', s.client_id, 'done_at', s.done_at, 'started_at', s.started_at, 'duration_sec', s.duration_sec, 'lite', s.lite, 'readings', s.readings, 'moves', s.moves, 'note', s.note, 'week', s.week, 'workout', s.workout,
                                            'feel', s.feel, 'check_0_10', s.check_0_10) order by s.done_at desc)
                          from (select * from guest.sessions where guest_id = v_user.id
                                order by done_at desc limit 60) s), '[]'::json),
    'questions', coalesce((select json_agg(json_build_object('id', q.id, 'section', q.section, 'text', q.text) order by q.ord)
                           from guest.questions q
                           where q.guest_id = v_user.id
                             and not exists (select 1 from guest.answers a where a.question_id = q.id)), '[]'::json),
    'answered', (select count(distinct a.question_id) from guest.answers a where a.guest_id = v_user.id),
    'weeks', coalesce((select json_agg(json_build_object('week', p.week, 'label', p.data->>'label', 'active', p.active,
        'workouts', coalesce((select json_agg(json_build_object('id', w->>'id', 'name', w->>'name',
            'moves', coalesce((select json_agg(m->>'name') from jsonb_array_elements(coalesce(w->'warmup','[]'::jsonb) || coalesce(w->'main','[]'::jsonb) || coalesce(w->'cooldown','[]'::jsonb)) m), '[]'::json)))
          from jsonb_array_elements(coalesce(p.data->'workouts','[]'::jsonb)) w), '[]'::json)) order by p.week)
      from guest.program p where p.guest_id = v_user.id), '[]'::json),
    'messages', coalesce((select json_agg(json_build_object('client_id', g.client_id, 'kind', g.kind, 'created_at', g.created_at, 'duration_sec', g.duration_sec, 'text', left(g.text, 200), 'read', g.read_at is not null) order by g.created_at desc)
      from (select * from guest.messages where guest_id = v_user.id order by created_at desc limit 20) g), '[]'::json),
    'next', (select n.data from guest.program n join guest.program a on a.guest_id = n.guest_id and a.active
             where n.guest_id = v_user.id and not n.active and n.week = a.week + 1 limit 1));
end $$;
revoke all on function public.guest_save_message(text, json) from public, anon, authenticated;
grant execute on function public.guest_save_message(text, json) to anon, service_role;
revoke all on function public.guest_get_audio(text, text) from public, anon, authenticated;
grant execute on function public.guest_get_audio(text, text) to anon, service_role;
revoke all on function public.guest_load(text) from public, authenticated;
grant execute on function public.guest_load(text) to anon, service_role;
notify pgrst, 'reload schema';
commit;
