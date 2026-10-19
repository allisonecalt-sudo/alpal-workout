-- Migration (round1), run after the earlier ones: sessions gain started_at, duration_sec, lite, readings; history reads them back; program data cap 64 KB.
begin;
alter table guest.sessions add column started_at timestamptz check (started_at > now() - interval '1 year' and started_at < now() + interval '1 day'),
  add column duration_sec int check (duration_sec between 0 and 36000),
  add column lite boolean not null default false,
  add column readings jsonb check (pg_column_size(readings) <= 8192);
alter table guest.program drop constraint if exists program_data_check;
alter table guest.program add constraint program_data_check check (pg_column_size(data) <= 65536);
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
  insert into guest.sessions (guest_id, client_id, done_at, week, workout, moves, feel, check_0_10, note, started_at, duration_sec, lite, readings)
  values (v_user.id, p_session->>'client_id', (p_session->>'done_at')::timestamptz, (p_session->>'week')::int, nullif(p_session->>'workout',''),
          (p_session->'moves')::jsonb, p_session->>'feel', (p_session->>'check_0_10')::int, nullif(p_session->>'note',''),
          (p_session->>'started_at')::timestamptz, (p_session->>'duration_sec')::int, coalesce((p_session->>'lite')::boolean, false), (p_session->'readings')::jsonb)
  on conflict (guest_id, client_id) do nothing;
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false, 'reason', 'bad input');
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
                                order by done_at desc limit 30) s), '[]'::json),
    'questions', coalesce((select json_agg(json_build_object('id', q.id, 'section', q.section, 'text', q.text) order by q.ord)
                           from guest.questions q
                           where q.guest_id = v_user.id
                             and not exists (select 1 from guest.answers a where a.question_id = q.id)), '[]'::json),
    'answered', (select count(distinct a.question_id) from guest.answers a where a.guest_id = v_user.id));
end $$;
revoke all on function public.guest_load(text) from public, authenticated;
grant execute on function public.guest_load(text) to anon, service_role;
revoke all on function public.guest_save_session(text, json) from public, authenticated;
grant execute on function public.guest_save_session(text, json) to anon, service_role;
notify pgrst, 'reload schema';
commit;
