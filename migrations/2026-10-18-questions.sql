-- Migration (questions), run after setup.sql. Same wall: guest schema, RLS on with no policies, anon reaches it only through the public.guest_* functions.
begin;

create table guest.questions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guest.users(id) on delete cascade,
  ord int not null check (ord between 1 and 1000),
  section text check (length(section) <= 120),
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (guest_id, ord)
);
create table guest.answers (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guest.users(id) on delete cascade,
  question_id uuid not null references guest.questions(id) on delete cascade,
  client_id text not null check (client_id ~ '^[0-9a-fA-F-]{8,64}$'),
  answer text not null check (length(answer) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (guest_id, client_id)
);
alter table guest.questions enable row level security;
alter table guest.answers   enable row level security;
revoke all on guest.questions, guest.answers from public, anon, authenticated;
grant select, insert, update, delete on guest.questions, guest.answers to service_role;

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
                                order by done_at desc limit 30) s), '[]'::json),
    'questions', coalesce((select json_agg(json_build_object('id', q.id, 'section', q.section, 'text', q.text) order by q.ord)
                           from guest.questions q
                           where q.guest_id = v_user.id
                             and not exists (select 1 from guest.answers a where a.question_id = q.id)), '[]'::json),
    'answered', (select count(distinct a.question_id) from guest.answers a where a.guest_id = v_user.id));
end $$;

create or replace function public.guest_save_answer(p_code text, p_answer json) returns json
language plpgsql security definer set search_path = '' as $$
declare v_user guest.users%rowtype; v_recent int; v_total int; v_q uuid;
begin
  if public.guest_locked() then return json_build_object('ok', false, 'reason', 'locked'); end if;
  if pg_column_size(p_answer) > 16384 then return json_build_object('ok', false, 'reason', 'too big'); end if;
  select * into v_user from guest.users where code_hash = public.guest_code_hash(p_code);
  if not found then perform public.guest_note_fail(); return json_build_object('ok', false, 'reason', 'bad code'); end if;
  select count(*) filter (where created_at > now() - interval '1 day'), count(*)
    into v_recent, v_total from guest.answers where guest_id = v_user.id;
  if v_recent >= 100 or v_total >= 2000 then return json_build_object('ok', false, 'reason', 'too many'); end if;
  select q.id into v_q from guest.questions q
    where q.id = (p_answer->>'question_id')::uuid and q.guest_id = v_user.id;
  if v_q is null then return json_build_object('ok', false, 'reason', 'no such question'); end if;
  insert into guest.answers (guest_id, question_id, client_id, answer)
  values (v_user.id, v_q, p_answer->>'client_id', btrim(p_answer->>'answer'))
  on conflict (guest_id, client_id) do nothing;
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false, 'reason', 'bad input');
end $$;

revoke all on function public.guest_save_answer(text, json) from public, anon, authenticated;
grant execute on function public.guest_save_answer(text, json) to anon, service_role;
-- guest_load: CREATE OR REPLACE keeps its grants (anon + service_role); re-assert anyway.
revoke all on function public.guest_load(text) from public, authenticated;
grant execute on function public.guest_load(text) to anon, service_role;

notify pgrst, 'reload schema';
commit;
