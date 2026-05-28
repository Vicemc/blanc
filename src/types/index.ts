// ===== Core domain types for Digimon Survive companion =====

export type Portrait =
  | 'sage' | 'wheat' | 'rose' | 'indigo' | 'gold'
  | 'coral' | 'orange' | 'red' | 'pink' | 'green'
  | 'blue' | 'purple' | 'black' | 'teal';

export type BugColor = 'red' | 'green' | 'blue' | 'white' | 'purple' | 'yellow';

// ---------- Attributes ----------

export interface Attributes {
  Inteligência: number;
  Força: number;
  Presença: number;
  Raciocínio: number;
  Destreza: number;
  Manipulação: number;
  Perseverança: number;
  Vigor: number;
  Autocontrole: number;
}

export type AttributeKey = keyof Attributes;

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  'Inteligência', 'Força', 'Presença',
  'Raciocínio', 'Destreza', 'Manipulação',
  'Perseverança', 'Vigor', 'Autocontrole',
];

export const ATTRIBUTE_GROUPS: { label: string; keys: AttributeKey[] }[] = [
  { label: 'Poder',       keys: ['Inteligência', 'Força', 'Presença'] },
  { label: 'Refinamento', keys: ['Raciocínio', 'Destreza', 'Manipulação'] },
  { label: 'Resistência', keys: ['Perseverança', 'Vigor', 'Autocontrole'] },
];

// ---------- Skills ----------

export interface SkillSet {
  Mental:  Record<string, number>;
  Físico:  Record<string, number>;
  Social:  Record<string, number>;
}

export const DEFAULT_SKILL_SET: SkillSet = {
  Mental:  { Investigação: 0, Construção: 0, 'E.G.': 0, 'P.S.': 0, Folclore: 0, Ciência: 0, Notívago: 0 },
  Físico:  { Briga: 0, Atletismo: 0, Sobrevivência: 0, Furtividade: 0, Culinária: 0, Limpeza: 0, Esquiva: 0 },
  Social:  { Intimidação: 0, Persuasão: 0, Socializar: 0, Expressão: 0, Empatia: 0, Subterfúgio: 0, Sorte: 0 },
};

// ---------- Tamer Skill ----------

export type SkillCardType = 'action' | 'reaction' | 'passive';

// Bônus aplicado quando passiva/skill com toggle é ativada no Palco.
// Tudo aqui é opcional — preencha só o que a skill faz.
export interface PalcoCondition {
  label:  string;   // nome da condição (ex: 'Blocker', 'Burn', 'Poison')
  filled: number;   // cargas iniciais
  max:    number;   // máximo de cargas (padrão 3)
  color:  string;   // 'coral' | 'orange' | 'blue' | 'purple' | 'teal' | 'green' | 'gold' | 'indigo'
}

export interface PassiveToggleBonus {
  // ── Bônus de status (no ativador) ──────────────────────────────
  // Soma ao ActorState do chip que ativou a skill
  statusBonus?: Partial<Record<
    'Defesa' | 'Deslocamento' | 'Iniciativa' | 'Armadura' | 'HP' | 'SecurityAttack', number
  >>;

  // ── Bônus variável (X escolhido pelo usuário) ───────────────────
  // O statusBonus é multiplicado por X quando xBonus está presente
  xBonus?: { xMax: number; label: string };

  // ── Condições aplicadas ao ativador ────────────────────────────
  selfConditions?: PalcoCondition[];

  // ── Condições aplicadas a um alvo (escolhido no palco) ─────────
  // Se presente, o chip mostra um seletor de alvo após ativar
  targetConditions?: PalcoCondition[];

  // ── Memória ────────────────────────────────────────────────────
  // Ajuste de Memory do tamer ativador (+N ou −N)
  memoryDelta?: number;

  // ── Label customizado do botão no palco ────────────────────────
  // Se ausente, usa "⊕ {skill.title}"
  palcoLabel?: string;

  // ── Duração em rounds (informativa) ────────────────────────────
  durationRounds?: number;
}

// Bônus sempre ativo (sem toggle). affinityBonus se aplica ao tamer/digimon permanentemente.
// inheritable: se true, evoluções herdam o bônus de statusBonus.
export interface AlwaysOnBonus {
  statusBonus?:  Partial<Record<'HP' | 'Defesa' | 'Deslocamento' | 'Iniciativa' | 'Armadura' | 'Digisoul' | 'SecurityAttack', number>>;
  affinityBonus?: Partial<Affinity>;
  inheritable?: boolean;
}

