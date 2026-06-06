-- Mapas interativos do GM
create table if not exists maps (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  text not null,
  title        text not null,
  description  text not null default '',
  bg_url       text,
  bg_width     int  not null default 1000,
  bg_height    int  not null default 800,
  visibility   text not null default 'hidden',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists maps_campaign_idx on maps(campaign_id);

-- Layers: agrupam pins e podem ser toggled pelo GM
create table if not exists map_layers (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references maps(id) on delete cascade,
  campaign_id  text not null,
  name         text not null,
  visible      boolean not null default true,
  order_index  int     not null default 0
);

create index if not exists map_layers_map_idx on map_layers(map_id);

-- Pins: marcadores interativos sobre o mapa
create table if not exists map_pins (
  id              uuid primary key default gen_random_uuid(),
  map_id          uuid not null references maps(id) on delete cascade,
  layer_id        uuid not null references map_layers(id) on delete cascade,
  campaign_id     text not null,
  label           text not null,
  description     text not null default '',
  x               float not null,
  y               float not null,
  icon            text not null default 'default',
  visibility      text not null default 'hidden',
  linked_wiki_id  uuid references wiki_pages(id) on delete set null,
  linked_map_id   uuid references maps(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists map_pins_map_idx   on map_pins(map_id);
create index if not exists map_pins_layer_idx on map_pins(layer_id);

-- RLS
alter table maps       enable row level security;
alter table map_layers enable row level security;
alter table map_pins   enable row level security;

create policy "maps_select"        on maps        for select using (true);
create policy "maps_all"           on maps        for all    using (true);
create policy "map_layers_select"  on map_layers  for select using (true);
create policy "map_layers_all"     on map_layers  for all    using (true);
create policy "map_pins_select"    on map_pins    for select using (true);
create policy "map_pins_all"       on map_pins    for all    using (true);
