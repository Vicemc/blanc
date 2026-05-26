-- =============================================================================
-- Supabase Schema v2 — Digimon Survive Companion App
-- Campanha: A Midnight Summer's Dream
-- =============================================================================
-- Revisão completa considerando o roadmap expandido:
--   → Sistema de usuários (GM + Players com digivices próprios)
--   → Backstage (controle total do GM)
--   → Digivice (fichas, inventário, records, mapas, Digi-Zap)
--   → SIGNs (nova aba da Goggle Girl)
--   → Skill Tree por fase, liberada pelo GM
--   → Palco expandido (relógios, condições, rounds, HP/Defesa em tempo real)
-- =============================================================================
-- Executar no SQL Editor do Supabase em ordem.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSÕES
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";  -- para gen_random_uuid() e hash de senhas


-- =============================================================================
-- BLOCO 1 — USUÁRIOS E IDENTIDADE
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES
-- Estende auth.users. Cada usuário tem um role e, se for player, tem um tamer_id.
-- Se for GM ou NPC-controller, tem um npc_id ao invés de tamer_id.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null,
  role            text not null default 'player'
                  check (role in ('gm', 'player', 'guest')),

  -- Vínculo com personagem (mutuamente exclusivos em uso, não em schema)
  tamer_id        text,   -- ex: 't-naoki' — preenchido para players
  npc_id          text,   -- ex: 't-hare'  — preenchido quando GM assume um NPC no Digi-Zap

  -- Preferência de visualização do Digivice (GM escolhe qual NPC controlar)
  active_npc_view text,   -- ID do NPC cujo Digivice o GM está vendo no momento

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Trigger: cria perfil automaticamente ao registrar usuário
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- BLOCO 2 — ESTADO CENTRAL DA CAMPANHA
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- APP_STATE
-- Estado global da campanha: tamers, bestiary, bugs, sectors, bugFolders.
-- Mantido como JSONB — estrutura 1:1 com AppState do TypeScript.
-- Stages (palcos) foram separados em tabela própria para acesso independente.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.app_state (
  id          uuid primary key default uuid_generate_v4(),
  campaign    text not null default 'midnight-summer',
  version     integer not null default 2,
  state       jsonb not null,
  updated_at  timestamptz default now(),
  updated_by  uuid references public.profiles(id)
);

create index app_state_campaign_idx on public.app_state(campaign);


-- =============================================================================
-- BLOCO 3 — BESTIÁRIO EXPANDIDO (SIGNs)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SIGNS
-- Nova entidade da Goggle Girl. Sem pastas — lista plana, adicionada pelo GM.
-- Cada SIGN tem um código (ex: SIGN 01), nome, descrição/lore e skills.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.signs (
  id          uuid primary key default uuid_generate_v4(),
  campaign    text not null default 'midnight-summer',
  code        text not null,           -- ex: 'SIGN 01', 'SIGN 02'
  name        text not null,           -- ex: 'Yahiro Saki'
  lore        text default '',
  image_path  text,                    -- path no Storage bucket 'assets'
  data        jsonb not null default '{}',
  -- data contém: { skills, weakness, affinity, status, notes, ... }
  -- mesmo padrão do DigimonLine para reaproveitamento de componentes
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  created_by  uuid references public.profiles(id)
);

create index signs_campaign_idx on public.signs(campaign);