export type ItemTipo = 'Item' | 'Arma' | 'Chave' | 'Acessório';

export interface InventoryItem {
  id:         string;
  name:       string;
  qty:        number;
  notes?:     string;
  tipo?:      ItemTipo;
  alcance?:   string;
  usos?:      number;
  descricao?: string;
  efeito?:    string;
}

export interface TamerSkill {
  type: SkillCardType;
  keyword: string;
  title: string;
  target?: string;
  custo?: string;
  dados?: string;
  effect: string;
  toggleBonus?: PassiveToggleBonus;
  alwaysOn?: AlwaysOnBonus;
}

// ---------- Survivor ----------

export interface SurvivorAttributes {
  Poder:       number;
  Refinamento: number;
  Resistência: number;
}

export interface SurvivorStatus {
  HP:           { v: number; max: number };
  Digisoul:     { v: number; max: number };
  Deslocamento: number;
  Iniciativa:   number;
}

export interface Merit {
  type:     SkillCardType;
  keyword:  string;
  title:    string;
  target?:  string;
  ds_cost?: string;
  dados?:   string;
  effect:   string;
}

export interface MindLink {
  digimonId: string | null;
  active:    boolean;
}

export interface SurvivorLoreBlock {
  text:    string;
  visible: boolean;
}

export interface Survivor {
  id:         string;
  name:       string;
  surname?:   string;
  age?:       string | number;
  height?:    number;
  birthday?:  string;
  sign?:      string;
  voice?:     string;
  tagline?:   string;
  portrait:   Portrait;
  image:      string | null;
  imageKey?:  string | null;
  attributes: SurvivorAttributes;
  status:     SurvivorStatus;
  skills:     SkillSet;
  survivorSkills: TamerSkill[];
  merits:     Merit[];
  mindLink:   MindLink;
  inventory:  InventoryItem[];
  lore?:      SurvivorLoreBlock[];
}

// ---------- Digimon Skill ----------

export interface DigimonSkill {
  type: SkillCardType;
  keyword: string;
  title: string;
  alcance?: string;
  custo?: string;
  dados?: string;
  meta?: string;
  effect: string;
  toggleBonus?: PassiveToggleBonus;
  alwaysOn?: AlwaysOnBonus;
}

// ---------- Affinity ----------

export interface Affinity {
  Fogo:        number;
  Vento:       number;
  Madeira:     number;
  Gelo:        number;
  Terra:       number;
  Luz:         number;
  Metal:       number;
  Trevas:      number;
  Água:        number;
  Trovão:      number;
  Físico:      number;
  Enfraquecer: number;
  Resistência: number;
  Cura:        number;
}

export const AFFINITY_KEYS = (Object.keys({
  Fogo:0,Água:0,Terra:0,Vento:0,
  Trovão:0,Gelo:0,Metal:0,Madeira:0,
  Luz:0,Trevas:0,
  Físico:0,Enfraquecer:0,Resistência:0,Cura:0,
}) as (keyof Affinity)[]);

// ---------- DigimonStage ----------

export interface DigimonStageStatus {
  HP:           number;
  Deslocamento: number;
  Iniciativa:   number;
  Defesa:       number;
  Armadura:     number;
  hpMaxBonus?:  number;  // delta de HP máximo definido pelo GM
}

export interface DigimonStage {
  stageName:  string;
  level:      string;
  type:       string;
  cost:       string;
  portrait:   Portrait;
  size:       number;
  speed:      number;
  status:     DigimonStageStatus;
  attributes: Attributes;
  weakness:   Record<string, string>;
  affinity:   Partial<Affinity>;
  skills:     DigimonSkill[];
  locked:     boolean;
  hidden?:    boolean;
  image?:     string | null;
  imageKey?:  string | null;
}

// ---------- DigimonLine ----------

export interface DigimonLine {
  id:           string;
  tamerId:      string | null;
  name:         string;
  sectors:      number[];
  lore?:        string;
  currentStage: number;
  image:        string | null;
  imageKey?:    string | null;
  stages:       DigimonStage[];
  line:         string;
}

