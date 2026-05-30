-- =============================================================================
-- DIGI-ZAP v2 — Anexos, reações e respostas
-- =============================================================================
-- Executar no SQL Editor do Supabase após o schema base.

alter table public.digi_zap_messages
  add column if not exists attachment_url text,
  add column if not exists reactions      jsonb  not null default '{}'::jsonb,
  add column if not exists reply_to       uuid   references public.digi_zap_messages(id) on delete set null;

-- Index para reply chains
create index if not exists digi_zap_messages_reply_idx on public.digi_zap_messages(reply_to);

-- Política para update: participantes do grupo podem dar update (apenas em reactions)
-- A camada de aplicação cuida de filtrar apenas o campo reactions.
create policy "digi_zap_messages_update_reactions"
  on public.digi_zap_messages for update to authenticated
  using (public.is_participant(group_id));