-- =============================================================================
-- BLOCO 4 — SKILL TREE (GM controla, player compra)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SKILL_TREE_PHASES
-- Cada fase é um conjunto de TamerSkills que o GM libera para um tamer específico.
-- Quando uma fase é liberada, o player pode ver as skills disponíveis e comprar
-- cada uma por 3 XP. Ao comprar, a skill some das "disponíveis" e entra na ficha.
--
-- Estrutura: cada fase tem N skills. O player pode comprar individualmente.
-- Quando todas as skills de uma fase forem compradas, a fase fecha.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.skill_tree_phases (
  id          uuid primary key default uuid_generate_v4(),
  campaign    text not null default 'midnight-summer',
  tamer_id    text not null,           -- ex: 't-naoki'
  phase_num   integer not null,        -- 1, 2, 3, ...
  label       text not null,           -- ex: 'Fase 2 — Laços de Sangue'
  unlocked    boolean not null default false,
  -- skills_available: array de TamerSkill ainda não compradas pelo player
  skills_available jsonb not null default '[]',
  -- skills_acquired: array de TamerSkill já compradas (histórico)
  skills_acquired  jsonb not null default '[]',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index skill_tree_tamer_idx on public.skill_tree_phases(tamer_id, campaign);

-- Constraint: combinação tamer + phase é única por campanha
create unique index skill_tree_unique on public.skill_tree_phases(campaign, tamer_id, phase_num);


-- =============================================================================
-- BLOCO 5 — PALCO EXPANDIDO (Teatro)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STAGES
-- Palcos de combate. Separados do app_state para sync independente.
-- Expandido com: round_current, actor_states (HP/DEF/ARM em tempo real),
-- clocks (relógios de condição), conditions (barras por ator).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.stages (
  id              uuid primary key default uuid_generate_v4(),
  campaign        text not null default 'midnight-summer',
  title           text not null default 'Novo Palco',
  subtitle        text default '',

  -- Lados do combate: array de ActorRef (igual ao tipo TypeScript)
  sides           jsonb not null default '{"allies": [], "enemies": []}',

  -- Round atual do combate
  round_current   integer not null default 0,

  -- Estado em tempo real dos atores no palco:
  -- Chave: actor_key (ex: 't-naoki', 'd-tinkermon-line:pair:1', 'b-ledo-low')
  -- Valor: { hp: number, hp_max: number, defesa: number, armadura: number,
  --          conditions: ConditionBar[], display_name_override?: string }
  -- HP e Armadura não resetam ao virar round (persistem).
  -- Defesa pode ser resetada pelo GM manualmente.
  actor_states    jsonb not null default '{}',

  -- Relógios de condição:
  -- Array de { id, name, actor_key, sections: number (sempre 10),
  --            filled: number, color: string }
  -- Ex: { id: 'clk-1', name: 'Relógio de Burn', actor_key: 't-naoki',
  --        sections: 10, filled: 3, color: 'coral' }
  clocks          jsonb not null default '[]',

  -- Tokens adicionados via skill (digimons temporários, efeitos, etc.)
  -- Array de ActorRef com campo extra: { ...ActorRef, token: true, label: string }
  tokens          jsonb not null default '[]',

  notes           text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  created_by      uuid references public.profiles(id)
);

create index stages_campaign_idx on public.stages(campaign);


-- =============================================================================
-- BLOCO 6 — DIGIVICE
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- DIGIVICES
-- Cada usuário (player ou NPC controlado pelo GM) tem um Digivice.
-- Um Digivice está atrelado a um owner_id (profile) e a um character_id (tamer).
-- O GM cria os Digivices dos NPCs; players têm o deles gerado automaticamente.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.digivices (
  id              uuid primary key default uuid_generate_v4(),
  campaign        text not null default 'midnight-summer',
  character_id    text not null,        -- ex: 't-naoki', 't-hare'
  owner_id        uuid references public.profiles(id),
  -- null para NPCs (controlados pelo GM, não têm profile próprio)
  kind            text not null default 'chave'
                  check (kind in ('chave', 'fechadura')),

  -- Memória atual e máxima do Digivice
  memory_current  integer not null default 3,
  memory_max      integer not null default 10,

  -- Autoridade acumulada (só digivices chave)
  authority       integer not null default 0,

  -- Estado do Digivice: 'active' | 'charging' | 'sleeping'
  device_status   text not null default 'active'
                  check (device_status in ('active', 'charging', 'sleeping')),

  -- Tickets de Trailmon (resetam às 6h)
  trailmon_tickets integer not null default 5,

  -- Inventário: array de { id, name, type, description, quantity, effects, gm_only }
  -- gm_only: true = visível e editável apenas pelo GM
  inventory       jsonb not null default '[]',

  -- Records: documentos e fotos
  -- Array de { id, type: 'document'|'photo', title, content, image_path, created_at, session }
  records         jsonb not null default '[]',

  -- Mapas: array de { id, title, image_path, notes }
  maps            jsonb not null default '[]',

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index digivices_campaign_idx on public.digivices(campaign);
create unique index digivices_character_idx on public.digivices(campaign, character_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- DIGI_ZAP_GROUPS
-- Grupos de conversa do Digi-Zap.
-- Grupos fixos (SURVIVORS, Sanbaka) e grupos bilaterais (PC ↔ NPC).
-- Um grupo bilateral é criado automaticamente quando um PC e NPC trocam mensagem.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.digi_zap_groups (
  id              uuid primary key default uuid_generate_v4(),
  campaign        text not null default 'midnight-summer',
  kind            text not null default 'bilateral'
                  check (kind in ('group', 'bilateral')),
  name            text not null,        -- ex: 'SURVIVORS', 'Sanbaka', 'Naoki ↔ Hare'
  -- Participantes: array de character_id (ex: ['t-naoki', 't-hare'])
  participants    text[] not null default '{}',
  created_at      timestamptz default now()
);

create index digi_zap_groups_campaign_idx on public.digi_zap_groups(campaign);


-- ─────────────────────────────────────────────────────────────────────────────
-- DIGI_ZAP_MESSAGES
-- Mensagens do Digi-Zap. Cada mensagem pertence a um grupo.
-- A mensagem é guardada por ambos os digivices dos participantes via RLS + query.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.digi_zap_messages (
  id              uuid primary key default uuid_generate_v4(),
  group_id        uuid not null references public.digi_zap_groups(id) on delete cascade,
  sender_id       text not null,        -- character_id do remetente (ex: 't-naoki')
  content         text not null,
  -- Metadados narrativos
  survival_day    integer,              -- Dia de Sobrevivência
  sent_at_time    text,                 -- Horário (ex: '14:32') — narrativo, não timestamp real
  session_num     integer,              -- Número da sessão de jogo
  created_at      timestamptz default now()
);

create index digi_zap_messages_group_idx on public.digi_zap_messages(group_id);
create index digi_zap_messages_created_idx on public.digi_zap_messages(created_at);


-- =============================================================================
-- BLOCO 7 — BACKSTAGE (acesso exclusivo do GM)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- GM_NOTES
-- Notas que só o GM pode ver. Atreladas opcionalmente a um personagem ou palco.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.gm_notes (
  id              uuid primary key default uuid_generate_v4(),
  campaign        text not null default 'midnight-summer',
  title           text not null default 'Nota',
  content         text not null default '',
  -- Vínculo opcional com entidade específica
  entity_type     text,                 -- 'tamer' | 'digimon' | 'stage' | 'sign' | null
  entity_id       text,                 -- ID da entidade (ex: 't-naoki', 'd-tinkermon-line')
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  created_by      uuid references public.profiles(id)
);

create index gm_notes_campaign_idx on public.gm_notes(campaign);
create index gm_notes_entity_idx on public.gm_notes(entity_type, entity_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- GM_ITEMS
-- Itens que só o GM pode ver/editar. Separados dos inventários dos Digivices
-- para evitar que players vejam itens que o GM ainda não revelou.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.gm_items (
  id              uuid primary key default uuid_generate_v4(),
  campaign        text not null default 'midnight-summer',
  name            text not null,
  description     text default '',
  item_type       text default 'item',  -- 'item' | 'weapon' | 'accessory' | 'key'
  effects         jsonb default '{}',
  -- Atribuído a um personagem (null = no limbo do GM)
  assigned_to     text,                 -- character_id
  revealed        boolean not null default false,
  -- revealed: true = aparece no inventário do Digivice do personagem
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index gm_items_campaign_idx on public.gm_items(campaign);
create index gm_items_assigned_idx on public.gm_items(assigned_to);


-- =============================================================================
-- BLOCO 8 — FUNÇÕES AUXILIARES
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger genérico de updated_at
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Aplicar em todas as tabelas com updated_at
create trigger app_state_updated_at
  before update on public.app_state
  for each row execute function public.touch_updated_at();

create trigger stages_updated_at
  before update on public.stages
  for each row execute function public.touch_updated_at();

create trigger digivices_updated_at
  before update on public.digivices
  for each row execute function public.touch_updated_at();

create trigger signs_updated_at
  before update on public.signs
  for each row execute function public.touch_updated_at();

create trigger skill_tree_updated_at
  before update on public.skill_tree_phases
  for each row execute function public.touch_updated_at();

create trigger gm_notes_updated_at
  before update on public.gm_notes
  for each row execute function public.touch_updated_at();

create trigger gm_items_updated_at
  before update on public.gm_items
  for each row execute function public.touch_updated_at();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: checar se o usuário atual é GM
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_gm()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'gm'
  );
$$ language sql security definer;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: retornar o character_id vinculado ao usuário atual
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.my_character_id()
returns text as $$
  select tamer_id from public.profiles where id = auth.uid();
$$ language sql security definer;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: checar se o usuário atual é participante de um grupo de Digi-Zap
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_participant(group_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.digi_zap_groups g, public.profiles p
    where g.id = group_id
      and p.id = auth.uid()
      and (p.tamer_id = any(g.participants) or public.is_gm())
  );
$$ language sql security definer;


-- =============================================================================
-- BLOCO 9 — ROW LEVEL SECURITY (RLS)
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.app_state         enable row level security;
alter table public.stages            enable row level security;
alter table public.signs             enable row level security;
alter table public.skill_tree_phases enable row level security;
alter table public.digivices         enable row level security;
alter table public.digi_zap_groups   enable row level security;
alter table public.digi_zap_messages enable row level security;
alter table public.gm_notes          enable row level security;
alter table public.gm_items          enable row level security;


-- ── Profiles ─────────────────────────────────────────────────────────────────

create policy "profiles_select_all"
  on public.profiles for select to authenticated using (true);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid());

create policy "profiles_update_gm"
  on public.profiles for update to authenticated
  using (public.is_gm());


-- ── App State ─────────────────────────────────────────────────────────────────

create policy "app_state_select"
  on public.app_state for select to authenticated using (true);

create policy "app_state_insert_gm"
  on public.app_state for insert to authenticated
  with check (public.is_gm());

-- GM pode atualizar tudo; player pode atualizar apenas o próprio tamer dentro do JSONB.
-- Nota: controle granular dentro do JSONB é feito na camada de aplicação.
-- O RLS aqui bloqueia writes de player no estado global — player usa endpoint
-- dedicado que só toca o seu tamer_id dentro do JSONB.
create policy "app_state_update_gm"
  on public.app_state for update to authenticated
  using (public.is_gm());


-- ── Stages ───────────────────────────────────────────────────────────────────

create policy "stages_select"
  on public.stages for select to authenticated using (true);

create policy "stages_insert_gm"
  on public.stages for insert to authenticated
  with check (public.is_gm());

create policy "stages_update_gm"
  on public.stages for update to authenticated
  using (public.is_gm());

create policy "stages_delete_gm"
  on public.stages for delete to authenticated
  using (public.is_gm());


-- ── Signs ─────────────────────────────────────────────────────────────────────

-- Players veem os SIGNs revelados pelo GM. GM vê todos.
create policy "signs_select_players"
  on public.signs for select to authenticated
  using (true);  -- revelação controlada no frontend via campo no JSONB data

create policy "signs_insert_gm"
  on public.signs for insert to authenticated
  with check (public.is_gm());

create policy "signs_update_gm"
  on public.signs for update to authenticated
  using (public.is_gm());

create policy "signs_delete_gm"
  on public.signs for delete to authenticated
  using (public.is_gm());


-- ── Skill Tree ───────────────────────────────────────────────────────────────

-- Player vê apenas as fases do seu próprio tamer que estão desbloqueadas.
-- GM vê tudo.
create policy "skill_tree_select"
  on public.skill_tree_phases for select to authenticated
  using (
    public.is_gm()
    or (tamer_id = public.my_character_id() and unlocked = true)
  );

create policy "skill_tree_insert_gm"
  on public.skill_tree_phases for insert to authenticated
  with check (public.is_gm());

create policy "skill_tree_update_gm"
  on public.skill_tree_phases for update to authenticated
  using (public.is_gm());

-- Player pode dar update apenas para mover uma skill de available → acquired
-- (compra de skill). Isso é tratado via Postgres function para segurança.
-- Ver função buy_skill() abaixo.


-- ── Digivices ─────────────────────────────────────────────────────────────────

-- Player vê apenas o próprio Digivice. GM vê todos.
create policy "digivices_select"
  on public.digivices for select to authenticated
  using (
    public.is_gm()
    or character_id = public.my_character_id()
  );

create policy "digivices_insert_gm"
  on public.digivices for insert to authenticated
  with check (public.is_gm());

-- Player pode inserir apenas o próprio Digivice (linha ainda não existe).
create policy "digivices_insert_player"
  on public.digivices for insert to authenticated
  with check (character_id = public.my_character_id());

-- Player pode atualizar apenas o próprio Digivice.
-- GM pode atualizar qualquer Digivice (controla NPCs).
create policy "digivices_update"
  on public.digivices for update to authenticated
  using (
    public.is_gm()
    or character_id = public.my_character_id()
  );

create policy "digivices_delete_gm"
  on public.digivices for delete to authenticated
  using (public.is_gm());


-- ── Digi-Zap Groups ──────────────────────────────────────────────────────────

-- Player vê apenas grupos dos quais participa. GM vê todos.
create policy "digi_zap_groups_select"
  on public.digi_zap_groups for select to authenticated
  using (
    public.is_gm()
    or public.my_character_id() = any(participants)
  );

create policy "digi_zap_groups_insert"
  on public.digi_zap_groups for insert to authenticated
  with check (
    public.is_gm()
    or public.my_character_id() = any(participants)
  );

create policy "digi_zap_groups_update_gm"
  on public.digi_zap_groups for update to authenticated
  using (public.is_gm());


-- ── Digi-Zap Messages ────────────────────────────────────────────────────────

create policy "digi_zap_messages_select"
  on public.digi_zap_messages for select to authenticated
  using (public.is_participant(group_id));

-- Player só pode enviar mensagens em grupos que participa, com seu sender_id
create policy "digi_zap_messages_insert"
  on public.digi_zap_messages for insert to authenticated
  with check (
    public.is_participant(group_id)
    and (
      public.is_gm()
      or sender_id = public.my_character_id()
    )
  );

-- Mensagens não podem ser editadas nem deletadas (histórico imutável)
-- Exceção: GM pode deletar mensagens problemáticas
create policy "digi_zap_messages_delete_gm"
  on public.digi_zap_messages for delete to authenticated
  using (public.is_gm());


-- ── GM Notes ─────────────────────────────────────────────────────────────────

create policy "gm_notes_all"
  on public.gm_notes for all to authenticated
  using (public.is_gm())
  with check (public.is_gm());


-- ── GM Items ─────────────────────────────────────────────────────────────────

-- Player vê apenas itens atribuídos a ele E que foram revelados
create policy "gm_items_select_player"
  on public.gm_items for select to authenticated
  using (
    public.is_gm()
    or (assigned_to = public.my_character_id() and revealed = true)
  );

create policy "gm_items_insert_gm"
  on public.gm_items for insert to authenticated
  with check (public.is_gm());

create policy "gm_items_update_gm"
  on public.gm_items for update to authenticated
  using (public.is_gm());

create policy "gm_items_delete_gm"
  on public.gm_items for delete to authenticated
  using (public.is_gm());


-- =============================================================================
-- BLOCO 10 — FUNÇÕES DE NEGÓCIO (chamadas via RPC pelo frontend)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- buy_skill(phase_id, skill_index)
-- Chamada pelo player para comprar uma skill da Skill Tree.
-- Atomicamente: move a skill de skills_available → skills_acquired
-- e subtrai 3 XP do tamer no app_state.
-- Retorna: { ok: boolean, reason?: string }
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.buy_skill(
  p_phase_id    uuid,
  p_skill_index integer
)
returns jsonb as $$
declare
  v_phase       record;
  v_skill       jsonb;
  v_tamer_id    text;
  v_campaign    text := 'midnight-summer';
  v_state       jsonb;
  v_tamer       jsonb;
  v_xp          integer;
  v_new_avail   jsonb;
  v_new_acq     jsonb;
begin
  -- Buscar a fase
  select * into v_phase from public.skill_tree_phases where id = p_phase_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Fase não encontrada.');
  end if;

  -- Verificar se está desbloqueada
  if not v_phase.unlocked then
    return jsonb_build_object('ok', false, 'reason', 'Fase ainda não desbloqueada pelo GM.');
  end if;

  -- Verificar se o player é dono dessa fase
  v_tamer_id := public.my_character_id();
  if v_tamer_id is null or v_tamer_id != v_phase.tamer_id then
    return jsonb_build_object('ok', false, 'reason', 'Personagem não autorizado.');
  end if;

  -- Pegar a skill pelo índice
  v_skill := v_phase.skills_available -> p_skill_index;
  if v_skill is null then
    return jsonb_build_object('ok', false, 'reason', 'Skill não encontrada no índice fornecido.');
  end if;

  -- Buscar o XP do tamer no app_state
  select state into v_state from public.app_state
  where campaign = v_campaign order by updated_at desc limit 1;

  if v_state is null then
    return jsonb_build_object('ok', false, 'reason', 'Estado da campanha não encontrado.');
  end if;

  -- Encontrar o tamer pelo ID dentro do JSONB
  select elem into v_tamer
  from jsonb_array_elements(v_state -> 'tamers') as elem
  where elem ->> 'id' = v_tamer_id
  limit 1;

  if v_tamer is null then
    return jsonb_build_object('ok', false, 'reason', 'Tamer não encontrado no estado.');
  end if;

  v_xp := (v_tamer ->> 'xp')::integer;
  if v_xp < 3 then
    return jsonb_build_object('ok', false, 'reason', 'XP insuficiente (precisa 3).');
  end if;

  -- Remover a skill do array de disponíveis
  select jsonb_agg(elem)
  into v_new_avail
  from jsonb_array_elements(v_phase.skills_available) with ordinality as t(elem, ord)
  where t.ord - 1 != p_skill_index;

  -- Adicionar ao array de adquiridas
  v_new_acq := v_phase.skills_acquired || jsonb_build_array(v_skill);

  -- Atualizar a fase
  update public.skill_tree_phases
  set skills_available = coalesce(v_new_avail, '[]'::jsonb),
      skills_acquired  = v_new_acq
  where id = p_phase_id;

  -- Subtrair XP e adicionar à skill no tamer (dentro do JSONB do app_state)
  update public.app_state
  set state = jsonb_set(
    state,
    '{tamers}',
    (
      select jsonb_agg(
        case when t ->> 'id' = v_tamer_id
          then jsonb_set(
            jsonb_set(t, '{xp}', to_jsonb((t ->> 'xp')::integer - 3)),
            '{tamerSkills}',
            (t -> 'tamerSkills') || jsonb_build_array(v_skill)
          )
          else t
        end
      )
      from jsonb_array_elements(state -> 'tamers') t
    )
  )
  where campaign = v_campaign;

  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;


-- ─────────────────────────────────────────────────────────────────────────────
-- update_actor_state(stage_id, actor_key, hp?, defesa?, armadura?)
-- Atualiza HP/Defesa/Armadura de um ator no palco em tempo real.
-- Pode ser chamada por GM ou pelo player dono do personagem.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.update_actor_state(
  p_stage_id    uuid,
  p_actor_key   text,
  p_hp          integer default null,
  p_defesa      integer default null,
  p_armadura    integer default null
)
returns jsonb as $$
declare
  v_actor_state jsonb;
  v_new_state   jsonb;
begin
  -- Verificar permissão: GM ou dono do personagem
  if not (public.is_gm() or p_actor_key = public.my_character_id()) then
    return jsonb_build_object('ok', false, 'reason', 'Não autorizado.');
  end if;

  -- Buscar estado atual do ator
  select coalesce(actor_states -> p_actor_key, '{}'::jsonb)
  into v_actor_state
  from public.stages where id = p_stage_id;

  -- Aplicar as mudanças
  if p_hp      is not null then v_actor_state := jsonb_set(v_actor_state, '{hp}',      to_jsonb(p_hp));      end if;
  if p_defesa  is not null then v_actor_state := jsonb_set(v_actor_state, '{defesa}',  to_jsonb(p_defesa));  end if;
  if p_armadura is not null then v_actor_state := jsonb_set(v_actor_state, '{armadura}',to_jsonb(p_armadura)); end if;

  -- Salvar de volta
  update public.stages
  set actor_states = jsonb_set(actor_states, array[p_actor_key], v_actor_state)
  where id = p_stage_id;

  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;


-- ─────────────────────────────────────────────────────────────────────────────
-- advance_round(stage_id)
-- Avança o round do palco. Só GM pode chamar.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.advance_round(p_stage_id uuid)
returns jsonb as $$
begin
  if not public.is_gm() then
    return jsonb_build_object('ok', false, 'reason', 'Apenas o GM pode avançar o round.');
  end if;

  update public.stages
  set round_current = round_current + 1
  where id = p_stage_id;

  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;


-- ─────────────────────────────────────────────────────────────────────────────
-- reveal_item(item_id)
-- GM revela um item para o player dono.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.reveal_item(p_item_id uuid)
returns jsonb as $$
begin
  if not public.is_gm() then
    return jsonb_build_object('ok', false, 'reason', 'Apenas o GM pode revelar itens.');
  end if;

  update public.gm_items
  set revealed = true
  where id = p_item_id;

  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;


-- =============================================================================
-- BLOCO 11 — REALTIME
-- =============================================================================

-- Habilitar Realtime para tabelas que precisam de sync em tempo real
alter publication supabase_realtime add table public.app_state;
alter publication supabase_realtime add table public.stages;
alter publication supabase_realtime add table public.digi_zap_messages;
alter publication supabase_realtime add table public.digivices;
alter publication supabase_realtime add table public.skill_tree_phases;

-- Nota: gm_notes e gm_items NÃO entram no Realtime (players não devem receber
-- broadcasts dessas tabelas mesmo com RLS, por precaução).


-- =============================================================================
-- BLOCO 12 — STORAGE BUCKETS
-- =============================================================================
-- Criar manualmente no Dashboard → Storage → New Bucket (marcar "Public bucket").
-- Depois executar o SQL abaixo no SQL Editor para criar as policies.

-- Bucket: 'portraits'
-- Uso: fotos de tamers e digimons (upload pelo player ou GM)
-- Path convention: {character_id}.{ext}   ex: t-yahiro-abc123.png

CREATE POLICY "portraits: leitura pública"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'portraits');

CREATE POLICY "portraits: autenticados podem inserir"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'portraits');

CREATE POLICY "portraits: autenticados podem atualizar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'portraits') WITH CHECK (bucket_id = 'portraits');

CREATE POLICY "portraits: autenticados podem deletar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'portraits');

-- Bucket: 'assets'
-- Uso: imagens de SIGNs, mapas, records/fotos do Digivice (só GM faz upload)
-- Path convention: assets/signs/{sign_id}.webp

CREATE POLICY "assets: leitura pública"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'assets');

