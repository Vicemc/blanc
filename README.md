# Digimon Survive — Companion App
## Documentação Técnica e Funcional

> **Campanha:** *A Midnight Summer's Dream*
> **Sistema de mesa:** World of Darkness (WoD) adaptado ao universo *Digimon Survive*
> **Inspiração arquitetural:** [Comp/Con](https://github.com/massif-press/compcon)

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Stack Técnica](#2-stack-técnica)
3. [Os Dois Modos de Execução](#3-os-dois-modos-de-execução)
4. [Estrutura de Arquivos](#4-estrutura-de-arquivos)
5. [Inicialização — Passo a Passo](#5-inicialização--passo-a-passo)
6. [Autenticação e Papéis](#6-autenticação-e-papéis)
7. [Camada de Dados e Persistência](#7-camada-de-dados-e-persistência)
8. [Modelo de Dados (AppState)](#8-modelo-de-dados-appstate)
9. [Sistema de Imagens](#9-sistema-de-imagens)
10. [Sistema de Visibilidade (3 estados)](#10-sistema-de-visibilidade-3-estados)
11. [Cálculos de Regras (XP, Status, HP)](#11-cálculos-de-regras-xp-status-hp)
12. [Páginas — Funcionamento Detalhado](#12-páginas--funcionamento-detalhado)
13. [Componente Sheet (Ficha)](#13-componente-sheet-ficha)
14. [Backend Supabase (Schema, RLS, Realtime)](#14-backend-supabase-schema-rls-realtime)
15. [Design System](#15-design-system)
16. [Assets Estáticos](#16-assets-estáticos)
17. [Elenco Pré-Carregado](#17-elenco-pré-carregado)
18. [Como Rodar e Fazer Deploy](#18-como-rodar-e-fazer-deploy)
19. [Como Editar a Base de Dados](#19-como-editar-a-base-de-dados)
20. [Decisões de Arquitetura](#20-decisões-de-arquitetura)

---

## 1. Visão Geral

O **Digimon Survive Companion App** é uma ferramenta de mesa (*TTRPG companion*) para a campanha *A Midnight Summer's Dream*. Ele organiza fichas, bestiário, regras, combate e comunicação narrativa entre o Mestre (GM) e os jogadores.

### Módulos

| Módulo | Rota | Função |
|--------|------|--------|
| **Início** | `/` | Tela inicial com cards de navegação e arte SVG. |
| **Party** | `/party` | Fichas de Tamers, Survivors e seus Digimons. XP, foto, distribuição em massa. |
| **Goggle Girl** | `/goggle` | Bestiário (Setores), BUGs, SIGNs e Tokens — tudo com CRUD por pasta. |
| **Teatro** | `/teatro` | Rastreador de combate em tempo real: rounds, HP/Defesa/Armadura, condições, relógios, Domains, Jogress, clima, log. |
| **Sistema** | `/sistema` | Referência completa das regras: Regras, Climas e Digivice. |
| **Digivice** | `/digivice` | Dispositivo pessoal de cada personagem: ficha resumida, inventário, records, mapas. |
| **Digi-Zap** | `/digizap` | Chat em tempo real entre personagens (grupos e conversas bilaterais). |
| **Config** | `/configuracoes` | Preferências locais de exibição. |
| **Backstage** | `/backstage` | Painel exclusivo do GM: usuários, fichas, skill tree, regras (CRUD), visibilidade. |
| **Modo Visitante** | `/view` | Visualização somente-leitura de Party, Bestiário e Palco ativo. |

---

## 2. Stack Técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | React | 18.3 |
| Linguagem | TypeScript | 5.5 |
| Build | Vite | 5.4 |
| Roteamento | React Router | 6.26 |
| Backend (opcional) | Supabase (Auth + Postgres + Storage + Realtime) | `@supabase/supabase-js` 2.106 |
| Estilo | CSS Modules + `global.css` + estilos inline | — |
| Estado | `useState` / `useMemo` / `useCallback` / `createContext` | React nativo |
| Persistência local | `localStorage` + `IndexedDB` | Browser nativo |
| Hosting | Vercel (SPA com rewrites) | — |
| Porta de dev | **5174** | — |

**Dependências de produção:** `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`.

Code-splitting: todas as páginas são carregadas via `lazy()` com auto-reload em caso de chunk obsoleto (deploy novo). O Vite agrupa `node_modules` num único chunk `vendor`.

---

## 3. Os Dois Modos de Execução

A presença das variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` decide o modo. Isso é resolvido em [src/lib/supabase.ts](src/lib/supabase.ts) através de `isSupabaseReady`.

### Modo Local (`localMode`)
- Sem variáveis de ambiente → `supabase = null`.
- **Sem login.** Todo usuário é tratado como GM (`isGM = true`), com acesso total.
- Persistência apenas em `localStorage` + `IndexedDB`.
- Digivice e Digi-Zap exibem aviso "requer Supabase configurado".

### Modo Conectado (Supabase)
- Variáveis presentes → exige login ([LoginPage](src/pages/LoginPage.tsx)).
- Papéis reais: `gm`, `player`, `guest`.
- Estado salvo na tabela `app_state` (JSONB) + Storage para imagens.
- Sincronização em tempo real entre todos os clientes via `postgres_changes`.
- `localStorage` passa a funcionar como **cache offline**.

> Toda função de backend degrada graciosamente: se o Supabase não estiver pronto, ela cai para o equivalente local. Isso permite desenvolver e jogar offline.

---

## 4. Estrutura de Arquivos

```
survive/
├── index.html                  # fontes Google, root, favicon
├── package.json
├── vite.config.ts              # porta 5174, chunk vendor
├── vercel.json                 # rewrites SPA + cache headers
├── supabase_schema.sql         # schema completo do backend
├── supabase_guests.sql         # extensão para contas guest
├── supabase_digizap_groups.sql # seed de grupos do Digi-Zap
├── MIGRACAO.md / MIGRACAO_v2.md # roteiros de migração
│
├── public/
│   ├── Blanc_Icon.png
│   ├── affinity/   # 14 ícones PNG de afinidade elemental
│   ├── avatar/     # avatares pixel-art dos PCs (navbar)
│   ├── tamers/     # 19 retratos de personagens
│   ├── lvl 3/      # 13 sprites de Digimon Child
│   └── lvl 4/      # 19 sprites de Digimon Adult/Armor
│
└── src/
    ├── main.tsx                # bootstrap React
    ├── App.tsx                 # roteamento, nav, auth, save/realtime
    ├── App.module.css
    │
    ├── types/index.ts          # TODOS os tipos do domínio
    │
    ├── data/
    │   ├── store.ts            # estado canônico, cálculos, factories, persistência local
    │   ├── domain.ts           # survivors default, buildDefaultState mínimo, visibilidade
    │   ├── images.ts           # mapas de imagens default estáticas
    │   ├── persistence.ts      # wrapper de IndexedDB
    │   └── rulesData.ts        # climas/keywords/condições base + helpers
    │
    ├── lib/
    │   ├── supabase.ts         # cliente Supabase + isSupabaseReady
    │   ├── auth.ts             # login, perfis, roles
    │   ├── settings.tsx        # preferências locais (Context)
    │   ├── db.ts               # fachada que re-exporta lib/db/*
    │   └── db/
    │       ├── state.ts        # load/save AppState + hidratação de imagens
    │       ├── storage.ts      # upload/URL de imagens no Storage
    │       ├── realtime.ts     # subscrições postgres_changes
    │       ├── skillTree.ts    # CRUD de fases da skill tree
    │       └── migration.ts    # migração local → Supabase
    │
    ├── components/
    │   ├── Sheet.tsx           # ficha completa (~3600 linhas) — núcleo da UI
    │   ├── AuthProvider.tsx    # Context de sessão/perfil
    │   ├── GrainFill.tsx       # preenchimento de cor + textura grain
    │   ├── PageHead.tsx        # cabeçalho de página
    │   └── Toast.tsx
    │
    ├── pages/                  # uma página por rota (ver seção 12)
    └── styles/global.css       # design tokens, fills, grain, tooltips
```

---

## 5. Inicialização — Passo a Passo

O fluxo de boot vive em [src/App.tsx](src/App.tsx) (`AppInner`):

1. **`SettingsProvider`** carrega preferências locais de `localStorage` (`survive_settings`).
2. **`AuthProvider`** verifica `isSupabaseReady`:
   - Local → `loading = false`, `isGM = true`, `localMode = true`.
   - Supabase → busca sessão (`getSession`) e perfil (`getProfile`), e assina mudanças de auth.
3. **Estado inicial:** `useState(() => loadState())` carrega imediatamente do `localStorage` (síncrono, zero flicker).
4. **`useEffect` de carga remota:** quando `loading` termina:
   - Se há Supabase mas sem sessão → mostra `LoginPage`.
   - Caso contrário → `loadStateFromDB()` traz o estado da nuvem (ou cai para local), e marca `appReady`.
5. **Realtime:** com sessão ativa, assina `subscribeToState`. Updates remotos chamam `setState`, exceto se chegarem em menos de 3s do próprio save (anti-eco — ver [App.tsx:118-126](src/App.tsx#L118-L126)).
6. **Render:** navbar + `<Routes>` com todas as páginas em `<Suspense>`.

### Estratégia de salvamento (dois callbacks)

| Callback | Usado por | Comportamento |
|----------|-----------|---------------|
| `onUpdate` | **Teatro** | Salva imediatamente (`saveStateToDB`) — combate é tempo real. Marca `lastSaveRef`. |
| `onUpdateLocal` | demais páginas | Marca `isDirty`, faz **debounce de 1,5s** e então salva. Mostra botão "● Salvar" e aviso `beforeunload`. |

---

## 6. Autenticação e Papéis

Definido em [src/lib/auth.ts](src/lib/auth.ts) e [src/components/AuthProvider.tsx](src/components/AuthProvider.tsx).

### Papéis

| Papel | Pode | Não pode |
|-------|------|----------|
| **gm** | tudo: editar qualquer ficha, ver Backstage, controlar visibilidade, assumir NPCs | — |
| **player** | editar **apenas o próprio tamer** (`profile.tamer_id`), ver Digivice/Digi-Zap próprios | editar outros, ver Backstage |
| **guest** | só leitura de Party, Goggle e Sistema | Teatro, Digivice, Digi-Zap, edição, backup |

### Helpers de permissão
- `isGM(profile)` → `true` em modo local; senão `role === 'gm'`.
- `canEditTamer(profile, tamerId)` → GM sempre; player só o seu.
- O `canEdit(tamerId?)` do `App.tsx` compõe essas regras e é passado às páginas.

### Visibilidade da navbar
- Teatro: oculto para guests.
- Digivice / Digi-Zap: visíveis para GM ou players com `tamer_id` (nunca guests).
- Backstage: só GM.
- Login: conta criada pelo GM, **sem cadastro público** (trigger `handle_new_user` cria o profile automaticamente).

---

## 7. Camada de Dados e Persistência

### 7.1 Persistência local — [src/data/store.ts](src/data/store.ts) + [src/data/persistence.ts](src/data/persistence.ts)

- **Chave:** `localStorage['digimon_survive']`.
- **IndexedDB** (`digimon_survive_db`, v2): stores `state` (AppState serializado) e `images` (data URLs por chave).
- `saveState(s)` grava uma versão **slim** (sem data URLs inline de imagens) em ambos.
- `loadState()` (síncrono) lê do `localStorage`, aplica `mergeWithDefaults` e `applyDefaultImages`.
- `loadStateAsync()` tenta `localStorage`, depois IDB, e hidrata as imagens do IDB.

### 7.2 `mergeWithDefaults` — o coração da atualização de conteúdo

Ao carregar um estado salvo, ele mescla com `buildDefaultState()`:
- **Tamers:** preserva runtime (XP, status, atributos) mas **sempre reinjeta `tamerSkills` do código** (correções de texto refletem sem reset).
- **Bestiário:** preserva linhas salvas, reinjeta `skills` de cada estágio do código, e **adiciona linhas novas** do código.
- **Bugs:** preserva os salvos, injeta bugs novos do código.
- **Survivors:** preserva integralmente, injeta defaults faltantes. Inclui **migração**: um "Yahiro" que existisse como Tamer antigo é convertido para Survivor.
- `sectors`, `bugFolders`, `signs`, `skillTree`, `customClimas/Keywords/Conditions`, `jogressConfigs`, `tokenDefs`, `visibility` preservam edições do usuário.

### 7.3 Persistência remota — [src/lib/db/state.ts](src/lib/db/state.ts)

- `loadStateFromDB()`: busca o registro mais recente de `app_state` (campaign `midnight-summer`), injeta survivors default faltantes, **hidrata imagens via Storage** e sincroniza o `localStorage` como cache.
- `saveStateToDB(s)`: salva local primeiro (latência zero na UI), depois envia versão **slim** (`stripImages`) para o Supabase — update se já existe linha, insert caso contrário.
- `loadStagesFromDB` / `saveStage` / `deleteStage`: os palcos têm acesso independente (tabela `stages`).

### 7.4 Export / Import (backup manual)
- `exportStateToFile(s)` → baixa `midnight-summer-backup-AAAA-MM-DD.json` (um `ExportPackage` com estado slim + array de imagens em data URL).
- `importStateFromFile()` → detecta `ExportPackage` (com imagens) vs estado simples, regrava imagens no IDB e hidrata. Disponível na navbar (exceto guests).

---

## 8. Modelo de Dados (AppState)

Todos os tipos vivem em [src/types/index.ts](src/types/index.ts). O `AppState` é o objeto único persistido (como JSONB no Supabase).

```typescript
interface AppState {
  tamers:      Tamer[];        // PCs e NPCs Fechadura
  survivors:   Survivor[];     // personagens sem digimon (ex: Yahiro)
  bestiary:    DigimonLine[];  // digimons parceiros + selvagens (cada um tem stages[])
  bugs:        Bug[];          // BUGs (status absoluto)
  signs:       Sign[];         // SIGNs (entidades especiais)
  stages:      Stage[];        // palcos do Teatro (com runtime de combate)
  sectors:     SectorFolder[]; // pastas de setor (CRUD)
  bugFolders:  BugFolder[];    // pastas de BUG (CRUD)
  skillTree:   SkillTreePhase[];

  // Extensões do GM
  customClimas:     ClimaEntry[];
  customKeywords:   KeywordEntry[];
  customConditions: ConditionEntry[];
  jogressConfigs:   JogressConfig[];
  jogressPassword?: string;
  tokenDefs:        TokenDef[];

  // Controle de visibilidade (GM)
  visibility:  VisibilityMap;  // 'tipo:id' → 'hidden' | 'name' | 'full'
}
```

### Entidades principais

- **Tamer** — humano com `attributes` (9), `skills` (21), `tamerSkills`, `status` (HP/Memory/Digisoul/Deslocamento/Autoridade/Iniciativa), XP, `inventory`, `digimonId`.
- **DigimonLine** — linha evolutiva com `stages: DigimonStage[]` e `currentStage`. Cada estágio tem status, atributos, afinidade, fraquezas, skills, `locked`/`hidden` e imagem própria.
- **Survivor** — humano sem digimon: atributos simplificados (Poder/Refinamento/Resistência), `survivorSkills`, `merits`, `mindLink`, `inventory`, blocos de `lore` com visibilidade.
- **Bug / Sign** — entidades de status **absoluto** (não calculado).
- **TamerSkill / DigimonSkill** — cartões de ação/reação/passiva. Podem ter `toggleBonus` (bônus condicional ativável no Palco) ou `alwaysOn` (bônus permanente, herdável por evoluções).
- **Stage** — `sides.allies/enemies: ActorRef[]` + campos de runtime (round, actorStates, clocks, clima, log, tokenMeta) anexados dinamicamente.
- **JogressConfig** — fusão de dois Domains (Fechaduras), com skills por lock, grupos de memória selecionáveis e passivas próprias.
- **TokenDef** — definição de token invocável (ex: Silhouette/Puppet Token).

---

## 9. Sistema de Imagens

A prioridade de imagem é sempre: **upload do usuário → imagem default estática**.

### Imagens default ([src/data/images.ts](src/data/images.ts))
- `TAMER_DEFAULT_IMAGES`: `t-naoki` → `/tamers/Naoki.png` (12 PCs/NPCs).
- `DIGIMON_DEFAULT_IMAGES`: chave `"lineId:stageIndex"` → caminho em `/lvl 3/` ou `/lvl 4/`.

### Upload e armazenamento
- **Modo local:** upload salva data URL no IndexedDB com chave igual ao id.
- **Modo Supabase:** [storage.ts](src/lib/db/storage.ts) `uploadImage` converte data URL → Blob → bucket `portraits` (path `{id}.{ext}`) e guarda `imageKey` na entidade.
- **Hidratação:** ao carregar, `hydrateImagesFromStorage` (remoto) ou `hydrateImages` (local) resolve `imageKey` → URL pública/data URL, ou cai para a imagem default.
- **Cache de URLs:** `_urlCache` (Map de módulo em `state.ts`) evita recomputar `getPublicUrl` repetidamente nos eventos de realtime.
- Estados salvos (`stripImages`/`saveState` slim) **nunca** carregam data URLs inline — imagens ficam separadas (Storage ou IDB), mantendo o JSONB leve.

---

## 10. Sistema de Visibilidade (3 estados)

O GM controla o que os players enxergam. Implementado em [store.ts](src/data/store.ts) (`getVisLevel`, `isVisible`, `setVisibility`, `visKey`).

```typescript
type VisibilityLevel = 'hidden' | 'name' | 'full'
type VisibilityMap = Record<string, VisibilityLevel>  // chave: 'tipo:id'
```

| Nível | Player vê |
|-------|-----------|
| `hidden` | nada (entidade some das listas) |
| `name` | apenas **foto + nome** (a ficha abre restrita) |
| `full` | tudo |

- **Default por tipo:** `stage` é `full`; o resto é `hidden`.
- **Migração de boolean:** valores antigos `true`/`false` viram `full`/`hidden` transparentemente.
- **Toggles na UI:**
  - `EyeToggle` (2 estados: hidden ↔ full) — usado em Party (tamers/survivors).
  - `EyeToggle3` (3 estados, cicla hidden → name → full) — usado em Goggle (bestiário, BUGs, SIGNs).
- **`nameOnly` na ficha:** o `SheetModal` calcula, para não-GMs, se a entidade está em `name` e, se sim, renderiza só retrato + nome + "~ informações restritas ~" ([Sheet.tsx:3576](src/components/Sheet.tsx#L3576)).
- A página **Backstage → Visibilidade** lista todas as entidades para controle centralizado.

---

## 11. Cálculos de Regras (XP, Status, HP)

Definidos em [src/data/store.ts](src/data/store.ts).

### Atributos e Skills
- 9 atributos em 3 grupos (Poder/Refinamento/Resistência), limite 5.
- 21 skills em 3 categorias (Mental/Físico/Social), limite 5.

### Custos de XP
```
xpCostAttribute(novoNível) = novoNível × 5
xpCostSkill(novoNível)     = novoNível × 3
```
Compras passam por **staging** (acumuladas e confirmadas em bloco) ou **modo livre** (edição direta sem custo). A skill tree custa 3 XP por skill liberada.

### Status derivados (Tamer)
| Status | Fórmula |
|--------|---------|
| HP | Vigor + size |
| Digisoul | Perseverança + Autocontrole |
| Iniciativa | Destreza + Autocontrole + 1 |
| Deslocamento | Força + Destreza + speed |

### HP de Digimon parceiro (`calcDigimonDerived`)
Relativo ao HP do tamer, por nível do estágio:
```
Child   = HP_tamer + 5
Armor   = HP_tamer + 8
Adult   = HP_tamer + 10
Perfect = HP_tamer + 15
Ultimate= HP_tamer + 20
```
Digimons **selvagens** e **Bugs/SIGNs** usam `status.HP` como valor absoluto (Vigor + size se sem tamer).

---

## 12. Páginas — Funcionamento Detalhado

### 12.1 HomePage — [src/pages/HomePage.tsx](src/pages/HomePage.tsx)
Tela inicial com 3 cards (Party / Goggle Girl / Teatro) e arte SVG inline (digivice aleatório por sessão, óculos, palco). Link para Sistema no rodapé.

### 12.2 PartyPage — [src/pages/PartyPage.tsx](src/pages/PartyPage.tsx)
- Grid de cards de **Tamers** e **Survivors** (layout normal ou compacto — preferência persistida).
- Cada card: foto (upload no hover), nome, meta, tagline, XP livre, mini-card do digimon.
- **GM:** botão de olho (`EyeToggle`) por card, "+ Novo Tamer", "+ Survivor", e painel **"✦ Distribuir XP"** (valor base + override por membro).
- Export/import de ficha individual (JSON) no hover.
- Clique no card → `SheetModal` (editável conforme `canEdit`).

### 12.3 GogglePage — [src/pages/GogglePage.tsx](src/pages/GogglePage.tsx)
Quatro abas:
- **Setores:** pastas por setor; digimons agrupados por `sectors`. CRUD de pasta e de digimon (selvagem). `EyeToggle3` por entrada.
- **BUGs:** pastas por `classe.cor`; CRUD de pasta e bug.
- **SIGNs:** lista plana; CRUD de SIGN com `EyeToggle3`.
- **Tokens:** definições de token (`TokenDef`) — stats, dados, condições automáticas, visibilidade. São o que o Teatro invoca.
- Toda entrada abre o `SheetModal` correspondente.

### 12.4 TeatroPage — [src/pages/TeatroPage.tsx](src/pages/TeatroPage.tsx) (a mais complexa)
Índice de palcos → `PalcoView` ao abrir um. O `PalcoView` é o rastreador de combate:

- **Runtime do palco** (`getRuntime`): `roundCurrent`, `actorStates` (HP/Defesa/Armadura/condições por ator), `clocks`, `clima`, `log`, `tokenMeta` — campos anexados ao `Stage`.
- **Atores** (`ActorRef`): human, pair (tamer+digimon), wild, bug, survivor, sign. Cada ator vira um `ActorChip` com HP/Defesa/Armadura editáveis e condições.
- **Adicionar:** `Picker` paginado por tipo, "+ Adicionar PCs" (os 6 jogadores de uma vez), invocar Tokens.
- **Evolução no palco:** `evolveActor` troca o estágio do pair e reinicializa o `ActorState`.
- **Contador de Round:** o "+" restaura a Defesa de todos para `defesa_base` e gera log automático. Pop-up central + som configuráveis.
- **Painéis:**
  - `DomainPanel` — abas por Domain presente; lógica de **Jogress** (fusão de Fechaduras) com seleção de passivas de memória e Domain fusionado (ex: *Domain of Time* = Hare + Hibito). Lê `jogressConfigs` do GM.
  - `ClimaPanel` — seletor de clima ativo (bases + custom).
  - `ConditionShortcutsPanel` — aplica condições rapidamente nos atores.
  - `ClocksPanel` — relógios de 10 seções por ator.
  - `PalcoLogPanel` — log automático + entradas manuais do GM.
- **Export/Import** do palco inteiro (JSON).

### 12.5 SistemaPage — [src/pages/SistemaPage.tsx](src/pages/SistemaPage.tsx)
Referência de regras em 3 sub-abas:
- **Regras:** turnos, rolagens, defesa, dano, digievolução, grid, domains, keywords, condições. Texto com `**negrito**` e tooltips.
- **Climas:** cards de cada clima (bases + custom do GM).
- **Digivice:** regras do Digivice Chave/Fechadura, Digitize, Trailmon, Charge, Domains.

### 12.6 DigivicePage — [src/pages/DigivicePage.tsx](src/pages/DigivicePage.tsx) (requer Supabase)
Dispositivo pessoal, persistido na tabela `digivices`. GM escolhe o personagem; player vê o seu.
- **Barra de status:** Memory (com botão ⚡ Charge → reseta para 3), Autoridade (só Chave), Tickets de Trailmon, status do dispositivo (Ativo/Carregando/Dormindo).
- **Sub-abas:**
  - **Ficha:** resumo + botão para abrir a ficha completa.
  - **Inventário:** itens com tipo, quantidade, efeitos e flag `gm_only`.
  - **Records:** documentos, fotos e **Conversas Arquivadas** (chats do Digi-Zap arquivados como `type: 'chat'`).
  - **Mapas:** imagens + notas.

### 12.7 DigiZapPage — [src/pages/DigiZapPage.tsx](src/pages/DigiZapPage.tsx) (requer Supabase)
Chat em tempo real (`digi_zap_groups` + `digi_zap_messages`).
- Sidebar com **Grupos**, **Conversas** (bilaterais) e "Nova conversa".
- GM escolhe **enviar como** qual personagem (NPC ou PC) e pode criar grupos.
- Mensagens com metadados narrativos opcionais: Dia de Sobrevivência, Horário, Sessão.
- **Realtime** ouve inserts de todos os grupos; grupo inativo incrementa o badge de não-lidos e toca um **ping** (Web Audio). "Última vez visto" por grupo guardado em `localStorage`.
- **Arquivamento:** ao abrir um grupo com > 100 mensagens (ou via botão "Arquivar conversa" do GM), as mensagens são gravadas como `record` nos Digivices dos participantes e removidas do banco (controle de memória). A lista em memória é limitada a 100.

### 12.8 BackstagePage — [src/pages/BackstagePage.tsx](src/pages/BackstagePage.tsx) (só GM)
Cinco abas:
- **Usuários:** lista perfis, define role e `tamer_id`.
- **Fichas:** edição direta de qualquer ficha.
- **Skill Tree:** cria/desbloqueia fases por tamer; player compra as skills (3 XP).
- **Regras:** CRUD de Climas, Keywords, Condições e **Jogress** (define Fechaduras, skills por lock e gera automaticamente a skill compartilhada `Jogress: [Natural] & [Metafísico]` nos dois tamers).
- **Visibilidade:** controle centralizado de `hidden`/`name`/`full` de todas as entidades.

### 12.9 SettingsPage — [src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx)
Preferências locais (em `localStorage`, via `SettingsProvider`): esconder taglines (por página), pop-up de round, som do Digi-Zap, modo de ficha (vertical/horizontal), valores numéricos vs bolinhas, layout de atributos (Blanc/Clássica), grid compacto da Party.

### 12.10 ViewerPage — [src/pages/ViewerPage.tsx](src/pages/ViewerPage.tsx)
Modo visitante somente-leitura em `/view`: Party, Bestiário (respeitando visibilidade) e Palco ativo. Fichas abrem em modo não-editável.

---

## 13. Componente Sheet (Ficha)

[src/components/Sheet.tsx](src/components/Sheet.tsx) (~3600 linhas) é o componente mais central. Exporta `FullSheet` e `SheetModal`, mais o tipo `SheetSubject`:

```typescript
type SheetSubject =
  | { kind: 'tamer';    id }
  | { kind: 'pair';     tamerId; digimonId; stage }
  | { kind: 'wild' | 'digimon'; id }
  | { kind: 'bug';      id }
  | { kind: 'sign';     id }
  | { kind: 'survivor'; id }
```

O `SheetModal` despacha para a *view* certa: `TamerView`, `DigimonStageView`, `BugView`, `SignView` ou `SurvivorView`.

### Recursos transversais
- **DisplayMode** (`number` | `dots`) via Context — atributos/skills/afinidades como número ou bolinhas, sincronizados.
- **`EffectText` + `KwTooltip`** — parser que converte `[Keyword]` em tooltip posicionado via JS (`getBoundingClientRect`, nunca corta na borda). Dicionário `KEYWORD_TIPS` cobre ~50 termos.
- **Modo livre** — edição direta de atributos/skills/afinidades sem custo de XP, estado compartilhado entre as grades.
- **Staging de XP** — `XpConfirmBar` mostra custo total antes de confirmar.
- **Toggles de passiva** (`toggleBonus`) — somam bônus a status/condições; algumas com X variável (ex: Shiki 0–2).
- **Skill Tree** integrada na ficha do tamer (compra via Supabase RPC `buy_skill`, ou local).
- **Inventário, Merits, MindLink, Lore** para survivors; **Digivice inventory** embutido.
- **`nameOnly`** restringe a ficha quando a visibilidade é `name` (ver seção 10).
- Modo **horizontal** (preferência) amplia o modal e dispõe seções em colunas.

---

## 14. Backend Supabase (Schema, RLS, Realtime)

Schema completo em [supabase_schema.sql](supabase_schema.sql).

### Tabelas
| Tabela | Conteúdo |
|--------|----------|
| `profiles` | estende `auth.users`: `display_name`, `role`, `tamer_id`, `npc_id`, `active_npc_view`. Trigger cria profile no signup. |
| `app_state` | `AppState` inteiro como JSONB (campaign `midnight-summer`). |
| `stages` | palcos de combate (round, actor_states, clocks, tokens) — sync independente. |
| `signs` | SIGNs da Goggle Girl. |
| `skill_tree_phases` | fases de skill por tamer (available/acquired). |
| `digivices` | um por personagem: memory, authority, tickets, inventory, records, maps. |
| `digi_zap_groups` / `digi_zap_messages` | grupos e mensagens do chat. |
| `gm_notes` / `gm_items` | conteúdo exclusivo do GM (itens revelados sob demanda). |

### Segurança (RLS)
- Helpers: `is_gm()`, `my_character_id()`, `is_participant(group_id)`.
- Players só leem/escrevem o que lhes pertence (próprio digivice, grupos que participam, fases desbloqueadas do próprio tamer). GM tem acesso amplo.
- Mensagens são imutáveis (só GM deleta).

### Funções RPC de negócio
- `buy_skill(phase_id, skill_index)` — compra atômica (move skill + debita 3 XP no JSONB).
- `update_actor_state(...)`, `advance_round(stage_id)`, `reveal_item(item_id)`.

### Realtime
Publicação `supabase_realtime` inclui `app_state`, `stages`, `digi_zap_messages`, `digivices`, `skill_tree_phases`. `gm_notes`/`gm_items` ficam de fora por precaução.

### Storage
Buckets públicos `portraits` (fotos de tamers/digimons, path `{id}.{ext}`) e `assets` (SIGNs, mapas, records). Policies de leitura pública + escrita autenticada.

---

## 15. Design System

Tokens em [src/styles/global.css](src/styles/global.css). Estética "papel envelhecido" com textura grain.

| Token | Valor | Uso |
|-------|-------|-----|
| `--paper` / `--paper-deep` | `#f6f2e9` / `#efe9dc` | fundos |
| `--ink` / `--ink-soft` / `--ink-mute` | `#1a1814` / `#4a463e` / `#8a8377` | texto |
| `--line` / `--line-soft` | `#c8c0ad` / `#ddd5c1` | bordas |
| `--radius` | `14px` | cantos |

**Fontes:** Archivo Black (display), DM Sans (corpo), Instrument Serif itálico (taglines), JetBrains Mono (labels/stats).

**Paleta de personagens:** coral, teal, purple, black, gold, rose, orange, blue, green, indigo, sage, wheat — cada `Portrait` mapeia para uma classe `fill-*` com grain.

---

## 16. Assets Estáticos

- **`/public/tamers/`** — 19 retratos PNG.
- **`/public/lvl 3/`** — 13 sprites Child; **`/public/lvl 4/`** — 19 sprites Adult/Armor.
- **`/public/affinity/`** — 14 ícones: Agua, Cura, Enfraquecer, Fisico, Fogo, Gelo, Luz, Madeira, Metal, Resistencia, Terra, Trevas, Trovao, Vento.
- **`/public/avatar/`** — avatares pixel-art dos PCs (exibidos na navbar).

Layout das afinidades na ficha (grid 4×4):
```
Fogo    · Água        · Terra       · Vento
Trovão  · Gelo        · Metal       · Madeira
Luz     · Trevas      · (vazio)     · (vazio)
Físico  · Enfraquecer · Resistência · Cura
```

---

## 17. Elenco Pré-Carregado

Definido em `buildDefaultState()` ([store.ts:757](src/data/store.ts#L757)).

### Player Characters (6)
| Tamer | Cor | Digimon |
|-------|-----|---------|
| NAOKI Mochizuki | coral | Tinkermon → Witchmon |
| EISUKE Morikawa | gold | Solarmon → Guardromon |
| MIKI Sawatari | purple | Blucomon → Paledramon |
| YURI Miyamoto | black | Wormmon |
| SACHI Fujimura | rose | (Puppet Theater / Tokens) |
| MORI Utsurogi | teal | Kudamon → Reppamon |

### NPCs Fechadura (6) — com Domain
Hare (Sky), Kanade, Shinra (Nature), Kumo (Logic), Emi (Emotion), Hibito (Oblivion). Hare + Hibito formam o Jogress **Domain of Time**.

### Bestiário (Setor 2 — Sisters)
Greymon, Pico Devimon, Sistermon Blanc/Noir/Ciel, Yahiro Saki (SIGN 02), Sakura Fabrication.

### BUGs
`red.trivial/low/high/hood` (ledo) e `green.chevalier/priestess` (chi).

### Survivors
Yahiro Akugetsu (default).

### Tokens (`DEFAULT_TOKEN_DEFS`)
Silhouette Token (Hibito), Puppet Token e Enhanced Puppet Token (Sachi).

---

## 18. Como Rodar e Fazer Deploy

**Pré-requisitos:** Node.js ≥ 18, npm ≥ 9.

```bash
npm install
npm run dev       # http://localhost:5174
npm run build     # tsc + vite build
npm run preview
```

### Variáveis de ambiente (modo conectado)
Crie `.env` na raiz:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
Sem elas, o app roda em modo local.

### Setup do Supabase
1. Criar projeto no Supabase.
2. Rodar [supabase_schema.sql](supabase_schema.sql) no SQL Editor.
3. Criar buckets públicos `portraits` e `assets`.
4. Criar a conta do GM (ou via signup) e promover: `update public.profiles set role='gm' where id='<uuid>';`
5. Logar no app e usar **⟳ Migrar** (navbar) para enviar os dados locais à nuvem.
6. (Opcional) Rodar os seeds de grupos do Digi-Zap.

### Deploy (Vercel)
SPA com `vercel.json` (rewrites para `/index.html`, `index.html` sem cache, `/assets/*` imutável). Definir as variáveis de ambiente no painel da Vercel.

---

## 19. Como Editar a Base de Dados

A base canônica está em `buildDefaultState()` ([src/data/store.ts](src/data/store.ts)).

- **Conteúdo de skills/tamerSkills:** edite no código — o `mergeWithDefaults` reinjeta automaticamente (sem reset).
- **Novos bugs/bestiário:** adicione no código — são injetados sem duplicar.
- **Imagens default:** coloque o PNG em `public/` e registre em `TAMER_DEFAULT_IMAGES`/`DIGIMON_DEFAULT_IMAGES` ([images.ts](src/data/images.ts)).
- **Reset total (modo local):**
  ```js
  localStorage.removeItem('digimon_survive')  // F12 → Console, depois recarregar
  ```
- **Regras (climas/keywords/condições):** as bases vivem em [rulesData.ts](src/data/rulesData.ts); o GM adiciona customizações pela aba Backstage → Regras (gravadas no `AppState`).

---

## 20. Decisões de Arquitetura

- **AppState como JSONB único:** para ~12 tamers e ~20 digimons, normalizar em 20+ tabelas seria overengineering. O JSONB preserva a estrutura TypeScript e simplifica a migração. Palcos e digivices, que têm sync e RLS próprios, foram extraídos para tabelas dedicadas.
- **Degradação graciosa:** toda função de backend cai para o equivalente local quando `isSupabaseReady` é falso — permite jogar offline e desenvolver sem credenciais.
- **`mergeWithDefaults`:** separa *conteúdo canônico* (reescrito pelo código) de *runtime do usuário* (preservado). Correções de texto chegam sem destruir progresso.
- **Anti-eco do realtime + cache de URLs + debounce de save:** três medidas que reduzem re-renders e uso de memória num app que fica aberto por horas durante a sessão.
- **Visibilidade de 3 estados:** dá ao GM controle narrativo fino — revelar só o nome de um inimigo antes de revelar a ficha inteira.
- **Tooltips via JS:** `position: fixed` calculado com `getBoundingClientRect` é a única forma confiável de o tooltip nunca ser cortado pelo overflow do container.
- **Imagens fora do JSONB:** manter o estado "slim" evita estourar o limite do `localStorage` (~5MB) e mantém os payloads de realtime pequenos.

---

*Documentação do funcionamento atual — campanha A Midnight Summer's Dream.*
