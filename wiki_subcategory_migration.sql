-- =============================================================================
-- Wiki: subcategorias (espaços dentro de uma categoria) + ordem de exibição
-- =============================================================================
-- subcategory: espaço manual atribuído pelo editor (ex.: 'senpais', 'zaika').
--   Tamers/Survivors agrupam automaticamente pelo vínculo (linked_type), então
--   não dependem desta coluna.
-- sort_order: ordem dentro do espaço (menor = primeiro). Semeado pelo botão
--   "Inicializar páginas" com a ordem canônica de tamers/survivors.
-- As definições de subcategorias gerenciadas pelo GM ficam em campaign_config
--   (chave 'wiki_subcategories'), não exigindo tabela nova.
-- Retrocompatível: páginas antigas ficam com subcategory NULL e sort_order 0
--   (caem em "Outros" e ordenam por título).

alter table wiki_pages
  add column if not exists subcategory text,
  add column if not exists sort_order  int not null default 0;

alter table wiki_page_edits
  add column if not exists subcategory text;

create index if not exists wiki_pages_subcat_idx
  on wiki_pages(category, subcategory);