CREATE POLICY "assets: autenticados podem inserir"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assets');

CREATE POLICY "assets: autenticados podem atualizar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'assets') WITH CHECK (bucket_id = 'assets');

CREATE POLICY "assets: autenticados podem deletar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assets');
--                  assets/maps/{map_id}.webp
--                  assets/records/{character_id}/{record_id}.webp


-- =============================================================================
-- BLOCO 13 — SEED INICIAL
-- =============================================================================

-- Após criar a conta do GM, promover com:
--   update public.profiles set role = 'gm' where id = '<uuid>';

-- Criar os grupos fixos do Digi-Zap após a migração de dados:
--   insert into public.digi_zap_groups (kind, name, participants) values
--     ('group', 'SURVIVORS', array['t-naoki','t-eisuke','t-miki','t-yuri','t-sachi','t-mori']),
--     ('group', 'Sanbaka',   array['t-naoki','t-shinra','t-kumo']);

-- Criar os Digivices dos NPCs Fechadura + Shiro após a migração:
--   insert into public.digivices (character_id, owner_id, kind) values
--     ('t-hare',   null, 'fechadura'),
--     ('t-kanade', null, 'fechadura'),
--     ('t-shinra', null, 'fechadura'),
--     ('t-kumo',   null, 'fechadura'),
--     ('t-emi',    null, 'fechadura'),
--     ('t-hibito', null, 'fechadura'),
--     ('t-shiro',  null, 'fechadura');
-- (owner_id null = controlado exclusivamente pelo GM)

-- O estado inicial (AppState com tamers e bestiary) é inserido pela função
-- de migração do frontend — ver MIGRACAO_v2.md quando for criado.

