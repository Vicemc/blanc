-- =============================================================================
-- Wiki: páginas detalhadas (infobox, galeria, seções) via coluna content jsonb
-- =============================================================================
-- Retrocompatível: páginas antigas ficam com content = '{}' e renderizam só
-- o body + avatar atuais. A mesma coluna entra em wiki_page_edits para o fluxo
-- de aprovação de edições dos players.

alter table wiki_pages
  add column if not exists content jsonb not null default '{}'::jsonb;

alter table wiki_page_edits
  add column if not exists content jsonb not null default '{}'::jsonb;
