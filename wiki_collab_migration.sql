-- Wiki colaborativa: players podem editar e criar páginas
-- Novas colunas em wiki_pages

alter table wiki_pages
  add column if not exists status    text not null default 'approved',
  add column if not exists author_id uuid references auth.users(id) on delete set null;

-- status: 'approved' (páginas existentes e aprovadas pelo GM)
--         'pending'  (nova página criada por player aguardando aprovação)
--         'draft'    (edição de página existente aguardando aprovação)

-- Tabela separada para edições pendentes de páginas existentes
create table if not exists wiki_page_edits (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references wiki_pages(id) on delete cascade,
  campaign_id text not null,
  author_id   uuid references auth.users(id) on delete set null,
  title       text not null,
  body        text not null default '',
  category    text not null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now()
);

create index if not exists wiki_page_edits_page_idx     on wiki_page_edits(page_id);
create index if not exists wiki_page_edits_campaign_idx on wiki_page_edits(campaign_id);
create index if not exists wiki_page_edits_status_idx   on wiki_page_edits(status);

alter table wiki_page_edits enable row level security;
create policy "wiki_page_edits_select" on wiki_page_edits for select using (true);
create policy "wiki_page_edits_all"    on wiki_page_edits for all    using (true);
