-- Wiki: restrição de edição por dono (PC pages)
alter table wiki_pages
  add column if not exists owner_tamer_id text;

create index if not exists wiki_pages_owner_idx
  on wiki_pages(owner_tamer_id)
  where owner_tamer_id is not null;
