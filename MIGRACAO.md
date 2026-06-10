# Migração e Setup do Supabase
## Digimon Survive Companion App — A Midnight Summer's Dream

> **Status do sistema:** Supabase já integrado ao app — este documento descreve como
> reproduzir o setup em uma nova instância (do zero) ou migrar uma cópia
> local existente.
>
> **Stack atual:** React 18 + Vite 5 + TypeScript 5 + Supabase (Postgres + Storage + Auth + Realtime + Presence) + Vercel
> **Fallback:** o app detecta automaticamente a ausência das variáveis de ambiente
> e roda em modo local (`localStorage` + IndexedDB) sem login.

---

## 1. Visão geral da arquitetura

| Camada | Responsabilidade | Implementação |
|---|---|---|
| Cliente Supabase | Conexão singleton, modo degradável | [src/lib/supabase.ts](src/lib/supabase.ts) |
| Auth | Sessão, perfis, roles, role helpers | [src/lib/auth.ts](src/lib/auth.ts) + [src/components/AuthProvider.tsx](src/components/AuthProvider.tsx) |
| Estado central (`app_state`) | JSONB único + concorrência otimista | [src/lib/db/state.ts](src/lib/db/state.ts) |
| Storage de imagens | Bucket `portraits`/`assets` + compressão | [src/lib/db/storage.ts](src/lib/db/storage.ts) |
| Realtime | Postgres changes + Presence | [src/lib/db/realtime.ts](src/lib/db/realtime.ts) + [src/lib/presence.ts](src/lib/presence.ts) |
| RPC escritas granulares | Player só edita o próprio tamer | `update_my_tamer` (ver §6.5) |
| Skill Tree | Tabela própria + RPC `buy_skill` | [src/lib/db/skillTree.ts](src/lib/db/skillTree.ts) |
| Palcos / Teatro | Tabela `stages` + RPC `update_actor_state`, `advance_round` | [src/lib/db/state.ts](src/lib/db/state.ts) |
| Snapshots | Versões históricas do `app_state` | [src/lib/db/snapshots.ts](src/lib/db/snapshots.ts) |
| Conteúdo do GM | Notas e itens isolados (`gm_notes`, `gm_items`) | [src/lib/db/gmContent.ts](src/lib/db/gmContent.ts) |
| Migração in-app | Botão `⟳ Migrar` na navbar (GM) | [src/lib/db/migration.ts](src/lib/db/migration.ts) |
| Healthcheck | Diagnóstico via botão na navbar (GM) | [src/lib/db/healthcheck.ts](src/lib/db/healthcheck.ts) |

---

## 2. Pré-requisitos

