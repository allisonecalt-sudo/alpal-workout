-- Migration (locked), run after setup.sql. Same wall: guest schema, RLS on with no policies, anon reaches it only through the public.guest_* functions.
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
    'sessions', coalesce((select json_agg(json_build_object('done_at', s.done_at, 'week', s.week, 'workout', s.workout,
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
notify pgrst, 'reload schema';
commit;
