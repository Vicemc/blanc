-- =============================================================================
-- Acesso de LEITURA para VISITANTES ANÔNIMOS (sem login)
-- Digimon Survive Companion — A Midnight Summer's Dream
-- =============================================================================
-- Objetivo: permitir que visitantes sem conta (role `anon`) possam VER, em modo
-- somente-leitura, as abas Party, Goggle Girl, Sistema, Teatro e Wiki.
--
-- O frontend já restringe o que o visitante pode acessar/editar; este arquivo
-- abre apenas o SELECT necessário no banco e NÃO concede nenhuma escrita.
--
-- Tabelas que o visitante precisa LER:
--   • app_state  → Party, Goggle Girl, Sistema, Teatro (estado central da campanha)
--   • stages     → palcos/combates do Teatro
--   • signs      → SIGNs da Goggle Girl
--   • wiki_*     → já tinham SELECT público (using(true) sem `to`) — ver bloco final
--   • campaign_config → já tinha SELECT público
--   • storage portraits/assets → já liberados para `anon` no schema base
--
-- NÃO recebem acesso anônimo (continuam só `authenticated`):
--   profiles, digivices, digi_zap_*, gm_notes, gm_items, skill_tree_phases, maps_*
--
-- Idempotente: pode ser re-executado com segurança (drop policy if exists).
-- Executar no SQL Editor do Supabase.
-- =============================================================================


-- ── app_state — leitura anônima ──────────────────────────────────────────────
-- Estado central da campanha (tamers, bestiary, bugs, survivors, etc.).
drop policy if exists "app_state_select_anon" on public.app_state;
create policy "app_state_select_anon"
  on public.app_state for select to anon
  using (true);


-- ── stages — leitura anônima ─────────────────────────────────────────────────
-- Palcos do Teatro (combates ao vivo). Somente leitura; nenhuma policy de
-- insert/update/delete para anon é criada, então o visitante não altera nada.
drop policy if exists "stages_select_anon" on public.stages;
create policy "stages_select_anon"
  on public.stages for select to anon
  using (true);


-- ── signs — leitura anônima ──────────────────────────────────────────────────
-- SIGNs exibidos na Goggle Girl. A revelação fina é controlada no frontend
-- (campo no JSONB `data`), igual ao comportamento dos players autenticados.
drop policy if exists "signs_select_anon" on public.signs;
create policy "signs_select_anon"
  on public.signs for select to anon
  using (true);


-- =============================================================================
-- ENDURECIMENTO: writes abertos da Wiki
-- =============================================================================
-- As migrações da Wiki criaram policies `for all using (true)` SEM cláusula
-- `to`, o que vale para TODOS os roles (incluindo `anon`). Isso permitiria que
-- um visitante anônimo INSERISSE/ALTERASSE/DELETASSE páginas da wiki.
-- Agora que o acesso anônimo está ativo, restringimos a escrita a usuários
-- autenticados, mantendo a LEITURA pública (inclusive anônima).
-- =============================================================================

-- wiki_pages: separa leitura (pública) de escrita (autenticados)
drop policy if exists "wiki_pages_all"    on public.wiki_pages;
drop policy if exists "wiki_pages_select" on public.wiki_pages;
create policy "wiki_pages_select"
  on public.wiki_pages for select
  using (true);                       -- leitura pública (anon + authenticated)
create policy "wiki_pages_write"
  on public.wiki_pages for all to authenticated
  using (true) with check (true);     -- escrita só autenticada

-- wiki_relations
drop policy if exists "wiki_relations_all"    on public.wiki_relations;
drop policy if exists "wiki_relations_select" on public.wiki_relations;
create policy "wiki_relations_select"
  on public.wiki_relations for select
  using (true);
create policy "wiki_relations_write"
  on public.wiki_relations for all to authenticated
  using (true) with check (true);

-- wiki_page_edits (sugestões de edição colaborativa) — só existe se a
-- migração wiki_collab_migration.sql foi aplicada. O bloco DO ignora se a
-- tabela não existir.
do $$
begin
  if to_regclass('public.wiki_page_edits') is not null then
    execute 'drop policy if exists "wiki_page_edits_all"    on public.wiki_page_edits';
    execute 'drop policy if exists "wiki_page_edits_select" on public.wiki_page_edits';
    execute 'create policy "wiki_page_edits_select" on public.wiki_page_edits for select using (true)';
    execute 'create policy "wiki_page_edits_write"  on public.wiki_page_edits for all to authenticated using (true) with check (true)';
  end if;
end $$;


-- =============================================================================
-- (Opcional) ENDURECIMENTO: writes abertos dos Mapas
-- =============================================================================
-- maps/map_layers/map_pins também usam `for all using (true)` sem `to`, então
-- hoje aceitam escrita de qualquer role. A rota /mapas está bloqueada para
-- visitantes no frontend, mas por segurança restringimos a escrita a
-- autenticados (a leitura continua pública). Descomente se quiser aplicar.
--
-- drop policy if exists "maps_all"        on public.maps;
-- create policy "maps_write"        on public.maps        for all to authenticated using (true) with check (true);
-- drop policy if exists "map_layers_all"  on public.map_layers;
-- create policy "map_layers_write"  on public.map_layers  for all to authenticated using (true) with check (true);
-- drop policy if exists "map_pins_all"    on public.map_pins;
-- create policy "map_pins_write"    on public.map_pins    for all to authenticated using (true) with check (true);


-- =============================================================================
-- VERIFICAÇÃO (opcional) — rode para conferir as policies de SELECT por role
-- =============================================================================
-- select schemaname, tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('app_state','stages','signs','wiki_pages','wiki_relations','campaign_config')
-- order by tablename, cmd, policyname;