- Conta em [supabase.com](https://supabase.com) (plano Free é suficiente)
- Conta em [vercel.com](https://vercel.com) (plano Hobby é suficiente)
- Repositório Git já vinculado ao Vercel

---

## 3. Setup do Supabase (banco)

### 3.1 Criar o projeto
1. Dashboard → **New Project**
2. Anotar `Project URL` e `anon key` (Settings → API)

### 3.2 Executar os scripts SQL na ordem
Cole no **SQL Editor → New Query** e execute, **na ordem listada**:

| # | Arquivo | O que faz |
|---|---|---|
| 1 | [supabase_schema.sql](supabase_schema.sql) | Schema completo: tabelas, RLS, RPCs, triggers, Realtime, policies de Storage |
| 2 | [supabase_player_writes.sql](supabase_player_writes.sql) | RPC `update_my_tamer` (escrita granular sem last-write-wins) |
| 3 | [supabase_digizap_v2.sql](supabase_digizap_v2.sql) | Anexos, reações e respostas em mensagens do Digi-Zap |
| 4 | [supabase_update_line.sql](supabase_update_line.sql) | RPC `update_digimon_line` — atualiza atomicamente uma linha do `bestiary` (preserva stages do Palco) |
| 5 | [wiki_migration.sql](wiki_migration.sql) | Tabelas `wiki_pages` e `wiki_relations` (Wiki + grafo de relações) |
| 6 | [wiki_collab_migration.sql](wiki_collab_migration.sql) | Colunas `status`/`author_id` em `wiki_pages` + tabela `wiki_page_edits` (edições colaborativas) |
| 7 | [wiki_detailed_migration.sql](wiki_detailed_migration.sql) | Coluna `content` jsonb (blocos: infobox/galeria/seções) em `wiki_pages` **e** `wiki_page_edits` — **roda depois do collab** |
| 8 | [wiki_owner_migration.sql](wiki_owner_migration.sql) | Coluna `owner_tamer_id` (páginas de PC editáveis pelo dono) |
| 9 | [maps_migration.sql](maps_migration.sql) | Tabelas `maps`, `map_layers`, `map_pins` (mapas interativos) |
| 10 | [campaign_config_migration.sql](campaign_config_migration.sql) | Tabela `campaign_config` (flags globais) + Realtime + RLS (escrita só GM) |
| 11 | [supabase_anon_read.sql](supabase_anon_read.sql) | **Por último:** SELECT anônimo (`anon`) + endurecimento da escrita de Wiki/Mapas — ver [§6.7](#67-acesso-anônimo-e-endurecimento-de-escrita) |
| (opcional) | [supabase_digizap_groups.sql](supabase_digizap_groups.sql) | Seed dos 3 grupos fixos: `SURVIVORS`, `Sanbaka`, `Kurumizawa Girls` |
| (opcional) | [supabase_guests.sql](supabase_guests.sql) | 6 contas `convidadoN@survive.local` com role `guest` (acesso somente-leitura a Party/Goggle Girl/Sistema) |

> O arquivo `supabase_schema.sql` é a fonte da verdade das tabelas centrais — ele
> cria todas elas, RLS, RPCs e triggers em uma única execução idempotente. Os demais
> são adições incrementais.
>
> **Ordem importa:** `wiki_detailed_migration.sql` adiciona a coluna `content` à
> tabela `wiki_page_edits`, que só existe após `wiki_collab_migration.sql`; e
> `supabase_anon_read.sql` endurece policies criadas pelas migrações de Wiki/Mapas,
> então deve ser o **último**.

### 3.3 Criar os buckets de Storage
Dashboard → **Storage → New Bucket** (marcar **Public bucket**):

| Bucket | Uso | Path convention |
|---|---|---|
| `portraits` | Fotos de tamers, digimons, survivors, bugs (upload pelo player ou GM) | `{character_id}.{ext}` |
| `assets` | SIGNs, mapas, records do Digivice (só GM faz upload) | `assets/signs/{sign_id}.webp` etc. |

As policies de Storage (SELECT público, INSERT/UPDATE/DELETE para `authenticated`)
já estão no Bloco 12 de `supabase_schema.sql`.

### 3.4 Habilitar Realtime
O Bloco 11 de `supabase_schema.sql` já adiciona `app_state`, `stages`,
`digi_zap_messages`, `digivices` e `skill_tree_phases` à publication
`supabase_realtime`. A migração [campaign_config_migration.sql](campaign_config_migration.sql)
acrescenta também `campaign_config` (para as flags chegarem aos players em tempo
real). Conferir em Dashboard → Database → Replication.

---

## 4. Variáveis de ambiente

`.env.local` (raiz do projeto — **nunca commitar**):

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

No Vercel → **Project Settings → Environment Variables**, adicionar as duas
mesmas chaves para `Production`, `Preview` e `Development`.

> Sem essas variáveis, [src/lib/supabase.ts](src/lib/supabase.ts#L11) define
> `supabase = null` e o app cai para modo local (`isSupabaseReady = false`).
> Nenhum dos módulos quebra — todos têm fallback explícito.

---

## 5. Criar contas

### 5.1 Conta do GM
1. Dashboard → **Authentication → Users → Invite User**
2. Email do GM → enviar convite
3. GM define senha ao aceitar
4. Promover via SQL (UUID em Authentication → Users):

```sql
UPDATE public.profiles SET role = 'gm' WHERE id = '<uuid-do-gm>';
```

### 5.2 Contas dos players
Para cada player:
1. Dashboard → **Authentication → Users → Invite User**
2. Após login, vincular ao tamer:

```sql
UPDATE public.profiles SET tamer_id = 't-naoki' WHERE id = '<uuid-do-player>';
```

Mapeamento dos IDs de player:

| Player | tamer_id |
|---|---|
| Naoki | `t-naoki` |
| Eisuke | `t-eisuke` |
| Miki | `t-miki` |
| Yuri | `t-yuri` |
| Sachi | `t-sachi` |
| Mori | `t-mori` |

### 5.3 Contas de convidado (opcional)
Executar [supabase_guests.sql](supabase_guests.sql) cria 6 logins
`convidadoN@survive.local` / `convidadoN` com role `guest`. Convidados veem
**apenas** Party, Goggle Girl e Sistema (sem editar). Renomear depois com:

```sql
UPDATE public.profiles SET display_name = 'Nome Real'
  WHERE id = 'c0000000-0000-0000-0000-000000000001';
```

### 5.4 Digivices dos NPCs Fechadura (opcional)
NPCs controlados pelo GM (sem login próprio) recebem Digivice atrelado a
`owner_id = null`:

```sql
INSERT INTO public.digivices (character_id, owner_id, kind) VALUES
  ('t-hare',   null, 'fechadura'),
  ('t-kanade', null, 'fechadura'),
  ('t-shinra', null, 'fechadura'),
  ('t-kumo',   null, 'fechadura'),
  ('t-emi',    null, 'fechadura'),
  ('t-hibito', null, 'fechadura'),
  ('t-shiro',  null, 'fechadura');
```

---

## 6. Lógica de roles e RLS

### 6.1 Três roles
Definidos em [src/lib/auth.ts:10](src/lib/auth.ts#L10): `'gm' | 'player' | 'guest'`.

| Role | Lê | Escreve |
|---|---|---|
| `gm` | Tudo | Tudo (inclusive NPCs e backstage) |
| `player` | Tudo do `app_state` + apenas o **próprio** Digivice e fases liberadas | Apenas o próprio tamer (via RPC) + próprio Digivice + comprar skill da Skill Tree liberada |
| `guest` | `app_state` (Party/Goggle/Sistema) | Nada |

### 6.2 Helpers SQL
Implementados no Bloco 8 do schema:
- `public.is_gm()` — boolean baseado em `profiles.role`
- `public.my_character_id()` — retorna o `tamer_id` do usuário atual
- `public.is_participant(group_id)` — checa pertinência a grupo do Digi-Zap

### 6.3 Helpers TypeScript
[src/lib/auth.ts](src/lib/auth.ts) expõe:
- `isGM(profile)` — em modo local sempre retorna `true`
- `canEditTamer(profile, tamerId)` — GM edita qualquer, player só o próprio
- `onAuthStateChange(callback)` — listener de sessão para `AuthProvider`

### 6.4 RLS por tabela (resumo)
A coluna **Anon** indica se o visitante anônimo (sem login) lê a tabela — habilitado por [supabase_anon_read.sql](supabase_anon_read.sql), ver [§6.7](#67-acesso-anônimo-e-endurecimento-de-escrita).

| Tabela | SELECT | INSERT/UPDATE | DELETE | Anon |
|---|---|---|---|---|
| `profiles` | `authenticated` | `id = auth.uid()` ou GM | — | ✗ |
| `app_state` | `authenticated` | GM (player via RPC `update_my_tamer`) | — | ✓ (SELECT) |
| `stages` | `authenticated` | GM | GM | ✓ (SELECT) |
| `signs` | `authenticated` | GM | GM | ✓ (SELECT) |
| `skill_tree_phases` | GM, ou dono se `unlocked = true` | GM (player via RPC `buy_skill`) | — | ✗ |
| `digivices` | GM ou dono | GM ou dono | GM | ✗ |
| `digi_zap_groups` | GM ou participante | GM ou participante | — | ✗ |
| `digi_zap_messages` | participantes do grupo | participantes (sender deve ser o próprio `tamer_id`) | GM | ✗ |
| `gm_notes` | GM | GM | GM | ✗ |
| `gm_items` | GM ou (dono **and** revealed) | GM | GM | ✗ |
| `wiki_pages` / `wiki_relations` / `wiki_page_edits` | público | `authenticated` (após endurecimento) | `authenticated` | ✓ (SELECT) |
| `maps` / `map_layers` / `map_pins` | público | `authenticated` (recomendado; bloco comentado) | `authenticated` | ✗ no frontend (rota bloqueada) |
| `campaign_config` | público | GM (`is_gm()`) | GM | ✓ (SELECT) |

### 6.5 Escritas atômicas via RPC
Para evitar last-write-wins quando vários clientes editam o mesmo `app_state`:

| RPC | Quem chama | O que faz |
|---|---|---|
| `update_my_tamer(p_tamer jsonb)` | Player | Substitui apenas o próprio tamer dentro de `state.tamers[]` |
| `buy_skill(p_phase_id, p_skill_index)` | Player | Move skill `available → acquired`, debita 3 XP no `app_state` |
| `update_actor_state(p_stage_id, p_actor_key, hp?, defesa?, armadura?)` | GM ou dono do ator | Altera HP/Defesa/Armadura de um ator no palco |
| `advance_round(p_stage_id)` | GM | Incrementa `round_current` |
| `reveal_item(p_item_id)` | GM | Marca `gm_items.revealed = true` |

### 6.6 Concorrência otimista
[src/lib/db/state.ts:107](src/lib/db/state.ts#L107) compara `updated_at` antes de
gravar: se outro cliente atualizou primeiro, dispara o evento global
`app:save-conflict` e força a sobrescrita. O `App.tsx` exibe um banner laranja
quando isso acontece.

### 6.7 Acesso anônimo e endurecimento de escrita
Executado por [supabase_anon_read.sql](supabase_anon_read.sql) (deve ser o **último**
script — ver [§3.2](#32-executar-os-scripts-sql-na-ordem)). Ele faz duas coisas:

**1. Libera leitura para o visitante anônimo (role `anon`):** adiciona policies de
`SELECT to anon` em `app_state`, `stages` e `signs`. As tabelas da Wiki e
`campaign_config` já têm leitura pública (`using(true)` sem cláusula `to`). Com isso
o app, sem ninguém logado, carrega o estado público em somente-leitura
(`isAnon` — ver [README §3](README.md#3-os-três-modos-de-execução)).

O visitante anônimo **não** recebe acesso a: `profiles`, `digivices`, `digi_zap_*`,
`gm_notes`, `gm_items`, `skill_tree_phases`, `maps`/`map_layers`/`map_pins`
(continuam só para `authenticated`).

**2. Endurece a escrita de Wiki e Mapas:** as migrações de Wiki/Mapas criaram
policies `for all using(true)` **sem** cláusula `to`, o que valeria para todos os
roles — inclusive `anon`. Agora que o acesso anônimo está ativo, o script substitui
essas policies por **leitura pública + escrita só `authenticated`** em `wiki_pages`,
`wiki_relations` e `wiki_page_edits` (este último só se a tabela existir). O bloco
equivalente para `maps`/`map_layers`/`map_pins` está incluído **comentado** — a rota
`/mapas` já é bloqueada para o anônimo no frontend, mas descomente-o se quiser a
mesma garantia no banco.

> O arquivo é idempotente (`drop policy if exists` antes de cada `create`), então
> pode ser reexecutado com segurança.

---

## 7. Realtime e Presence

### 7.1 Postgres changes
[src/lib/db/realtime.ts](src/lib/db/realtime.ts) expõe:
- `subscribeToState(onUpdate)` — UPDATEs em `app_state` → hidrata imagens e dispara `onUpdate`
- `subscribeToStages(onUpdate)` — qualquer evento em `stages` → recarrega lista

Ignora updates locais nos primeiros 3s para não fazer eco do próprio save
(ver [src/App.tsx:128](src/App.tsx#L128)).

### 7.2 Presence
[src/lib/presence.ts](src/lib/presence.ts) implementa `usePresence(profile)`:
canal `presence-midnight-summer`, mostra quantos usuários estão online na navbar.

---

## 8. Migração de dados locais

O app inclui uma ferramenta in-app para migrar `localStorage` + IndexedDB → Supabase:

1. Com Supabase configurado e GM logado, abrir o app
2. Clicar em **`⟳ Migrar`** na navbar (visível só para GM, [src/App.tsx:306](src/App.tsx#L306))
3. O processo:
   - Carrega estado local hidratado ([loadStateAsync](src/data/store.ts))
   - Faz upload de cada imagem (`data:`) para `portraits/`
   - Substitui imagens inline por `imageKey` (path no Storage)
   - Insere uma nova linha em `app_state` com o estado limpo
4. Mensagem de sucesso indica quantas imagens foram migradas
5. O botão pode ser removido do código após a migração confirmada
   (ou mantido — é idempotente e rápido)

Implementação em [src/lib/db/migration.ts](src/lib/db/migration.ts).

---

## 9. Deploy no Vercel

```bash
# Opcional: CLI
npm i -g vercel
vercel --prod
```

Configurações no painel:

| Campo | Valor |
|---|---|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (production + preview) |

Após o deploy, adicionar a URL do Vercel em:
- Supabase Dashboard → **Authentication → URL Configuration → Site URL**
- Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**

---

## 10. Diagnóstico — Healthcheck

[src/lib/db/healthcheck.ts](src/lib/db/healthcheck.ts) verifica:
- Acesso às 8 tabelas centrais (`profiles`, `app_state`, `stages`, `signs`, `digivices`, `digi_zap_groups`, `digi_zap_messages`, `skill_tree_phases`)
- Existência dos buckets `portraits` e `assets`
- Seed dos grupos do Digi-Zap

Acessível pelo botão **SetupHealth** na navbar (visível só para GM,
[src/App.tsx](src/App.tsx)).

> **Nota:** o healthcheck ainda **não** cobre as tabelas das migrações incrementais
> (`wiki_pages`, `wiki_relations`, `wiki_page_edits`, `maps`, `map_layers`,
> `map_pins`, `campaign_config`). Estender essa cobertura é um item do
> [ROADMAP.md](ROADMAP.md).

---

## 11. Modo local (sem Supabase)

Quando `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` estão ausentes:
- `isSupabaseReady = false`
- Todos os módulos de `src/lib/db/**` caem para `localStorage`/IndexedDB
- `isGM()` retorna `true` (sem restrições)
- Tela de login não aparece
- Botões `⟳ Migrar` e `SetupHealth` ficam ocultos
- Funciona offline / em desenvolvimento sem configurar nada

Útil para desenvolvimento local e para o GM testar mudanças sem mexer no
banco de produção.

---

## 12. Checklist completo

### Setup inicial
- [ ] Projeto Supabase criado
- [ ] [supabase_schema.sql](supabase_schema.sql) executado
- [ ] [supabase_player_writes.sql](supabase_player_writes.sql) executado
- [ ] [supabase_digizap_v2.sql](supabase_digizap_v2.sql) executado
- [ ] [supabase_update_line.sql](supabase_update_line.sql) executado
- [ ] Migrações da Wiki executadas **nesta ordem**: [wiki_migration.sql](wiki_migration.sql) → [wiki_collab_migration.sql](wiki_collab_migration.sql) → [wiki_detailed_migration.sql](wiki_detailed_migration.sql) → [wiki_owner_migration.sql](wiki_owner_migration.sql)
- [ ] [maps_migration.sql](maps_migration.sql) executado
- [ ] [campaign_config_migration.sql](campaign_config_migration.sql) executado
- [ ] [supabase_anon_read.sql](supabase_anon_read.sql) executado **por último**
- [ ] Buckets `portraits` e `assets` criados (public)
- [ ] Realtime habilitado em `app_state`, `stages`, `digi_zap_messages`, `digivices`, `skill_tree_phases`, `campaign_config`
- [ ] `.env.local` configurado
- [ ] `npm install` executado
- [ ] `npm run dev` rodando localmente

### Contas
- [ ] Conta do GM criada e promovida (`role = 'gm'`)
- [ ] Contas dos players criadas e vinculadas a `tamer_id`
- [ ] (Opcional) Contas de convidado via [supabase_guests.sql](supabase_guests.sql)
- [ ] (Opcional) Digivices dos NPCs Fechadura criados

### Seeds
- [ ] [supabase_digizap_groups.sql](supabase_digizap_groups.sql) executado (grupos fixos do Digi-Zap)
- [ ] Healthcheck no app retorna tudo ✓

### Migração (se vindo de uma instância local)
- [ ] GM logado abriu o app uma vez (perfil criado pelo trigger)
- [ ] Botão `⟳ Migrar` clicado com sucesso
- [ ] Estado e imagens conferidos

### Deploy
- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] Deploy executado
- [ ] URL do Vercel adicionada em Authentication → URL Configuration
- [ ] Login em produção testado

---

## Apêndice A — Mapa de arquivos SQL

| Arquivo | Quando executar |
|---|---|
| [supabase_schema.sql](supabase_schema.sql) | Sempre, na criação do projeto |
| [supabase_player_writes.sql](supabase_player_writes.sql) | Sempre, após o schema |
| [supabase_digizap_v2.sql](supabase_digizap_v2.sql) | Sempre, após o schema |
| [supabase_update_line.sql](supabase_update_line.sql) | Sempre, após o schema |
| [wiki_migration.sql](wiki_migration.sql) | Sempre — base da Wiki |
| [wiki_collab_migration.sql](wiki_collab_migration.sql) | Após `wiki_migration` |
| [wiki_detailed_migration.sql](wiki_detailed_migration.sql) | Após `wiki_collab` (depende de `wiki_page_edits`) |
| [wiki_owner_migration.sql](wiki_owner_migration.sql) | Após `wiki_migration` |
| [maps_migration.sql](maps_migration.sql) | Sempre — Mapas |
| [campaign_config_migration.sql](campaign_config_migration.sql) | Sempre — flags globais |
| [supabase_anon_read.sql](supabase_anon_read.sql) | **Por último** — depende das policies de Wiki/Mapas |
| [supabase_digizap_groups.sql](supabase_digizap_groups.sql) | Após criar as contas de players e Fechadura |
| [supabase_guests.sql](supabase_guests.sql) | Opcional — se quiser contas de convidado |

## Apêndice B — Tabelas do banco

### Tabelas centrais ([supabase_schema.sql](supabase_schema.sql))
- **profiles** — extensão de `auth.users` com `role`, `tamer_id`, `npc_id`, `active_npc_view`
- **app_state** — JSONB único com tamers, bestiary, bugs, sectors, bugFolders, customKeywords, customConditions, customClimas, skillTree, survivors (cada linha é também um snapshot histórico)
- **signs** — entidades da Goggle Girl (lista plana)
- **skill_tree_phases** — fases liberáveis pelo GM, skills compráveis por 3 XP
- **stages** — palcos de combate com `actor_states`, `clocks`, `tokens` em tempo real
- **digivices** — fichas + inventário + records + mapas por personagem
- **digi_zap_groups** — grupos de conversa (fixos e bilaterais)
- **digi_zap_messages** — mensagens com anexos, reações, reply chains
- **gm_notes** — notas privadas do GM
- **gm_items** — itens em limbo, atribuíveis e reveláveis ao player

### Tabelas das migrações incrementais
- **wiki_pages** ([wiki_*](wiki_migration.sql)) — `title`, `category`, `body`, `avatar_url`, `visibility`, `linked_type`/`linked_id`, `status`, `author_id`, `owner_tamer_id`, `content` (jsonb de blocos)
- **wiki_relations** ([wiki_migration.sql](wiki_migration.sql)) — `from_id`, `to_id`, `label` (arestas do grafo)
- **wiki_page_edits** ([wiki_collab](wiki_collab_migration.sql) + [wiki_detailed](wiki_detailed_migration.sql)) — edições propostas por players: `page_id`, `author_id`, `title`, `body`, `category`, `content`, `status`
- **maps** ([maps_migration.sql](maps_migration.sql)) — `title`, `description`, `bg_url`, `bg_width`, `bg_height`, `visibility`
- **map_layers** ([maps_migration.sql](maps_migration.sql)) — `map_id`, `name`, `visible`, `order_index`
- **map_pins** ([maps_migration.sql](maps_migration.sql)) — `map_id`, `layer_id`, `label`, `description`, `x`/`y` (frações 0..1), `icon`, `visibility`, `linked_wiki_id`, `linked_map_id`
- **campaign_config** ([campaign_config_migration.sql](campaign_config_migration.sql)) — `campaign_id`, `key`, `value` (jsonb); leitura pública, escrita só GM

## Apêndice C — RPCs disponíveis

| Função | Caller esperado | Retorno |
|---|---|---|
| `update_my_tamer(p_tamer jsonb)` | Player (ou GM) | `{ok, reason?}` |
| `update_digimon_line(p_line jsonb)` | GM | `{ok, reason?}` |
| `buy_skill(p_phase_id uuid, p_skill_index int)` | Player | `{ok, reason?}` |
| `update_actor_state(p_stage_id, p_actor_key, p_hp?, p_defesa?, p_armadura?)` | GM ou dono do ator | `{ok, reason?}` |
| `advance_round(p_stage_id uuid)` | GM | `{ok, reason?}` |
| `reveal_item(p_item_id uuid)` | GM | `{ok, reason?}` |
| `is_gm()` / `my_character_id()` / `is_participant(group_id)` | Internas (usadas por RLS) | boolean / text / boolean |