// ---------- Tamer ----------

export interface TamerStatus {
  HP:           { v: number; max: number };
  Memory:       { v: number; max: number };
  Digisoul:     { v: number; max: number };
  Deslocamento: number;
  Autoridade:   number;
  Iniciativa:   number;
  hpMaxBonus?:       number;  // delta de HP máximo definido pelo GM
  digisoulMaxBonus?: number;  // delta de Digisoul máximo definido pelo GM
}

export interface Tamer {
  id:         string;
  name:       string;
  surname:    string;
  portrait:   Portrait;
  image:      string | null;
  imageKey?:  string | null;
  age:        number;
  height:     number;
  sign:       string;
  birthday:   string;
  voice:      string;
  tagline:    string;
  xp:         number;
  xpSpent:    number;
  status:     TamerStatus;
  attributes: Attributes;
  skills:     SkillSet;
  tamerSkills: TamerSkill[];
  inventory:   InventoryItem[];
  digimonId:  string | null;
}

// ---------- Bug ----------

export interface Bug {
  id:         string;
  name:       string;
  class:      string;
  color:      BugColor;
  sectors:    number[];
  lore:       string;
  image:      string | null;
  imageKey?:  string | null;
  status:     DigimonStageStatus;
  attributes: Attributes;
  weakness:   Record<string, string>;
  affinity:   Partial<Affinity>;
  skills:     DigimonSkill[];
}

// ---------- Stage (Teatro) ----------

export type ActorRef =
  | { kind: 'human';    id: string }
  | { kind: 'pair';     tamerId: string; digimonId: string; stage: number }
  | { kind: 'wild';     id: string }
  | { kind: 'bug';      id: string }
  | { kind: 'survivor'; id: string }
  | { kind: 'sign';     id: string };

export interface Stage {
  id:        string;
  title:     string;
  subtitle:  string;
  createdAt: number;
  sides:     { allies: ActorRef[]; enemies: ActorRef[] };
  notes:     string;
}

// ---------- Image export ----------

export interface ExportedImage {
  key:     string;
  type:    string;
  dataUrl: string;
}

export interface ExportPackage {
  version: number;
  state:   AppState;
  images:  ExportedImage[];
}

// ---------- AppState ----------

// Pasta de setor dinâmica (CRUD)
export interface SectorFolder {
  n:     number;    // número único do setor
  name:  string;
  bioma: string;
  color: Portrait;
}

// Pasta de BUG dinâmica (CRUD)
export interface BugFolder {
  cls:   string;    // ex: 'ledo'
  color: BugColor;  // cor da classe
}

export interface AppState {
  tamers:      Tamer[];
  survivors:   Survivor[];
  bestiary:    DigimonLine[];
  bugs:        Bug[];
  signs:       Sign[];
  stages:      Stage[];
  sectors:     SectorFolder[];
  bugFolders:  BugFolder[];
  skillTree:   SkillTreePhase[];
  // Extensões pelo GM
  customClimas:     ClimaEntry[];      // climas gerenciados pelo GM (vazio = usar padrões)
  customKeywords:   KeywordEntry[];    // keywords gerenciadas pelo GM (vazio = usar padrões)
  customConditions: ConditionEntry[];  // condições gerenciadas pelo GM (vazio = usar padrões)
  jogressConfigs:   JogressConfig[];   // configurações de Jogress adicionadas pelo GM
  tokenDefs:      TokenDef[];      // tokens definidos (aba Tokens da Goggle Girl)
  // Controle de visibilidade (GM only)
  visibility:  VisibilityMap;      // chave: 'tipo:id', valor: true = visível para players
}

// ---------- Sector ----------

export interface Sector {
  n:     number;
  name:  string;
  bioma: string;
  color: Portrait;
}

export const SECTORS: Sector[] = [
  { n: 1, name: 'Kuwaga',    bioma: 'Bosque',   color: 'sage'   },
  { n: 2, name: 'Sisters',   bioma: 'Pradaria', color: 'wheat'  },
  { n: 3, name: '—',         bioma: 'Castelo',  color: 'rose'   },
  { n: 4, name: 'Dark Area', bioma: '—',        color: 'indigo' },
  { n: 5, name: 'Heaven',    bioma: '—',        color: 'gold'   },
];

