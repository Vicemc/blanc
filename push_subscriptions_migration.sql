-- =============================================================================
-- push_subscriptions — inscrições de Web Push (PWA) para notificações do Digi-Zap
-- =============================================================================
-- Cada navegador/dispositivo gera uma PushSubscription única (endpoint + chaves).
-- Guardamos por usuário para que a Edge Function `send-push` possa entregar
-- notificações de novas mensagens quando o app está fechado.
--
-- Requer a extensão pg_net habilitada para o trigger de envio (ver abaixo).
-- Habilite em: Dashboard → Database → Extensions → pg_net.

create table if not exists public.push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- character_id (tamer) do usuário, para filtrar destinatários por grupo
  character_id text,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_char_idx on public.push_subscriptions(character_id);

alter table public.push_subscriptions enable row level security;

-- Cada usuário gerencia apenas as próprias inscrições.
drop policy if exists "push_subs_select_own" on public.push_subscriptions;
create policy "push_subs_select_own"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_subs_insert_own" on public.push_subscriptions;
create policy "push_subs_insert_own"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_subs_delete_own" on public.push_subscriptions;
create policy "push_subs_delete_own"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());


-- =============================================================================
-- Trigger: ao inserir uma mensagem no Digi-Zap, chama a Edge Function send-push
-- =============================================================================
-- Usa pg_net (net.http_post) para invocar a function de forma assíncrona.
-- Defina os GUCs do projeto (uma vez, via SQL editor) antes de criar o trigger:
--
--   alter database postgres set app.edge_base_url    = 'https://<PROJECT_REF>.functions.supabase.co';
--   alter database postgres set app.service_role_key = '<SERVICE_ROLE_KEY>';
--
-- (Reconecte a sessão após o alter database para os GUCs valerem.)

create or replace function public.notify_digizap_push()
returns trigger as $$
declare
  v_base text := current_setting('app.edge_base_url', true);
  v_key  text := current_setting('app.service_role_key', true);
begin
  if v_base is null or v_key is null then
    return new; -- não configurado: silencioso, não bloqueia o insert
  end if;

  perform net.http_post(
    url     := v_base || '/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'group_id',  new.group_id,
      'sender_id', new.sender_id,
      'content',   new.content,
      'message_id', new.id
    )
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists digizap_push_trigger on public.digi_zap_messages;
create trigger digizap_push_trigger
  after insert on public.digi_zap_messages
  for each row execute function public.notify_digizap_push();
