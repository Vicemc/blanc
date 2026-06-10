-- =============================================================================
-- campaign_config — flags/configurações campaign-wide (chave → valor jsonb)
-- =============================================================================
-- Padrão reutilizável para flags globais que o GM liga/desliga para todos.
-- Primeira flag: 'wiki_detailed_pages' (boolean, ausente = false).
-- Leitura pública (todos os membros da campanha); escrita apenas pelo GM
-- via is_gm() (definido em supabase_player_writes.sql / schema base).

create table if not exists campaign_config (
  campaign_id text not null,
  key         text not null,
  value       jsonb not null default 'null'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, key)
);

alter table campaign_config enable row level security;

-- Select liberado para qualquer autenticado (a flag precisa chegar nos players)
drop policy if exists "campaign_config_select" on campaign_config;
create policy "campaign_config_select"
  on campaign_config for select
  using (true);

-- Insert/Update/Delete somente para o GM
drop policy if exists "campaign_config_write" on campaign_config;
create policy "campaign_config_write"
  on campaign_config for all
  using (public.is_gm())
  with check (public.is_gm());

-- Realtime
alter publication supabase_realtime add table campaign_config;
