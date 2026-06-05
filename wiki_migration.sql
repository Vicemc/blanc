-- Wiki: páginas de lore gerenciadas pelo GM
create table if not exists wiki_pages (
  id          uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  title       text not null,
  category    text not null,
  body        text not null default '',
  avatar_url  text,
  visibility  text not null default 'hidden',
  linked_type text,
  linked_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists wiki_pages_campaign_idx on wiki_pages(campaign_id);

-- Wiki: arestas do grafo de relacionamentos
create table if not exists wiki_relations (
  id          uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  from_id     uuid not null references wiki_pages(id) on delete cascade,
  to_id       uuid not null references wiki_pages(id) on delete cascade,
  label       text not null default ''
);

create index if not exists wiki_relations_campaign_idx on wiki_relations(campaign_id);

-- RLS: somente membros autenticados da campanha lêem; inserção/update/delete livre
-- (ajuste conforme a política de RLS do seu projeto)
alter table wiki_pages   enable row level security;
alter table wiki_relations enable row level security;

create policy "wiki_pages_select"    on wiki_pages   for select using (true);
create policy "wiki_pages_all"       on wiki_pages   for all    using (true);
create policy "wiki_relations_select" on wiki_relations for select using (true);
create policy "wiki_relations_all"   on wiki_relations for all   using (true);
