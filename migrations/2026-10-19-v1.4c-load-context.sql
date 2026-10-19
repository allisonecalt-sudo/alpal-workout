-- Migration (v1.4c-load-context), run after the earlier ones.
begin;
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
    'messages', coalesce((select json_agg(json_build_object('client_id', g.client_id, 'kind', g.kind, 'created_at', g.created_at, 'duration_sec', g.duration_sec, 'text', left(g.text, 200), 'context', g.context, 'read', g.read_at is not null) order by g.created_at desc)
      from (select * from guest.messages where guest_id = v_user.id order by created_at desc limit 20) g), '[]'::json),
    'next', (select n.data from guest.program n join guest.program a on a.guest_id = n.guest_id and a.active
             where n.guest_id = v_user.id and not n.active and n.week = a.week + 1 limit 1));
end $$;
revoke all on function public.guest_load(text) from public, authenticated;
grant execute on function public.guest_load(text) to anon, service_role;
notify pgrst, 'reload schema';
commit;
