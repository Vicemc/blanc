# Digimon Survive — Companion App
## Documentação Técnica e de Design

> **Versão:** 1.0.0 (definitiva)
> **Campanha:** *A Midnight Summer's Dream*
> **Base:** [Comp/Con](https://github.com/massif-press/compcon) — companion app open-source para LANCER TTRPG

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Stack Técnica](#2-stack-técnica)
3. [Estrutura de Arquivos](#3-estrutura-de-arquivos)
4. [Modelo de Dados](#4-modelo-de-dados)
5. [Camada de Dados — store.ts](#5-camada-de-dados--storets)
6. [Componentes](#6-componentes)
7. [Páginas](#7-páginas)
8. [Design System](#8-design-system)
9. [Assets Estáticos](#9-assets-estáticos)
10. [Sistema de Regras Implementado](#10-sistema-de-regras-implementado)
11. [Elenco — Dados Pré-Carregados](#11-elenco--dados-pré-carregados)
12. [Fluxos de Interação](#12-fluxos-de-interação)
13. [Como Rodar](#13-como-rodar)
14. [Como Editar a Base de Dados](#14-como-editar-a-base-de-dados)
15. [Persistência e Backup](#15-persistência-e-backup)
16. [Migração Futura — Supabase](#16-migração-futura--supabase)
17. [Decisões de Design e Arquitetura](#17-decisões-de-design-e-arquitetura)

---

## 1. Visão Geral

O **Digimon Survive Companion App** é uma ferramenta de mesa (*TTRPG companion*) desenvolvida para a campanha *A Midnight Summer's Dream*, usando o sistema **World of Darkness (WoD) adaptado** para o universo Digimon Survive.

O app é **offline-first** e **local-first**: não há backend, não há conta de usuário, não há conexão de rede necessária. Tudo vive no `localStorage` e `IndexedDB` do navegador.

### O que o app faz

| Módulo | Função |
|--------|--------|
| **Party** | Fichas completas de tamers e digimons, com atributos, skills, tamer skills, status derivados, XP, upload de foto e modo livre de edição |
| **Goggle Girl** | Bestiário por Setor e catálogo de BUGs por classe/cor, com CRUD completo de pastas e entradas |
| **Teatro** | Gerenciador de palcos de combate com painel de Domains, suporte a Jogress e adição automática de PCs |
| **Sistema** | Referência completa das regras em 3 sub-abas: Regras, Climas e Digivice |

---

## 2. Stack Técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | React | 18.x |
| Linguagem | TypeScript | 5.x |
| Build | Vite | 5.x |
| Roteamento | React Router | v6 |
| Estilo | CSS Modules + global.css | — |
| Estado | `useState` + `useMemo` + `useCallback` + `createContext` | React nativo |
| Persistência primária | `localStorage` | Browser nativo |
| Persistência secundária | `IndexedDB` (fallback + imagens) | Browser nativo |
| Backend | **Nenhum** | — |
| Porta padrão | **5174** | — |

**Dependências de produção:**
```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.26.1"
}
```

---

## 3. Estrutura de Arquivos

```
survive/
├── index.html
├── package.json
├── vite.config.ts               # porta 5174
├── tsconfig.json
├── DOCUMENTACAO.md              # este arquivo
├── MIGRACAO.md                  # roteiro de migração para Supabase
├── supabase_schema.sql          # schema SQL pronto para o Supabase
│
├── public/
│   ├── affinity/                # 14 ícones PNG das afinidades elementais
│   ├── tamers/                  # 19 retratos PNG dos personagens humanos
│   ├── lvl 3/                   # 13 imagens PNG de digimons Child (Lvl 3)
│   └── lvl 4/                   # 19 imagens PNG de digimons Adult/Armor (Lvl 4)
│
└── src/
    ├── main.tsx
    ├── App.tsx                  # roteamento, AuthProvider, botões Backup/Importar
    ├── App.module.css
    │
    ├── types/
    │   └── index.ts             # todos os tipos TypeScript do domínio
    │
    ├── data/
    │   └── store.ts             # estado, persistência, cálculos, factories, assets
    │
    ├── styles/
    │   └── global.css           # design tokens, grain, fills, tooltips kwTip
    │
    ├── components/
    │   ├── Sheet.tsx            # ficha completa (~1537 linhas)
    │   ├── Sheet.module.css
    │   ├── GrainFill.tsx
    │   ├── GrainFill.module.css
    │   ├── Toast.tsx
    │   ├── PageHead.tsx
    │   └── PageHead.module.css
    │
    └── pages/
        ├── HomePage.tsx / .module.css
        ├── PartyPage.tsx / .module.css
        ├── GogglePage.tsx / .module.css
        ├── TeatroPage.tsx / .module.css
        ├── SistemaPage.tsx / .module.css
```

---

## 4. Modelo de Dados

Todos os tipos vivem em `src/types/index.ts`.

### 4.1 AppState

```typescript
interface AppState {
  tamers:      Tamer[];
  bestiary:    DigimonLine[];
  bugs:        Bug[];
  stages:      Stage[];
  sectors:     SectorFolder[];   // pastas de setor — dinâmicas, editáveis via CRUD
  bugFolders:  BugFolder[];      // pastas de BUG — dinâmicas, editáveis via CRUD
}
```

**Chave no localStorage/IndexedDB:** `digimon_survive`

### 4.2 Tamer

```typescript
interface Tamer {
  id:          string;
  name:        string;
  surname:     string;
  portrait:    Portrait;
  image:       string | null;    // dataURL (em memória após hidratar do IDB)
  imageKey?:   string | null;    // chave no IDB para a imagem personalizada
  age:         number;
  height:      number;
  sign:        string;
  birthday:    string;
  voice:       string;
  tagline:     string;
  xp:          number;
  xpSpent:     number;
  status:      TamerStatus;
  attributes:  Attributes;
  skills:      SkillSet;
  tamerSkills: TamerSkill[];
  digimonId:   string | null;
}
```

### 4.3 TamerSkill e PassiveToggleBonus

```typescript
interface PassiveToggleBonus {
  statusBonus?: Partial<Record<
    'Defesa' | 'Deslocamento' | 'Iniciativa' | 'Armadura' | 'HP' | 'SecurityAttack',
    number
  >>;
  xBonus?: { xMax: number; label: string };  // bônus variável (ex: Shiki com X = 0..2)
}

interface TamerSkill {
  type:         SkillCardType;   // 'action' | 'reaction' | 'passive'
  keyword:      string;
  title:        string;
  target?:      string;
  custo?:       string;
  dados?:       string;
  effect:       string;
  toggleBonus?: PassiveToggleBonus;  // presente em passivas com condição + bônus numérico
}
```

**Passivas com toggle implementadas:**
- **Dance in the Forest** (Reppamon) → Deslocamento +5, Defesa +3 (condição: floresta)
- **Before My Body Submits** (Eisuke) → Defesa +1 (condição: My Body as Shield ativo)
- **Shiki** (Mori/Kudamon) → Defesa +X, Security Attack +X, X ∈ {0,1,2}

### 4.4 DigimonLine e DigimonStage

```typescript
interface DigimonLine {
  id:           string;
  tamerId:      string | null;   // null = selvagem
  name:         string;
  sectors:      number[];
  lore?:        string;
  currentStage: number;
  image:        string | null;
  imageKey?:    string | null;
  stages:       DigimonStage[];
  line:         string;          // ex: '??? ↔ Tinkermon (Child) / Armor ↔ Witchmon ↔ ...'
}

interface DigimonStage {
  stageName:  string;
  level:      string;            // ex: 'Child (Lvl 3)', 'Armor (Lvl 4)', 'Adult (Lvl 4)'
  type:       string;
  cost:       string;
  portrait:   Portrait;
  size:       number;
  speed:      number;
  status:     DigimonStageStatus;  // HP, Deslocamento, Iniciativa, Defesa, Armadura
  attributes: Attributes;
  weakness:   Record<string, string>;
  affinity:   Partial<Affinity>;
  skills:     DigimonSkill[];
  locked:     boolean;           // true = estágio não revelado
}
```

### 4.5 Bug

```typescript
interface Bug {
  id:         string;
  name:       string;
  class:      string;     // ex: 'ledo', 'chi'
  color:      BugColor;
  sectors:    number[];
  lore:       string;
  image:      string | null;
  imageKey?:  string | null;
  status:     DigimonStageStatus;  // valores absolutos (não calculados)
  attributes: Attributes;
  weakness:   Record<string, string>;
  affinity:   Partial<Affinity>;
  skills:     DigimonSkill[];
}
```

> **Importante:** Bugs e digimons selvagens usam `status` como **valores absolutos** — não são recalculados a partir dos atributos. Digimons parceiros têm HP calculado a partir do tamer.

### 4.6 SectorFolder e BugFolder

```typescript
interface SectorFolder {
  n:     number;
  name:  string;
  bioma: string;
  color: Portrait;
}

interface BugFolder {
  cls:   string;
  color: BugColor;
}
```

Essas pastas são armazenadas no `AppState` e editáveis pelo usuário via CRUD na GogglePage.

### 4.7 ExportPackage

```typescript
interface ExportedImage {
  key:     string;
  type:    string;
  dataUrl: string;
}

interface ExportPackage {
  version: number;
  state:   AppState;    // sem data URLs inline (imagens separadas)
  images:  ExportedImage[];
}
```

---

## 5. Camada de Dados — store.ts

`src/data/store.ts` (~2618 linhas) é o único arquivo que acessa `localStorage` e `IndexedDB`.

### 5.1 Chave de Storage

```typescript
const STORAGE_KEY = 'digimon_survive';
```

> **Atenção:** Se o app anterior usava `'cheshire_characters'`, limpar o localStorage antes de usar. Ver seção 15.

### 5.2 IndexedDB — Stores

| Store | Conteúdo |
|-------|---------|
| `state` | AppState serializado (sem imagens inline) |
| `images` | Imagens em dataURL, indexadas por `imageKey` |

```typescript
// Funções disponíveis
idbSave(s: AppState)
idbLoad(): Promise<AppState | null>
idbSaveImage(key: string, dataUrl: string)
idbLoadImage(key: string): Promise<string | null>
idbListImageKeys(): Promise<string[]>
```

### 5.3 Persistência dupla

`saveState` salva em **ambos** simultaneamente:
```typescript
export function saveState(s: AppState): void {
  // Estado leve (sem data URLs) → localStorage + IDB
  // Imagens já estão no IDB separadamente
}
```

`loadStateAsync` tenta localStorage primeiro, IDB como fallback, e hidrata imagens:
```typescript
export async function loadStateAsync(): Promise<AppState> {
  // 1. Tenta localStorage
  // 2. Fallback: IDB
  // 3. hydrateImages: reconecta imagens do IDB ao estado
  // 4. applyDefaultImages: aplica imagens estáticas de /public onde não houver personalizada
}
```

### 5.4 Imagens Default Estáticas

```typescript
// Tamers — /public/tamers/Nome.png
export const TAMER_DEFAULT_IMAGES: Record<string, string> = {
  't-naoki':  '/tamers/Naoki.png',
  // ... 12 entradas
}

// Digimons — /public/lvl 3/ e /public/lvl 4/
// Chave: "lineId:stageIndex"
export const DIGIMON_DEFAULT_IMAGES: Record<string, string> = {
  'd-tinkermon-line:1': '/lvl 3/Tinkermon.png',
  'd-tinkermon-line:2': '/lvl 4/Witchmon.png',
  'd-tinkermon-line:3': '/lvl 4/Witchmon.png',  // Armor (placeholder)
  // ... ~40 entradas
}
```

**Prioridade de imagem:** imagem do usuário (IDB) > imagem default estática (`/public/`).

### 5.5 Cálculo de HP — Digimons Parceiros

HP dos digimons **parceiros** é calculado a partir do tamer:

```
Child / Armor = HP_tamer + 5
Adult         = HP_tamer + 10
Perfect       = HP_tamer + 15
Ultimate      = HP_tamer + 20
```

Digimons **selvagens** e **Bugs** usam `status.HP` como valor absoluto.

### 5.6 mergeWithDefaults

Ao carregar estado salvo, `mergeWithDefaults` garante que:
- Novas tamerSkills do código substituem as salvas (conteúdo sempre atualizado)
- Novas skills de digimons do código substituem as salvas
- Novos bugs do código são injetados automaticamente (não duplica existentes)
- Novos bestiários do código são injetados automaticamente
- `sectors` e `bugFolders` preservam as edições do usuário

### 5.7 Export/Import com Imagens

```typescript
// Export: estado leve + imagens coletadas do IDB
exportStateToFile(s: AppState): Promise<void>
// → baixa midnight-summer-backup-YYYY-MM-DD.json

// Import: detecta ExportPackage vs estado simples
importStateFromFile(): Promise<AppState | null>
// → grava imagens no IDB, hidrata estado
```

---

## 6. Componentes

### 6.1 Sheet.tsx (~1537 linhas)

O componente central. Exporta `FullSheet` e `SheetModal`.

**Contextos internos:**

```typescript
// Modo de visualização de atributos/skills/afinidades
type DisplayMode = 'number' | 'dots'
const DisplayModeCtx = createContext<DisplayMode>('number')
```

O toggle `◌◌◌ / 1 2 3` na barra de abas alterna entre os modos. Ambos os modos são sincronizados entre AttributeGrid, SkillGrid e AffinityGrid via `DisplayModeCtx`.

**Sub-componentes principais:**

| Componente | Função |
|-----------|--------|
| `ValueDisplay` | Renderiza valor como número ou bolinhas (●◌) dependendo do DisplayMode |
| `KwTooltip` | Tooltip posicionado via JS — nunca corta nas bordas da tela |
| `EffectText` | Parser de texto: converte `[Keyword]` em `KwTooltip` automaticamente |
| `AttributeGrid` | Grade de 9 atributos com staging XP, modo livre e prop `freeMode` controlada |
| `SkillGrid` | Grade de skills com staging XP e modo livre (sincronizado com AttributeGrid) |
| `AffinityGrid` | Grid 4×4 de 14 afinidades com ícones PNG e tooltips; layout especial última linha |
| `TamerSkillsWithDomainTabs` | Agrupa tamerSkills em sub-abas por Domain quando há múltiplos |
| `SkillCard` | Card de skill com toggle de passiva bônus para passivas elegíveis |
| `StatRow` | Linha de status com botões +/− para HP, Digisoul e Autoridade |
| `ImageUploadZone` | Upload de foto com preview |

**Modo livre de atributos:**

O `freeMode` é declarado no `TamerView` e passado como prop controlada para `AttributeGrid` (via `freeMode` + `onFreeModeChange`) e `SkillGrid`. Assim os três componentes compartilham o mesmo estado de modo livre.

**Toggle de passivas com bônus:**

`SkillCard` detecta `s.toggleBonus` e renderiza o painel de toggle abaixo do efeito. Quando ativo, os bônus são somados nos `statusEntries` do `TamerView` ou `DigimonStageView` e refletidos no `StatRow`.

**Portrait do estágio:**

O portrait colorido dentro do `DigimonStageView` exibe a imagem default do estágio específico (`DIGIMON_DEFAULT_IMAGES[lineId:stageIdx]`) com prioridade sobre `line.image`.

### 6.2 GrainFill.tsx

Preenche um container com cor sólida + textura grain SVG. Aceita `image` para sobrepor foto.

### 6.3 Tooltips de Keywords

**Dicionário `KEYWORD_TIPS`** em `Sheet.tsx` cobre ~50 entradas: todas as keywords de ação/ataque/reação, condições de ferimento/acumulação/permanentes, e climas.

**`KwTooltip`** usa `onMouseEnter` para calcular a posição do tooltip via `getBoundingClientRect` + `Math.max/min` contra `window.innerWidth`, garantindo que nunca saia da tela.

**`EffectText`** parseia qualquer string de efeito com regex `(\[[^\]]+\])` e converte matches reconhecidos em `KwTooltip`.

---

## 7. Páginas

### 7.1 HomePage

Tela inicial com três cards de navegação e visuais SVG (digivice aleatório, óculos, cortinas).

### 7.2 PartyPage

- Grid de cards de tamer (modo normal: `auto-fill minmax(220px)` / modo compacto: 6 colunas)
- Cada card mostra: foto do tamer, mini portrait do digimon com sua imagem, XP livre
- Botão **⊟ Normal / ⊞ Compacto** para alternar layout
- Painel "✦ Distribuir XP" com valores customizáveis por membro
- Botões ↓↑ (export/import JSON) em cada card, visíveis no hover
- Upload de foto no hover sobre o retrato (salva no IDB)

### 7.3 GogglePage

Duas abas — **Setores** e **BUGs** — com sistema de pastas colapsáveis.

**CRUD de pastas:**
- **+ Pasta de Setor** → cria setor com número automático, nome, bioma, cor
- **+ Pasta de BUG** → cria pasta com classe e cor
- **× Pasta** (dentro de cada pasta) → remove sem apagar entradas

**CRUD de entradas dentro de cada pasta:**
- **+ Digimon / + BUG** → modal pré-preenchido com setor/classe da pasta
- **↑ Importar** → importa JSON direto para a pasta
- **↓ Exportar / ↑ Importar** em cada card (hover)

### 7.4 TeatroPage

**Palco:**
- Título e subtítulo editáveis inline
- Painel **Aliados** (verde) e **Inimigos** (coral)
- Botão **+ Adicionar PCs** — adiciona todos os 6 PCs como duplas tamer+digimon
- Botões **↓ Exportar** e **↑ Importar** para o palco inteiro (JSON)

**Painel de Domain** (aparece quando há tamers com Domain na cena):
- Abas coloridas (cor do retrato) por Domain ativo
- Mostra todas as passivas de Memory daquele Domain

**Jogress / Domain of Time:**
- Só aparece quando **tanto Hare quanto Hibito** estão na cena simultaneamente
- Se apenas um estiver, mostra mensagem "Jogress — aguardando [outro]"
- Seleção de até 2 passivas de Memory dos Domains originais (qualquer combinação)
- Após selecionar as 2, exibe todas as passivas do Domain of Time
- Botão **↺ Refazer seleção** para desfazer
- Aba Jogress tem gradiente bicolor: metade Hare (orange), metade Hibito (indigo)

### 7.5 SistemaPage

Três sub-abas com TOC e cards de keywords:

| Sub-aba | Conteúdo |
|---------|---------|
| **Regras** | Turnos, Rolagens, Defesa, Dano, Digievolução, Grid, Domains, Keywords, Condições |
| **Climas** | Clear Skies, Intense Sunlight, Dense Fog, Heavy Rain — com efeitos completos |
| **Digivice** | Regras do Digivice Chave e Fechadura, Digitize, Runaway Trailmon, Charge, Domains |

---

## 8. Design System

### 8.1 Tokens CSS

```css
--paper:       #f6f2e9   /* fundo principal */
--paper-deep:  #efe9dc   /* fundo de seções */
--ink:         #1a1814   /* texto principal */
--ink-soft:    #4a463e   /* texto secundário */
--ink-mute:    #8a8377   /* labels */
--line:        #c8c0ad   /* bordas */
--line-soft:   #ddd5c1   /* bordas suaves */
--radius:      14px
--shadow:      0 12px 32px -18px rgba(40,30,12,0.35)
```

### 8.2 Tipografia

| Variável | Fonte | Uso |
|---------|-------|-----|
| `--font-display` | Archivo Black | Títulos, nomes |
| `--font-body` | DM Sans | Corpo de texto |
| `--font-serif` | Instrument Serif italic | Taglines |
| `--font-mono` | JetBrains Mono | Labels, stats |

### 8.3 Palette de Cores

| Var | Hex | Uso principal |
|-----|-----|---------------|
| `--coral` | `#e25845` | Naoki / XP / passivas |
| `--teal` | `#4a9b9b` | Mori / toggles ativos |
| `--purple` | `#8a6ea0` | Miki |
| `--black` | `#1a1814` | Yuri |
| `--gold` | `#e7d4a3` | Eisuke / Setor 5 |
| `--rose` | `#d99fae` | Sachi/Emi / Setor 3 |
| `--orange` | `#e87a2c` | Hare |
| `--blue` | `#6e8bb5` | Kanade |
| `--green` | `#6e9d70` | Shinra |
| `--indigo` | `#3b3a5e` | Kumo/Hibito / Setor 4 |
| `--sage` | `#9bb89c` | Setor 1 — Kuwaga |
| `--wheat` | `#d9b974` | Setor 2 — Sisters |

---

## 9. Assets Estáticos

Todos os assets são servidos pelo Vite como arquivos estáticos de `/public/`.

### 9.1 Retratos de Tamers — `/public/tamers/`

19 arquivos PNG com fundo transparente:

| Arquivo | Personagem |
|---------|-----------|
| Naoki.png | NAOKI Mochizuki |
| Eisuke.png | EISUKE Morikawa |
| Miki.png | MIKI Sawatari |
| Yurieta.png | YURI Miyamoto |
| Sachi.png | SACHI Fujimura |
| Mori.png | MORI Utsurogi |
| Hare.png | HARE Ouhara |
| Kanade.png | KANADE Hankei |
| Shinra.png | SHINRA Sorakado |
| Kumo.png | KUMO Sumeragi |
| Emi.png | EMI Chouhou'in |
| Hibito.png | HIBITO Akugetsu |
| Yahiro.png | Yahiro Akugetsu (futuro) |
| Mei.png | Mei Takamiya (futuro) |
| Hino.png | Hino Ogami (futuro) |
| Makoto.png | Makoto Daidouji (futuro) |
| Kimimaro.png | Kimimaro Oikawa (futuro) |
| Shiro.png | Shiro (futuro) |
| Yui.png | Yui (futuro) |

### 9.2 Retratos de Digimons — `/public/lvl 3/` e `/public/lvl 4/`

Mapeados em `DIGIMON_DEFAULT_IMAGES` por chave `"lineId:stageIndex"`.

**Lvl 3 (13 arquivos):** Tinkermon, Kudamon, Blucomon, Wormmon, Solarmon, ToyAgumon, Penmon, Floramon, Hyokomon, Ghostmon, Betamon, Sistermon Blanc, PicoDevimon

**Lvl 4 (19 arquivos):** Witchmon, Reppamon, Paledramon, Guardromon, Omekamon, Swanmon, Coatlmon, FlaWizarmon, Coelamon, Sistermon Noir, Sistermon Ciel, Greymon, Yoyomon, BlackTailmon, Buraimon, Garurumon, Hudiemon, Lekismon, Machmon

### 9.3 Ícones de Afinidade — `/public/affinity/`

14 arquivos PNG (com transparência):
`Agua, Cura, Enfraquecer, Fisico, Fogo, Gelo, Luz, Madeira, Metal, Resistencia, Terra, Trevas, Trovao, Vento`

**Layout das afinidades na ficha** (grid 4×4):
```
Fogo    · Água       · Terra      · Vento
Trovão  · Gelo       · Metal      · Madeira
Luz     · Trevas     · (vazio)    · (vazio)
Físico  · Enfraquecer· Resistência· Cura
```

---

## 10. Sistema de Regras Implementado

### 10.1 Atributos

9 atributos em 3 grupos, limite 5 por atributo:

| Grupo | Atributos |
|-------|-----------|
| Poder | Inteligência, Força, Presença |
| Refinamento | Raciocínio, Destreza, Manipulação |
| Resistência | Perseverança, Vigor, Autocontrole |

### 10.2 Skills

21 skills em 3 categorias, limite 5 por skill:

- **Mental:** Investigação, Construção, E.G., P.S., Folclore, Ciência, Notívago
- **Físico:** Briga, Atletismo, Sobrevivência, Furtividade, Culinária, Limpeza, Esquiva
- **Social:** Intimidação, Persuasão, Socializar, Expressão, Empatia, Subterfúgio, Sorte

### 10.3 Status Derivados

| Status | Fórmula (tamer) | Fórmula (digimon parceiro) |
|--------|----------------|---------------------------|
| HP | Vigor + 5 | HP_tamer + 5×(stageAboveChild+1) |
| Digisoul | Perseverança + Autocontrole | — |
| Defesa | min(Destreza, Raciocínio) | min(Destreza, Raciocínio) + evoBonus |
| Iniciativa | Destreza + Autocontrole + 1 | Destreza + Autocontrole + 1 |
| Deslocamento | Força + Destreza + speed | Força + Destreza + speed |

### 10.4 Custos de XP

```typescript
xpCostAttribute(newLevel) = newLevel × 5
xpCostSkill(newLevel)     = newLevel × 3
```

### 10.5 Staging de XP

Compras são acumuladas antes de confirmar. O usuário pode montar um plano completo, ver o custo total e confirmar/cancelar tudo de uma vez. Em **modo livre**, edições são feitas diretamente sem custo e sem staging — funciona para atributos, skills **e** afinidades.

### 10.6 Afinidades

14 elementos com valor 0–10. Afinidades são somadas à pool de rolagem ao usar skills com aquele elemento. Layout especial na ficha (4×4 com 2 células vazias na linha 3) e ícones PNG com tooltip ao hover.

### 10.7 Evolução e Armor

- **Armor (Lvl 4)** é evolução alternativa ao Child (Lvl 3), não subsequente ao Adult
- Todos os PCs e Hare têm slot Armor
- Custo de Armor usa barra **Digimental** em vez de Memory
- Representado na string `line` como: `Child / Armor ↔ Adult ↔ ...`

---

## 11. Elenco — Dados Pré-Carregados

### 11.1 Player Characters (6)

| Tamer | Cor | Digimon | Linha |
|-------|-----|---------|-------|
| NAOKI Mochizuki | coral | Tinkermon / Witchmon | `??? ↔ Tinkermon (Child) / Armor ↔ Witchmon ↔ ??? ↔ ???` |
| EISUKE Morikawa | gold | Solarmon / Guardromon Gold | `??? ↔ Solarmon (Child) / Armor ↔ Guardromon (Gold) ↔ ???` |
| MIKI Sawatari | purple | Blucomon / Paledramon | `??? ↔ Blucomon (Child) / Armor ↔ Paledramon ↔ ??? ↔ ???` |
| YURI Miyamoto | black | Wormmon (Leafmon↔Minomon↔Wormmon) | `Leafmon ↔ Minomon ↔ Wormmon (Child) / Armor ↔ ??? ↔ ???` |
| SACHI Fujimura | rose | — (a revelar) | — |
| MORI Utsurogi | teal | Kudamon / Reppamon | `??? ↔ Kudamon (Child) / Armor ↔ Reppamon ↔ ??? ↔ ???` |

### 11.2 NPCs Fechadura (6)

| Tamer | Cor | Domain | Digimon |
|-------|-----|--------|---------|
| HARE Ouhara | orange | Domain of Sky / Time (Jogress) | Toy Agumon → Omekamon / **Yoyomon** (Armor) |
| KANADE Hankei | blue | Domain of Suffocation | Penmon → Swanmon |
| SHINRA Sorakado | green | Domain of Nature | Floramon → Coatlmon |
| KUMO Sumeragi | indigo | Domain of Logic | Hyokomon → ??? |
| EMI Chouhou'in | rose | Domain of Emotion | Betamon → Coelamon |
| HIBITO Akugetsu | indigo | Domain of Oblivion / Time (Jogress) | Ghostmon → Fla Wizarmon |

### 11.3 Bestiário Selvagem — Setor 2: Sisters (7)

| ID | Nome | Nível | Tipo |
|----|------|-------|------|
| d-greymon | Greymon | Adult (Lvl 4) | Dinosaur |
| d-pico-devimon | Pico Devimon | Child (Lvl 3) | Small Devil |
| d-sistermon-blanc | Sistermon Blanc | Child (Lvl 3) | Puppet |
| d-sistermon-noir | Sistermon Noir | Adult (Lvl 4) | Puppet |
| d-sistermon-ciel | Sistermon Ciel | Adult (Lvl 4) | Puppet |
| d-yahiro-saki | Yahiro Saki | N/A | Illusion, SIGN 02 |
| d-sakura-fabrication | Sakura Fabrication | Adult (Lvl 4) | Token, Illusion, SIGN 02 |

### 11.4 BUGs

| ID | Nome | Classe | Cor | Nível |
|----|------|--------|-----|-------|
| b-ledo-trivial | red.trivial | ledo | red | Baby II (Lvl 2) |
| b-ledo-low | red.low | ledo | red | Child (Lvl 3) |
| b-ledo-high | red.high | ledo | red | Adult (Lvl 4) |
| b-ledo-hood | red.hood | ledo | red | Adult (Lvl 4) |
| b-chi-chevalier | green.chevalier | chi | green | Baby II (Lvl 2) |
| b-chi-priestess | green.priestess | chi | green | Adult (Lvl 4) |

---

## 12. Fluxos de Interação

### 12.1 Abrir e editar uma ficha

1. Clicar em card na Party → `SheetModal` com `{ kind: 'tamer', id }`
2. Header sempre mostra o tamer (foto, nome, meta)
3. Abas: [NAOKI] + [estágio 0: ???] + [estágio 1: Tinkermon] + [Witchmon] + ...
4. Toggle `◌◌◌ / 1 2 3` na barra de abas → alterna entre bolinhas e números
5. Clicar no estágio → portrait do estágio exibe imagem default correspondente

### 12.2 Modo livre

1. Na ficha do tamer, clicar **"Modo livre (sem XP)"** na seção de atributos
2. Atributos, Skills e Afinidades ganham botões +/− diretos sem custo
3. O estado `freeMode` é compartilhado entre os três componentes via prop
4. Clicar novamente desativa

### 12.3 Toggle de passiva com bônus

1. Passivas elegíveis mostram painel de toggle no rodapé do card
2. Clicar em `○ Inativa` → `● Ativa` (teal)
3. Bônus aplicados instantaneamente no StatRow
4. Shiki mostra selector de X (0/1/2) quando ativa

### 12.4 Teatro — Domains e Jogress

1. Adicionar tamers com Domain ao palco → painel Domain aparece automaticamente
2. Cada aba mostra passivas de Memory daquele Domain
3. Se Hare E Hibito estiverem na cena → aba "Jogress" bicolor aparece
4. Se apenas um → mensagem "Jogress — aguardando [outro]"
5. Selecionar 2 passivas → painel Domain of Time completo aparece

### 12.5 Backup e restore

**Backup:** Botão **↓ Backup** na navbar → baixa `midnight-summer-backup-YYYY-MM-DD.json` incluindo todas as imagens do IDB.

**Restore:** Botão **↑ Importar** na navbar → seleciona arquivo `.json`, grava imagens no IDB e atualiza estado.

**Reset total:**
```javascript
// Console do navegador (F12):
localStorage.removeItem('digimon_survive')
// Depois recarregar a página
```

---

## 13. Como Rodar

**Pré-requisitos:** Node.js ≥ 18, npm ≥ 9

```bash
npm install
npm run dev
# → http://localhost:5174
```

**Build de produção:**
```bash
npm run build
npm run preview
```

**Primeira execução:** `loadState` detecta localStorage vazio e chama `buildDefaultState`, populando o app com todos os personagens da campanha + imagens default estáticas.

---

## 14. Como Editar a Base de Dados

**Arquivo:** `src/data/store.ts` → `buildDefaultState()` (~linha 360)

Após editar, **limpar o localStorage** para o app recarregar os dados frescos:
```javascript
localStorage.removeItem('digimon_survive')
```

> O `mergeWithDefaults` injeta automaticamente novos bugs e bestiários sem necessidade de reset — mas para alterações em tamerSkills ou skills de digimons, o reset é necessário pois essas são sempre substituídas pelo código.

### Adicionar novo tamer

Seguir o padrão dos existentes em `buildDefaultState()`. ID deve ter prefixo `t-`.

### Adicionar imagem default para novo tamer/digimon

1. Colocar o PNG em `public/tamers/` ou `public/lvl 3/` / `public/lvl 4/`
2. Adicionar entrada em `TAMER_DEFAULT_IMAGES` ou `DIGIMON_DEFAULT_IMAGES` no topo do `store.ts`

### Adicionar passiva com toggle

Incluir `toggleBonus` na skill:
```typescript
{
  type: 'passive', keyword: '...', title: '...',
  effect: '...',
  toggleBonus: {
    statusBonus: { Defesa: 2, Deslocamento: 3 },
    // xBonus: { xMax: 3, label: 'X (Condições)' }  // opcional, para bônus variável
  }
}
```

---

## 15. Persistência e Backup

### Estratégia atual

```
localStorage (estado leve, sem imagens)
     ↕ sincronizados
IndexedDB store 'state' (estado leve)
IndexedDB store 'images' (fotos dos personagens)
     ↓ hidratado ao carregar
AppState em memória (com imagens)
```

### Imagens default vs personalizadas

- **Default:** servidas de `/public/tamers/` e `/public/lvl 3-4/` — sempre disponíveis, não ocupam IDB
- **Personalizadas:** upload pelo usuário → salvas no IDB com chave `img-{tamerId}` → têm prioridade sobre as default

### Limitações conhecidas

- `localStorage` tem limite de ~5MB — imagens grandes podem causar falhas silenciosas
- `IndexedDB` aguenta muito mais (~50MB+) — imagens ficam lá
- Múltiplos dispositivos/browsers **não** sincronizam (dados são locais)
- Ver `MIGRACAO.md` para solução completa com Supabase

---

## 16. Migração Futura — Supabase

Ver `MIGRACAO.md` para o roteiro completo e `supabase_schema.sql` para o schema pronto.

**Resumo da arquitetura alvo:**

```
Supabase Auth     → login com email/senha, roles gm/player
Supabase Postgres → AppState como JSONB + tabela stages separada
Supabase Storage  → bucket 'portraits' para imagens
Vercel            → hosting do frontend estático
Realtime          → sync automático entre jogadores via postgres_changes
```

---

## 17. Decisões de Design e Arquitetura

### Por que `digimon_survive` como chave de storage?

Isolamento de dados em relação a outros projetos do mesmo domínio que possam usar `localStorage`.

### Por que estado como JSONB e não normalizado?

Para uma campanha com ~12 tamers e ~20 digimons, normalizar em 20+ tabelas seria overengineering. O JSONB preserva a estrutura TypeScript exata e permite migração direta.

### Por que `mergeWithDefaults` e não reset automático?

Preserva o trabalho do usuário (XP gasto, HP atual, imagens) enquanto garante que correções de texto no código (como o Stagnation do Eisuke) reflitam automaticamente. Apenas os campos de *conteúdo canônico* (skills, tamerSkills) são sobrescritos pelo código; os dados de *runtime* (atributos, XP, status atual) são preservados.

### Por que imagens default estáticas em `/public/`?

Evita que o IDB precise ser populado na primeira execução. Os PNGs são servidos pelo Vite diretamente, sem custo de storage ou carregamento assíncrono.

### Por que o freeMode vive no TamerView e não no AttributeGrid?

O modo livre precisa ser compartilhado entre AttributeGrid, SkillGrid e AffinityGrid. Manter o estado no componente pai (`TamerView`) e passá-lo como prop controlada é o padrão correto de React — evita múltiplos estados dessincronizados.

### Por que tooltips via JS e não CSS puro?

`position: absolute` sofre clipping pelo overflow do container pai. `position: fixed` com CSS puro não tem como saber onde o elemento está na tela. A solução JS com `getBoundingClientRect` + `Math.max/min` contra `window.innerWidth` é a única forma confiável de garantir que o tooltip nunca saia da tela.

### Por que o Domain of Time só aparece com ambos Hare e Hibito?

Narrativo e mecânico: o Domain of Time é o resultado do Jogress entre os dois. Sem um dos membros, o Jogress não pode ser ativado — mostrar as passivas seria confuso e incorreto.

---

*Documentação gerada para a versão 1.0.0 do Digimon Survive Companion App.*
*Campanha: A Midnight Summer's Dream.*
*5739 linhas de código · 19 tamers · 18 digimons · 6 BUGs · 19+13+14 assets de imagem*
