-- Migration (v1.4b-context), run after the earlier ones.
begin;
alter table guest.messages add column context text check (length(context) <= 200);
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
  insert into guest.messages (guest_id, client_id, kind, text, audio, mime, duration_sec, context)
  values (v_user.id, p_msg->>'client_id', p_msg->>'kind', nullif(btrim(p_msg->>'text'),''), v_audio,
          p_msg->>'mime', (p_msg->>'duration_sec')::int, nullif(btrim(p_msg->>'context'),''))
  on conflict (guest_id, client_id) do nothing;
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false, 'reason', 'bad input');
end $$;
revoke all on function public.guest_save_message(text, json) from public, anon, authenticated;
grant execute on function public.guest_save_message(text, json) to anon, service_role;
notify pgrst, 'reload schema';
commit;