export const BUG_COLORS: BugColor[] = ['red','green','blue','white','purple','yellow'];

export const PORTRAIT_LIST: Portrait[] = [
  'sage','wheat','rose','indigo','gold','coral','orange','red','pink','green','blue','purple','teal','black',
];

// ---------- Clima (extensível pelo GM) ----------

export interface ClimaEntry {
  id:      string
  name:    string
  type:    'Natural' | 'Especial'
  color:   string   // CSS var name (ex: 'gold', 'blue')
  icon:    string   // emoji
  effects: { tag: string; desc: string; color: string }[]
  gm_only: boolean  // se true, só GM vê no seletor de clima do palco
}

// ---------- Keyword (extensível pelo GM) ----------

export interface KeywordEntry {
  id:       string
  keyword:  string
  desc:     string
  type:     'wound' | 'stack' | 'positive' | 'neg' | 'reaction' | 'neutral'
  resist?:  string
  category?: string
}

export interface ConditionEntry {
  id:       string
  name:     string
  category: string
  desc:     string
  type:     'wound' | 'stack' | 'positive' | 'neg' | 'reaction' | 'neutral'
  resist?:  string
  max?:     number   // cargas máximas no atalho do Palco (padrão 10)
  color?:   string   // cor no atalho do Palco (padrão 'coral')
}

// ---------- Jogress (extensível pelo GM) ----------

export interface JogressSkill {
  id:     string
  title:  string
  effect: string
}

export interface JogressGroup {
  id:     string
  domain: string           // ex: "Domain of Sky"
  skills: JogressSkill[]
}

export interface JogressConfig {
  id:           string
  name:         string    // nome do Domain fusionado, ex: "Domain of Time"
  memoryGroups: JogressGroup[]   // grupos de passivas de memória selecionáveis
  ownPassives:  JogressSkill[]   // passivas sempre ativas quando o Jogress está ativo
}

// ---------- Token definition (Goggle Girl aba Tokens) ----------

export interface TokenDef {
  id:         string
  name:       string
  level:      string   // ex: 'Lv.3', 'Lv.4', ou ''
  origin:     string   // ex: 'Sachi — Puppet Theater'
  hp:         number
  defesa:     number
  armadura:   number
  deslocamento: string // ex: 'Igual ao de Sachi', '5'
  type:       string   // ex: 'Digimon', 'Humano'
  attribute:  string   // ex: 'No Data'
  alcance:    string   // ex: 'Corpo a Corpo - 1 Metro'
  dados:      string   // ex: 'Expressão de Sachi + Físico de Black Tailmon'
  dano:       number
  securityAttack: number
  effect:     string
  autoConditions: { label: string; filled: number; max: number; color: string }[]
  visible:    boolean  // GM controla visibilidade para players
}

// ---------- Palco Log ----------

export interface PalcoLogEntry {
  id:        string
  timestamp: number
  kind:      'auto' | 'manual'   // auto = gerado pelo sistema; manual = escrito pelo GM
  text:      string
  round?:    number
}

// ---------- Visibility control ----------
// Chave: entidade + id (ex: 'stage:stage-abc123', 'bestiary:d-wild-xyz', 'skill_phase:stp-...')
// Valor: true = visível para players; false = oculto (só GM vê)
export type VisibilityMap = Record<string, boolean>

export interface Sign {
  id:         string;
  code:       string;   // ex: 'SIGN 01'
  name:       string;   // ex: 'Yahiro Saki'
  lore:       string;
  image:      string | null;
  imageKey?:  string | null;
  status:     DigimonStageStatus;
  attributes: Attributes;
  weakness:   Record<string, string>;
  affinity:   Partial<Affinity>;
  skills:     DigimonSkill[];
}

// ---------- Skill Tree (fase liberada pelo GM) ----------

export interface SkillTreePhase {
  id:                string;
  tamerId:           string;
  phaseNum:          number;
  label:             string;         // ex: 'Fase 2 — Laços de Sangue'
  unlocked:          boolean;        // GM define
  skillsAvailable:   TamerSkill[];   // skills que o player ainda pode comprar
  skillsAcquired:    TamerSkill[];   // skills já compradas (histórico)
}

// ---------- AppState (atualizado) ----------
// Re-exportado abaixo — AppState já está definido acima, só adicionamos os campos novos.