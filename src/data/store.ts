// =============================================================================
// store.ts — Digimon Survive Companion App
// Campanha: A Midnight Summer's Dream
// Versão definitiva — dados reais dos Player Characters
// =============================================================================

import {
  AppState, Tamer, DigimonLine, DigimonStage,
  Attributes, SkillSet, TamerSkill, DigimonSkill,
  Bug, Stage, Sign, SkillTreePhase, ExportedImage, ExportPackage,
  SectorFolder, BugFolder, TokenDef,
  DEFAULT_SKILL_SET,
} from '../types';
import { idbLoad, idbLoadImage, idbListImageKeys, idbSave, idbSaveImage } from './persistence';
export { idbLoadImage, idbListImageKeys, idbSaveImage } from './persistence';
import { DIGIMON_DEFAULT_IMAGES, TAMER_DEFAULT_IMAGES } from './images';
export { DIGIMON_DEFAULT_IMAGES, TAMER_DEFAULT_IMAGES } from './images';
import { DEFAULT_SURVIVORS } from './domain';

// ─────────────────────────────────────────────────────────────────────────────
// Persistência — localStorage + IndexedDB (fallback duplo)
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'digimon_survive';


// Coleta imagens do estado para incluir no pacote de export
async function collectImagesForExport(_s: AppState): Promise<ExportedImage[]> {
  const images: ExportedImage[] = [];
  const keys = await idbListImageKeys();
  for (const key of keys) {
    const dataUrl = await idbLoadImage(key);
    if (dataUrl) images.push({ key, type: 'image/webp', dataUrl });
  }
  return images;
}

// Garante que entidades com image mas sem imageKey recebam um imageKey
export function attachExportImageKeys(s: AppState): AppState {
  const stamp = (id: string, img: string | null, key?: string | null) =>
    img && !key ? `img-${id}-${Date.now()}` : key ?? null;
  return {
    ...s,
    tamers:    s.tamers.map(t    => ({ ...t, imageKey: stamp(t.id,  t.image,  t.imageKey)  })),
    survivors: (s.survivors ?? []).map(sv => ({ ...sv, imageKey: stamp(sv.id, sv.image ?? null, sv.imageKey) })),
    bestiary:  s.bestiary.map(d  => ({ ...d, imageKey: stamp(d.id,  d.image,  d.imageKey)  })),
    bugs:      s.bugs.map(b      => ({ ...b, imageKey: stamp(b.id,  b.image,  b.imageKey)  })),
  };
}

export async function exportStateToFile(s: AppState): Promise<void> {
  const withKeys = attachExportImageKeys(s);
  const images   = await collectImagesForExport(withKeys);
  // Estado exportado sem data URLs inline (imagens ficam no array images)
  const stateClean: AppState = {
    ...withKeys,
    tamers:   withKeys.tamers.map(t   => ({ ...t,   image: null })),
    bestiary: withKeys.bestiary.map(d => ({ ...d,   image: null })),
    bugs:     withKeys.bugs.map(b     => ({ ...b,   image: null })),
  };
  const pkg: ExportPackage = { version: 1, state: stateClean, images };
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `midnight-summer-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importStateFromFile(): Promise<AppState | null> {
  return new Promise(resolve => {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          // Detectar pacote com imagens (ExportPackage) vs estado simples
          if (parsed.version && parsed.images && parsed.state) {
            const pkg = parsed as ExportPackage;
            // Gravar imagens no IDB
            for (const img of pkg.images) {
              await idbSaveImage(img.key, img.dataUrl);
            }
            // Hidratar image a partir de imageKey
            const hydrate = async <T extends { image: string | null; imageKey?: string | null }>(item: T): Promise<T> => {
              if (item.imageKey) {
                const dataUrl = await idbLoadImage(item.imageKey);
                return { ...item, image: dataUrl };
              }
              return item;
            };
            const state: AppState = {
              ...pkg.state,
              tamers:   await Promise.all(pkg.state.tamers.map(hydrate)),
              bestiary: await Promise.all(pkg.state.bestiary.map(hydrate)),
              bugs:     await Promise.all(pkg.state.bugs.map(hydrate)),
            };
            resolve(state);
          } else {
            // Backup antigo sem imagens
            resolve(parsed as AppState);
          }
        } catch { resolve(null); }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

// Mescla o estado salvo com os defaults do código.
// Garante que campos novos (como toggleBonus) adicionados ao código
// sejam sempre propagados para dados carregados do localStorage.
function mergeWithDefaults(saved: AppState, defaults: AppState): AppState {
  // IDs que existem no código mas não no estado salvo — sempre injetar
  const savedBugIds = new Set(saved.bugs?.map(b => b.id) ?? []);

  // Migration: se um tamer chamado Yahiro existir no saved, converte para Survivor
  let savedSurvivors = saved.survivors ?? [];
  let savedTamers    = saved.tamers    ?? [];
  if (!savedSurvivors.some(sv => sv.name.toLowerCase().includes('yahiro'))) {
    const yahiroTamer = savedTamers.find(t => t.name.toLowerCase().includes('yahiro'));
    if (yahiroTamer) {
      const sv = defaults.survivors.find(s => s.name.toLowerCase().includes('yahiro'));
      const converted = {
        ...(sv ?? defaults.survivors[0]),
        id:       yahiroTamer.id.startsWith('t-') ? yahiroTamer.id.replace('t-', 'sv-') : `sv-${yahiroTamer.id}`,
        name:     yahiroTamer.name,
        surname:  yahiroTamer.surname,
        portrait: yahiroTamer.portrait,
        image:    yahiroTamer.image ?? null,
        imageKey: yahiroTamer.imageKey ?? null,
      };
      savedSurvivors = [...savedSurvivors, converted];
      savedTamers    = savedTamers.filter(t => t.id !== yahiroTamer.id);
    }
  }

  // Survivors: preserva totalmente (sem código-fixo de merits), injeta defaults que faltem
  const survivorIds = new Set(savedSurvivors.map(sv => sv.id));
  const survivors = [
    ...savedSurvivors,
    ...defaults.survivors.filter(sv => !survivorIds.has(sv.id)),
  ];

  return {
    ...saved,
    survivors,
    stages:         saved.stages         ?? [],
    sectors:        saved.sectors        ?? defaults.sectors,
    bugFolders:     saved.bugFolders     ?? defaults.bugFolders,
    signs:          saved.signs          ?? defaults.signs,
    skillTree:      saved.skillTree      ?? defaults.skillTree,
    customClimas:     saved.customClimas     ?? [],
    customKeywords:   saved.customKeywords   ?? [],
    customConditions: saved.customConditions ?? [],
    jogressConfigs:   saved.jogressConfigs   ?? [],
    tokenDefs:      saved.tokenDefs      ?? [],
    visibility:     saved.visibility     ?? {},

    // Tamers: preserva dados de runtime, sempre usa tamerSkills do código
    tamers: defaults.tamers.map(defaultTamer => {
      const savedTamer = saved.tamers?.find(t => t.id === defaultTamer.id);
      if (!savedTamer) return defaultTamer;
      const merged = { ...savedTamer, tamerSkills: defaultTamer.tamerSkills };
      // Migration: corrige Vigor do Mori (foi importado como 2, correto é 4) e HP.max derivado
      if (merged.id === 't-mori' && (merged.attributes.Vigor < 4 || merged.status.HP.max < 9)) {
        const fixedAttrs = { ...merged.attributes, Vigor: 4 };
        const newHPMax = 9; // Vigor(4) + size(5)
        const hpDiff = newHPMax - (merged.status.HP.max ?? 7);
        return {
          ...merged,
          attributes: fixedAttrs,
          status: {
            ...merged.status,
            HP: { v: Math.min(merged.status.HP.v + hpDiff, newHPMax), max: newHPMax },
          },
        };
      }
      return merged;
    }),

    // Bestiary: preserva linhas salvas com skills do código + injeta novas linhas do código
    bestiary: [
      // Linhas que já existem no saved — preservar status/atributos, reinjetar skills
      ...defaults.bestiary.map(defaultLine => {
        const savedLine = saved.bestiary?.find(l => l.id === defaultLine.id);
        if (!savedLine) return defaultLine;
        const mergedLine = {
          ...savedLine,
          stages: defaultLine.stages.map((defStage, si) => {
            const savedStage = savedLine.stages[si];
            if (!savedStage) return defStage;
            return { ...savedStage, skills: defStage.skills };
          }),
        };
        // Migration: corrige HP e atributos Kudamon/Reppamon após correção do Vigor do Mori
        if (mergedLine.id === 'd-kudamon-line') {
          return {
            ...mergedLine,
            stages: mergedLine.stages.map((s, i) => {
              let st = s;
              if (i === 1 && st.status.HP === 12) st = { ...st, status: { ...st.status, HP: 14 } };
              if (i === 2 && st.status.HP === 17) st = { ...st, status: { ...st.status, HP: 19 } };
              if (!st.locked && st.attributes.Vigor < 4) st = { ...st, attributes: { ...st.attributes, Vigor: 4 } };
              return st;
            }),
          };
        }
        return mergedLine;
      }),
      // Linhas do saved que não existem no código (adicionadas pelo usuário via UI)
      ...(saved.bestiary?.filter(d => !defaults.bestiary.some(dd => dd.id === d.id)) ?? []),
    ],

    // Bugs: preserva bugs salvos + injeta novos bugs do código que não existam no saved
    bugs: [
      // Bugs salvos — preservar integralmente (editados pelo usuário)
      ...(saved.bugs ?? []),
      // Bugs do código que ainda não existem no saved
      ...defaults.bugs.filter(b => !savedBugIds.has(b.id)),
    ],
  };
}

// Aplica migrações de dados em um estado carregado do banco ou localStorage.
// Chamado tanto no fluxo local (mergeWithDefaults) quanto no remoto (loadStateFromDB).
export function runMigrations(s: AppState): AppState {
  // Migration: corrige Vigor do Mori e HP.max derivado
  const tamers = s.tamers.map(t => {
    if (t.id === 't-mori' && (t.attributes.Vigor < 4 || t.status.HP.max < 9)) {
      const fixedAttrs = { ...t.attributes, Vigor: 4 };
      const newHPMax = 9; // Vigor(4) + size(5)
      const hpDiff = newHPMax - (t.status.HP.max ?? 7);
      return {
        ...t,
        attributes: fixedAttrs,
        status: {
          ...t.status,
          HP: { v: Math.min(t.status.HP.v + hpDiff, newHPMax), max: newHPMax },
        },
      };
    }
    return t;
  });

  // Migration: corrige HP e atributos Kudamon/Reppamon após correção do Vigor do Mori
  const bestiary = s.bestiary.map(line => {
    if (line.id === 'd-kudamon-line') {
      return {
        ...line,
        stages: line.stages.map((st, i) => {
          let stage = st;
          if (i === 1 && stage.status.HP === 12) stage = { ...stage, status: { ...stage.status, HP: 14 } };
          if (i === 2 && stage.status.HP === 17) stage = { ...stage, status: { ...stage.status, HP: 19 } };
          if (!stage.locked && stage.attributes.Vigor < 4) stage = { ...stage, attributes: { ...stage.attributes, Vigor: 4 } };
          return stage;
        }),
      };
    }
    return line;
  });

  if (tamers === s.tamers && bestiary === s.bestiary) return s;
  return { ...s, tamers, bestiary };
}

function applyDefaultImages(s: AppState): AppState {
  return {
    ...s,
    tamers: s.tamers.map(t =>
      (!t.image && !t.imageKey && TAMER_DEFAULT_IMAGES[t.id])
        ? { ...t, image: TAMER_DEFAULT_IMAGES[t.id] }
        : t
    ),
    bestiary: s.bestiary.map(d => {
      if (d.image || d.imageKey) return d;
      const key = `${d.id}:${d.currentStage}`;
      return DIGIMON_DEFAULT_IMAGES[key]
        ? { ...d, image: DIGIMON_DEFAULT_IMAGES[key] }
        : d;
    }),
  };
}

export function loadState(): AppState {
  const defaults = buildDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as AppState;
      return applyDefaultImages(mergeWithDefaults(saved, defaults));
    }
  } catch { /* corrompido — tenta IndexedDB de forma assíncrona abaixo */ }
  return applyDefaultImages(defaults);
}

// Hidrata imagens de volta do IDB para o estado carregado
// Se o tamer não tiver imagem salva, usa a imagem default de /tamers/
async function hydrateImages(s: AppState): Promise<AppState> {
  const hydrateFn = async <T extends { image: string | null; imageKey?: string | null }>(item: T): Promise<T> => {
    if (item.imageKey) {
      const dataUrl = await idbLoadImage(item.imageKey);
      if (dataUrl) return { ...item, image: dataUrl };
    }
    return item;
  };
  const hydrateTamer = async (t: typeof s.tamers[0]) => {
    // Prioridade: imagem salva pelo usuário no IDB > imagem default estática
    if (t.imageKey) {
      const dataUrl = await idbLoadImage(t.imageKey);
      if (dataUrl) return { ...t, image: dataUrl };
    }
    // Sem imagem personalizada — usar default se disponível
    if (!t.image && TAMER_DEFAULT_IMAGES[t.id]) {
      return { ...t, image: TAMER_DEFAULT_IMAGES[t.id] };
    }
    return t;
  };
  const hydrateDigimon = async (d: typeof s.bestiary[0]) => {
    // Hidratar imagem da line
    let result = d;
    if (d.imageKey) {
      const dataUrl = await idbLoadImage(d.imageKey);
      if (dataUrl) result = { ...result, image: dataUrl };
    }
    if (!result.image && !result.imageKey) {
      const key = `${d.id}:${d.currentStage}`;
      if (DIGIMON_DEFAULT_IMAGES[key]) result = { ...result, image: DIGIMON_DEFAULT_IMAGES[key] };
    }
    // Hidratar imagens de cada estágio individualmente
    const hydratedStages = await Promise.all(result.stages.map(async (stage, _i) => {
      if (stage.imageKey) {
        const dataUrl = await idbLoadImage(stage.imageKey);
        if (dataUrl) return { ...stage, image: dataUrl };
      }
      return stage;
    }));
    return { ...result, stages: hydratedStages };
  };

  return {
    ...s,
    tamers:    await Promise.all(s.tamers.map(hydrateTamer)),
    survivors: await Promise.all((s.survivors ?? []).map(hydrateFn)),
    bestiary:  await Promise.all(s.bestiary.map(hydrateDigimon)),
    bugs:      await Promise.all(s.bugs.map(hydrateFn)),
    signs:     await Promise.all((s.signs ?? []).map(hydrateFn)),
  };
}

// Versão assíncrona: tenta localStorage primeiro, depois IndexedDB como fallback
// e hidrata imagens do IDB
export async function loadStateAsync(): Promise<AppState> {
  const defaults = buildDefaultState();
  let merged: AppState | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as AppState;
      merged = mergeWithDefaults(saved, defaults);
    }
  } catch { /* localStorage falhou */ }
  if (!merged) {
    const idb = await idbLoad();
    if (idb) merged = mergeWithDefaults(idb, defaults);
  }
  if (!merged) return defaults;
  // Hidratar imagens do IDB
  return hydrateImages(merged);
}

export function saveState(s: AppState): void {
  // Salva estado leve (sem data URLs inline) em localStorage e IDB
  const slim: AppState = {
    ...s,
    tamers:   s.tamers.map(t   => ({ ...t, image: null })),
    bestiary: s.bestiary.map(d => ({
      ...d, image: null,
      stages: d.stages.map(st => ({ ...st, image: null })),
    })),
    bugs:     s.bugs.map(b     => ({ ...b, image: null })),
    signs:    (s.signs ?? []).map(sg => ({ ...sg, image: null })),
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slim)); } catch { /* cheio ou bloqueado */ }
  idbSave(slim); // assíncrono, não bloqueia
}

export function resetState(): AppState {
  localStorage.removeItem(STORAGE_KEY);
  idbSave(buildDefaultState());
  return buildDefaultState();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de busca
// ─────────────────────────────────────────────────────────────────────────────

export function findTamer(s: AppState, id: string): Tamer | undefined {
  return s.tamers.find(t => t.id === id);
}

export function findDigimon(s: AppState, id: string): DigimonLine | undefined {
  return s.bestiary.find(d => d.id === id);
}

export function findBug(s: AppState, id: string): Bug | undefined {
  return s.bugs.find(b => b.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculos Derivados
// ─────────────────────────────────────────────────────────────────────────────

export function calcTamerDerived(attrs: Attributes, size = 5, speed = 5) {
  return {
    HP:           attrs.Vigor + size,
    Digisoul:     attrs.Perseverança + attrs.Autocontrole,
    Iniciativa:   attrs.Destreza + attrs.Autocontrole + 1,
    Deslocamento: attrs.Força + attrs.Destreza + speed,
  };
}

export function calcDigimonDerived(
  attrs: Attributes,
  size = 3,
  speed = 5,
  evolutionBonus = 0,
  tamerHP?: number,
  level = 'Child (Lvl 3)',
) {
  // HP por estágio relativo ao HP do tamer:
  // Lvl3 = tamer+5 | Armor = Lvl3+3 = tamer+8 | Adult = Lvl3+5 = tamer+10
  // Perfect = Adult+5 = tamer+15 | Ultimate = Perfect+5 = tamer+20
  // Sem tamer vinculado: Vigor + size (selvagens/bugs)
  const hpBonus = level.startsWith('Armor')    ? 8
    : level.startsWith('Adult')                ? 10
    : level.startsWith('Perfect')              ? 15
    : level.startsWith('Ultimate')             ? 20
    : 5;
  const HP = tamerHP != null ? tamerHP + hpBonus : attrs.Vigor + size;
  return {
    HP,
    Defesa:       Math.min(attrs.Destreza, attrs.Raciocínio) + evolutionBonus,
    Iniciativa:   attrs.Destreza + attrs.Autocontrole + 1,
    Deslocamento: attrs.Força + attrs.Destreza + speed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Custos de XP
// ─────────────────────────────────────────────────────────────────────────────

export function xpCostAttribute(newLevel: number): number { return newLevel * 5; }
export function xpCostSkill(newLevel: number): number     { return newLevel * 3; }

export type XpResult<T> =
  | { ok: true;  data: T;      spent: number }
  | { ok: false; reason: string };

export function buyTamerAttribute(tamer: Tamer, attr: keyof Attributes): XpResult<Tamer> {
  const cur  = tamer.attributes[attr];
  const next = cur + 1;
  if (next > 5) return { ok: false, reason: 'Limite máximo (5) atingido.' };
  const cost = xpCostAttribute(next);
  if (tamer.xp < cost) return { ok: false, reason: `XP insuficiente (precisa ${cost}, tem ${tamer.xp}).` };
  return {
    ok: true, spent: cost,
    data: {
      ...tamer,
      xp: tamer.xp - cost,
      xpSpent: tamer.xpSpent + cost,
      attributes: { ...tamer.attributes, [attr]: next },
    },
  };
}

export function buyTamerSkill(
  tamer: Tamer,
  category: keyof SkillSet,
  skillName: string,
): XpResult<Tamer> {
  const cur  = tamer.skills[category][skillName] ?? 0;
  const next = cur + 1;
  if (next > 5) return { ok: false, reason: 'Limite máximo (5) atingido.' };
  const cost = xpCostSkill(next);
  if (tamer.xp < cost) return { ok: false, reason: `XP insuficiente (precisa ${cost}, tem ${tamer.xp}).` };
  return {
    ok: true, spent: cost,
    data: {
      ...tamer,
      xp: tamer.xp - cost,
      xpSpent: tamer.xpSpent + cost,
      skills: {
        ...tamer.skills,
        [category]: { ...tamer.skills[category], [skillName]: next },
      },
    },
  };
}

export function buyDigimonAttribute(
  tamer: Tamer,
  line: DigimonLine,
  stageIdx: number,
  attr: keyof Attributes,
): XpResult<{ tamer: Tamer; line: DigimonLine }> {
  const stage = line.stages[stageIdx];
  if (!stage) return { ok: false, reason: 'Estágio não encontrado.' };
  const cur  = stage.attributes[attr];
  const next = cur + 1;
  if (next > 5) return { ok: false, reason: 'Limite máximo (5) atingido.' };
  const cost = xpCostAttribute(next);
  if (tamer.xp < cost) return { ok: false, reason: `XP insuficiente (precisa ${cost}, tem ${tamer.xp}).` };
  const newStages = line.stages.map((s, i) =>
    i === stageIdx ? { ...s, attributes: { ...s.attributes, [attr]: next } } : s,
  );
  return {
    ok: true, spent: cost,
    data: {
      tamer: { ...tamer, xp: tamer.xp - cost, xpSpent: tamer.xpSpent + cost },
      line:  { ...line, stages: newStages },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

export function makeDefaultAttributes(): Attributes {
  return {
    Inteligência: 2, Força: 2, Presença: 2,
    Raciocínio: 2, Destreza: 2, Manipulação: 2,
    Perseverança: 2, Vigor: 2, Autocontrole: 2,
  };
}

export function makeEmptyStage(
  stageName: string,
  level: string,
  cost: string,
  locked = false,
): DigimonStage {
  return {
    stageName, level, cost, locked,
    type: '???', portrait: 'sage',
    size: 3, speed: 5,
    status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
    attributes: makeDefaultAttributes(),
    weakness: {}, affinity: {}, skills: [],
  };
}

export function makeTamer(
  id: string, name: string, surname: string,
  portrait: Tamer['portrait'],
  age: number, height: number, sign: string,
  digimonId: string | null,
): Tamer {
  const attrs = makeDefaultAttributes();
  const d = calcTamerDerived(attrs);
  return {
    id, name, surname, portrait, image: null,
    age, height, sign,
    birthday: '—', voice: '—', tagline: '—',
    xp: 0, xpSpent: 0,
    status: {
      HP:       { v: d.HP,       max: d.HP },
      Memory:   { v: 3,          max: 10 },
      Digisoul: { v: d.Digisoul, max: d.Digisoul },
      Deslocamento: d.Deslocamento,
      Autoridade:   2,
      Iniciativa:   d.Iniciativa,
    },
    attributes: attrs,
    skills: JSON.parse(JSON.stringify(DEFAULT_SKILL_SET)),
    tamerSkills: [],
    inventory:   [],
    digimonId,
  };
}

export function makeSlimLine(
  id: string, tamerId: string, name: string,
  portrait: DigimonStage['portrait'], type: string,
): DigimonLine {
  const attrs = makeDefaultAttributes();
  const baby  = makeEmptyStage('???',    'In-Training (Lvl 2)', '0',    false);
  const child = makeEmptyStage('???',    'Child (Lvl 3)',       '0',    false);
  const adult = makeEmptyStage('???',    'Adult (Lvl 4)',       '—',    true);
  const perf  = makeEmptyStage('???',    'Perfect (Lvl 5)',     '—',    true);
  const ulti  = makeEmptyStage('???',    'Ultimate (Lvl 6)',    '—',    true);
  child.portrait = portrait; child.type = type; child.attributes = { ...attrs };
  return {
    id, tamerId, name, image: null,
    sectors: [], currentStage: 1,
    line: '??? ↔ ??? ↔ ??? ↔ ??? ↔ ???',
    stages: [baby, child, adult, perf, ulti],
  };
}

export function makeWildDigimon(
  id: string, name: string, level: string, type: string,
  portrait: DigimonStage['portrait'], sectors: number[], lore?: string,
): DigimonLine {
  const stage = makeEmptyStage(name, level, '—', false);
  stage.portrait = portrait; stage.type = type;
  return {
    id, tamerId: null, name, image: null,
    sectors, lore, currentStage: 0,
    line: name,
    stages: [stage],
  };
}

export function makeBug(
  id: string, name: string, cls: string,
  color: Bug['color'], sectors: number[], lore: string,
): Bug {
  return {
    id, name, class: cls, color, sectors, lore, image: null,
    status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
    attributes: makeDefaultAttributes(),
    weakness: {}, affinity: {}, skills: [],
  };
}

export function makeSign(id: string, code: string, name: string): Sign {
  return {
    id, code, name,
    lore: '',
    image: null,
    status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
    attributes: makeDefaultAttributes(),
    weakness: {}, affinity: {}, skills: [],
  };
}

export function makeStage(id: string): Stage {
  return {
    id, title: 'Novo Palco', subtitle: '',
    createdAt: Date.now(),
    sides: { allies: [], enemies: [] },
    notes: '',
  };
}

export const DEFAULT_TOKEN_DEFS: TokenDef[] = [
  {
    id: 'token-silhouette', name: 'Silhouette Token', level: '', visible: true,
    origin: 'Hibito — Soul Ablaze / Twilight Memories',
    hp: 1, defesa: 0, armadura: 0, deslocamento: 'Igual ao de Hibito',
    type: 'Digimon', attribute: 'No Data',
    alcance: 'Corpo a Corpo - 1 Metro',
    dados: 'Perseverança de Hare + Fogo de Ghostmon', dano: 6, securityAttack: 0,
    effect: '[Jamming], [Blocker].',
    autoConditions: [
      { label: 'Blocker', filled: 1, max: 1, color: 'teal' },
      { label: 'Jamming', filled: 1, max: 1, color: 'indigo' },
    ],
  },
  {
    id: 'token-puppet', name: 'Puppet Token', level: 'Lv.3', visible: true,
    origin: 'Sachi — Puppet Theater',
    hp: 1, defesa: 1, armadura: 0, deslocamento: 'Igual ao de Sachi',
    type: 'Digimon', attribute: 'No Data',
    alcance: 'Corpo a Corpo - 1 Metro',
    dados: 'Expressão de Sachi + Físico de Black Tailmon', dano: 1, securityAttack: 1,
    effect: 'Ao ser invocado, imediatamente faça uma ação de movimento e ataque um alvo válido. Deletado no início do próximo turno de Sachi.',
    autoConditions: [],
  },
  {
    id: 'token-enhanced-puppet', name: 'Enhanced Puppet Token', level: 'Lv.4', visible: true,
    origin: 'Sachi — Catharsis',
    hp: 3, defesa: 3, armadura: 0, deslocamento: 'Igual ao de Sachi +3',
    type: 'Digimon', attribute: 'No Data',
    alcance: 'Corpo a Corpo - 3 Metros',
    dados: 'Expressão de Sachi + Físico de Black Tailmon + 3d10', dano: 3, securityAttack: 2,
    effect: 'Ao ser invocado, imediatamente faça uma ação de movimento e ataque um alvo válido. Deletado no início do próximo turno de Sachi.',
    autoConditions: [],
  },
]

// ── Helpers de visibilidade ────────────────────────────────────────────────────
// Chave: 'tipo:id', ex: 'stage:stage-abc', 'bestiary:d-wild-xyz'

export function visKey(type: string, id: string): string {
  return `${type}:${id}`
}

export function getVisLevel(
  state: AppState,
  type: string,
  id: string,
): import('../types').VisibilityLevel {
  const key = visKey(type, id)
  if (!(key in state.visibility)) {
    return type === 'stage' ? 'full' : 'hidden'
  }
  const raw = state.visibility[key] as any
  // Migrate old boolean values
  if (raw === true)  return 'full'
  if (raw === false) return 'hidden'
  return raw as import('../types').VisibilityLevel
}

export function isVisible(
  state: AppState,
  type: string,
  id: string,
  isGM: boolean,
): boolean {
  if (isGM) return true
  return getVisLevel(state, type, id) !== 'hidden'
}

export function setVisibility(
  state: AppState,
  type: string,
  id: string,
  level: import('../types').VisibilityLevel,
): AppState {
  return {
    ...state,
    visibility: { ...state.visibility, [visKey(type, id)]: level },
  }
}

export function makeSkillTreePhase(
  tamerId: string,
  phaseNum: number,
  label: string,
): SkillTreePhase {
  return {
    id: `stp-${tamerId}-${phaseNum}-${Date.now().toString(36)}`,
    tamerId,
    phaseNum,
    label,
    unlocked: false,
    skillsAvailable: [],
    skillsAcquired: [],
  };
}

// Compra uma skill da Skill Tree (local — sem backend).
// Move a skill de skillsAvailable → skillsAcquired e subtrai 3 XP do tamer.
export function buySkillTreeSkill(
  state: AppState,
  phaseId: string,
  skillIndex: number,
): AppState | { error: string } {
  const phase = state.skillTree.find(p => p.id === phaseId);
  if (!phase) return { error: 'Fase não encontrada.' };
  if (!phase.unlocked) return { error: 'Fase ainda não desbloqueada.' };
  const skill = phase.skillsAvailable[skillIndex];
  if (!skill) return { error: 'Skill não encontrada.' };
  const tamer = state.tamers.find(t => t.id === phase.tamerId);
  if (!tamer) return { error: 'Tamer não encontrado.' };
  if (tamer.xp < 3) return { error: 'XP insuficiente (precisa 3).' };

  const newPhase: SkillTreePhase = {
    ...phase,
    skillsAvailable: phase.skillsAvailable.filter((_, i) => i !== skillIndex),
    skillsAcquired:  [...phase.skillsAcquired, skill],
  };
  const xpEntry = { id: `xp-${Date.now().toString(36)}`, ts: Date.now(), label: `Skill Tree: ${skill.title}`, cost: -3 };
  const newTamer: Tamer = {
    ...tamer,
    xp: tamer.xp - 3,
    xpSpent: tamer.xpSpent + 3,
    tamerSkills: [...tamer.tamerSkills, skill],
    xpLog: [xpEntry, ...(tamer.xpLog ?? [])].slice(0, 50),
  };
  return {
    ...state,
    skillTree: state.skillTree.map(p => p.id === phaseId ? newPhase : p),
    tamers:    state.tamers.map(t => t.id === tamer.id ? newTamer : t),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Import de texto (bestiário)
// ─────────────────────────────────────────────────────────────────────────────

export function parseBestiaryText(_text: string): { lines: DigimonLine[]; bugs: Bug[] } {
  // Parser simplificado — extensível futuramente
  return { lines: [], bugs: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending XP (staging)
// ─────────────────────────────────────────────────────────────────────────────

export function pendingCost(
  pending: Record<string, number>,
  current: Attributes,
): number {
  let total = 0;
  for (const [key, delta] of Object.entries(pending)) {
    const base = (current as unknown as Record<string, number>)[key] ?? 0;
    for (let i = 1; i <= delta; i++) total += xpCostAttribute(base + i);
  }
  return total;
}

export function pendingSkillCost(
  pending: Record<string, number>,
  current: Record<string, number>,
): number {
  let total = 0;
  for (const [key, delta] of Object.entries(pending)) {
    const base = current[key] ?? 0;
    for (let i = 1; i <= delta; i++) total += xpCostSkill(base + i);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDefaultState — Estado inicial da campanha
// ─────────────────────────────────────────────────────────────────────────────

export function buildDefaultState(): AppState {

  // ── Atributos compartilhados (Digimon herda os mesmos do Tamer) ─────────────
  // Os atributos dos digimons parceiros são SEMPRE iguais aos do tamer.
  // Os valores abaixo são as referências; atualizá-los no tamer basta.

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  NAOKI MOCHIZUKI  —  coral                                  ║
  // ╚══════════════════════════════════════════════════════════════╝

  const naokiAttrs: Attributes = {
    Inteligência: 2, Força: 5, Presença: 4,
    Raciocínio: 2,  Destreza: 5, Manipulação: 2,
    Perseverança: 3, Vigor: 3,  Autocontrole: 2,
  };
  // HP = 3+5 = 8 | Digisoul = 3+2 = 5 | Def = min(5,2)=2 | Inic = 5+2+1=8 | Desloc = 5+5+5=15
  const naoki: Tamer = {
    id: 't-naoki',
    name: 'NAOKI', surname: 'Mochizuki',
    portrait: 'coral', image: null,
    age: 17, height: 192,
    sign: 'Capricórnio', birthday: '25 de Dezembro de 2004',
    voice: 'Yuuki Ono',
    tagline: 'Minha alma ruge.',
    xp: 6, xpSpent: 0,
    status: {
      HP:       { v: 8,  max: 8  },
      Memory:   { v: 3,  max: 10 },
      Digisoul: { v: 5,  max: 5  },
      Deslocamento: 15,
      Autoridade:   2,
      Iniciativa:   8,
    },
    attributes: naokiAttrs,
    skills: {
      Mental: { Investigação: 2, Construção: 2, 'E.G.': 0, 'P.S.': 0, Folclore: 0, Ciência: 0, Notívago: 2 },
      Físico: { Briga: 4, Atletismo: 3, Sobrevivência: 2, Furtividade: 0, Culinária: 0, Limpeza: 0, Esquiva: 4 },
      Social: { Intimidação: 3, Persuasão: 2, Socializar: 0, Expressão: 2, Empatia: 2, Subterfúgio: 0, Sorte: 1 },
    },
    tamerSkills: [
      {
        type: 'action', keyword: 'Charge', title: 'COMIGO, TINK!',
        target: 'Naoki', custo: 'Nenhum',
        effect: 'Caso a Memory de Naoki seja 2 ou menos, aumente-a para 3.',
      },
      {
        type: 'action', keyword: 'His Rules', title: 'TRACE: ON!',
        target: 'Naoki ou 1 Aliado humano', custo: '-2 Memory',
        effect: 'Ataques que o alvo fizer não irão ativar o efeito de passivas com [Digital Body] no nome, esse efeito dura 3 rounds. Caso o alvo tenha sido Naoki, durante sua próxima ação apenas, um ataque dele ganhará [Blitz].',
      },
      {
        type: 'action', keyword: 'Mark of Aggression', title: 'EU NÃO VOU ME CURVAR!',
        target: '1 Inimigo', custo: '-2 Memory',
        effect: 'Quando Naoki acerta um ataque no inimigo, essa Skill ganha [Blitz]. Marca um inimigo; o inimigo marcado receberá +2 de dano de ataques físicos, a marca dura 3 Rounds.',
      },
      {
        type: 'action', keyword: 'Aggressive Beat', title: 'ESSE É O NOSSO CONTRA ATAQUE!',
        target: 'Naoki ou 1 Aliado', custo: '-2 Memory',
        effect: 'Dá +1 sucesso para as rolagens de ataque do alvo. Caso o alvo tenha sofrido dano no Round anterior, aumenta em +1 o número de sucessos.',
      },
      {
        type: 'action', keyword: 'Burn, My Soul', title: 'QUEIME, MINH\'ALMA!',
        target: 'Naoki ou 1 Digimon Aliado', custo: '-1 Memory',
        effect: '[Security Attack +1]. Esse efeito dura 3 Rounds. Caso o alvo seja Naoki, dura 5 Rounds.',
      },
      {
        type: 'passive', keyword: 'Raging Soul', title: 'MINHA ALMA RUGE',
        effect: 'Caso o HP atual de Tinkermon ou Naoki seja 50% ou menos de seu MAXHP, aumenta os dados das rolagens de ataque de Tinkermon e suas evoluções em +2.',
      },
      {
        type: 'passive', keyword: 'Instinct', title: 'CHEGA PRA LÁ!',
        effect: 'Libera [Counter] como uma reação para Naoki.',
      },
      {
        type: 'passive', keyword: 'Digisoul of Bravery', title: 'Ruja comigo, TINK!',
        effect: 'Durante o seu turno, caso Naoki tenha causado dano em um inimigo, a ação de digievoluir Tinkermon tem [Blitz] e seu custo é reduzido em -1.',
      },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-tinkermon-line',
  };

  // ── Tinkermon Line ──────────────────────────────────────────────────────────
  // HP Tinkermon = HP do tamer + 5 = 13 | Desloc = Força+Destreza+speed
  // speed de Tinkermon: voa, speed base igual ao humano (5)
  // HP Witchmon = 13 + 5 = 18 (confirmado na ficha) | Desloc 11 (fixo na ficha)

  const tinkermonLine: DigimonLine = {
    id: 'd-tinkermon-line',
    tamerId: 't-naoki',
    name: 'Tinkermon Line',
    sectors: [], image: null,
    currentStage: 1, // 0=???(Baby), 1=Tinkermon(Child), 2=Witchmon(Adult), 3=???, 4=???
    line: '??? ↔ Tinkermon (Child) / Armor ↔ Witchmon ↔ ??? ↔ ???',
    stages: [
      // 0 — Baby (bloqueado)
      {
        stageName: '???', level: 'In-Training (Lvl 2)', cost: '0',
        type: '???', portrait: 'pink', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...naokiAttrs },
        weakness: {}, affinity: {}, skills: [],
      },
      // 1 — Tinkermon (Child)
      {
        stageName: 'Tinkermon', level: 'Child (Lvl 3)', cost: '0',
        type: 'Fairy', portrait: 'pink', size: 3, speed: 5, locked: false,
        status: {
          HP: 13,   // HP tamer (8) + 5
          Deslocamento: 15,
          Iniciativa: 8,
          Defesa: 2,  // min(5,2)+0
          Armadura: 0,
        },
        attributes: { ...naokiAttrs },
        weakness: {
          'Letal (+2)': 'Vacina',
          'Agravado (+3)': 'Trevas, Fogo',
          'Resistente (-2)': 'Data',
        },
        affinity: {
          Fogo: 0, Vento: 2, Madeira: 0, Gelo: 0, Terra: 0,
          Luz: 0, Metal: 0, Trevas: 0, Água: 1, Trovão: 0,
          Físico: 1, Enfraquecer: 3, Resistência: 1, Cura: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Ataque', title: 'Speed Nightmare',
            alcance: 'corpo a corpo 2m', custo: '0',
            dados: 'Força + Físico OU Enfraquecer',
            effect: 'Aplica 2 [Poison]; em crítico aplica +2 cargas.',
          },
          {
            type: 'action', keyword: 'Efeito', title: 'Fairy Powder',
            alcance: 'projétil 5m', custo: '-2 Memory',
            dados: 'Manipulação + Enfraquecer',
            effect: 'Aplica 1 [De-Digivolve] em inimigo lvl 4 ou inferior.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Flying',
            effect: 'Durante o turno de Tinkermon, é possível gastar sua ação de movimento para ganhar 5 cargas de [Flight] e se mover. É possível retirar todas as cargas de [Flight] como uma Ação Livre durante o turno de Tinkermon.',
          },
        ] as DigimonSkill[],
      },
      // 2 — Witchmon (Adult)
      {
        stageName: 'Witchmon', level: 'Adult (Lvl 4)', cost: '-2 Memory / duração 5 rounds',
        type: 'Demon Man', portrait: 'purple', size: 3, speed: 5, locked: false,
        status: {
          HP: 18,
          Deslocamento: 11,
          Iniciativa: 5,
          Defesa: 3,  // min(5,2)+1
          Armadura: 0,
        },
        attributes: { ...naokiAttrs },
        weakness: {
          'Letal (+2)': 'Vacina',
          'Agravado (+3)': 'Luz, Fogo',
          'Resistente (-2)': 'Data, Vento, Água',
        },
        affinity: {
          Vento: 4, Água: 3, Físico: 1, Enfraquecer: 3, Resistência: 1, Cura: 0,
          Fogo: 0, Madeira: 0, Gelo: 0, Terra: 0, Luz: 0, Metal: 0, Trevas: 0, Trovão: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Ataque', title: 'Aquary Pressure',
            alcance: 'projétil 8m', custo: '-2 Memory',
            dados: 'Inteligência + Presença + Água',
            effect: '[Piercing].',
          },
          {
            type: 'action', keyword: 'Ataque', title: 'Baluluna Gale',
            alcance: 'projétil 5m', custo: '0',
            dados: 'Inteligência + Presença + Vento',
            effect: '—',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Flying Broom',
            effect: 'Witchmon começa a luta com cargas infinitas de [Flight]. Caso seja derrubada de alguma forma, ela pode voltar a voar como uma Ação Livre durante o turno dela; ela também pode parar de voar durante seu turno como uma ação livre se assim quiser. Witchmon pode carregar até dois acompanhantes em sua vassoura.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Magic School of WitcheIny',
            effect: 'Aumenta em +1 as afinidades de Água e Vento de Witchmon.',
          },
        ] as DigimonSkill[],
      },
      // 3 — Armor (Lvl 4 alternativo — bloqueado)
      {
        stageName: '???', level: 'Armor (Lvl 4)', cost: '—',
        type: '???', portrait: 'pink', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...naokiAttrs },
        weakness: {}, affinity: {}, skills: [],
      },
      // 4 — ??? (Perfect — bloqueado)
      {
        stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory',
        type: '???', portrait: 'pink', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...naokiAttrs },
        weakness: {}, affinity: {}, skills: [],
      },
      // 5 — ??? (Ultimate — bloqueado)
      {
        stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory',
        type: '???', portrait: 'pink', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...naokiAttrs },
        weakness: {}, affinity: {}, skills: [],
      },
    ],
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  UTSUROGI MORI  —  teal                                     ║
  // ╚══════════════════════════════════════════════════════════════╝

  const moriAttrs: Attributes = {
    Inteligência: 4, Força: 1, Presença: 1,
    Raciocínio: 3,  Destreza: 2, Manipulação: 4,
    Perseverança: 3, Vigor: 4,  Autocontrole: 3,
  };
  // HP=9 | Digisoul=6 | Def=min(2,3)=2 | Inic=2+3+1=6 | Desloc=1+2+5=8

  const mori: Tamer = {
    id: 't-mori',
    name: 'MORI', surname: 'Utsurogi',
    portrait: 'teal', image: null,
    age: 25, height: 185,
    sign: 'Peixes', birthday: '03 de Março de 1997',
    voice: 'Shinnosuke Tachibana',
    tagline: 'Não há distância que o laço do karma não alcance.',
    xp: 90, xpSpent: 0,
    status: {
      HP:       { v: 9,  max: 9  },
      Memory:   { v: 3,  max: 10 },
      Digisoul: { v: 6,  max: 6  },
      Deslocamento: 8,
      Autoridade:   2,
      Iniciativa:   6,
    },
    attributes: moriAttrs,
    skills: {
      Mental: { Investigação: 0, Construção: 0, 'E.G.': 3, 'P.S.': 3, Folclore: 2, Ciência: 0, Notívago: 1 },
      Físico: { Briga: 0, Atletismo: 0, Sobrevivência: 0, Furtividade: 0, Culinária: 4, Limpeza: 0, Esquiva: 0 },
      Social: { Intimidação: 4, Persuasão: 0, Socializar: 2, Expressão: 4, Empatia: 2, Subterfúgio: 3, Sorte: 0 },
    },
    tamerSkills: [
      {
        type: 'action', keyword: 'Charge', title: 'Charge',
        target: 'Mori', custo: 'Nenhum',
        effect: 'Caso a Memory de Mori seja 2 ou menos, aumente-a para 3.',
      },
      {
        type: 'reaction', keyword: 'Nama-miko Monogatari', title: 'Nama-miko Monogatari',
        target: '1 Aliado ou 1 Inimigo', custo: '-2 Memory',
        effect: 'Quando um aliado ou inimigo atacar, Mori pode ativar essa Skill. Adicione +1 dado na rolagem caso seja um aliado ou diminua -1 dado na rolagem caso seja um inimigo. Se houver um inimigo afetado por uma Condição negativa na batalha, aumenta em +1 a quantidade de dados adicionados ou removidos.',
      },
      {
        type: 'action', keyword: 'Mekura-oni', title: 'Mekura-oni',
        target: '1 Digimon aliado', custo: '-4 Memory',
        effect: 'Duplica a afinidade atual a [Enfraquecer] de um Digimon aliado durante 3 Rounds.',
      },
      {
        type: 'passive', keyword: 'Shiki', title: 'Shiki',
        effect: 'No início do Round, escolha um inimigo; X é igual ao número de Condições [máx.2] que o inimigo escolhido por Mori tem. No início do turno de Kudamon, aumenta Defesa e [Security Attack] em +X. Esse efeito é desativado ao final do Round.',
        toggleBonus: { statusBonus: { Defesa: 1, SecurityAttack: 1 }, xBonus: { xMax: 2, label: 'X (Condições do inimigo)' } },
      },
      {
        type: 'action', keyword: 'Moribito', title: 'Moribito',
        target: '1 Aliado', custo: '-1 Memory', dados: 'Inteligência + Primeiros Socorros',
        effect: 'Para ativar essa Skill, é necessário desativar uma Condição negativa de um inimigo a escolha de Mori. Recupere HP de 1 aliado de acordo com o número de sucessos + 3.',
      },
      {
        type: 'action', keyword: 'Onnamen', title: 'Onnamen',
        target: '1 Digimon aliado', custo: '-2 Memory',
        effect: 'Aplica [Phantasm] em um Digimon aliado.',
      },
      {
        type: 'action', keyword: 'Kakushi Ken', title: 'Kakushi Ken: Oni no Tsume',
        target: '1 Inimigo', custo: '-2 Memory', dados: 'Destreza + Folclore',
        effect: 'Aplica 8 + X cargas de [Bleed] no alvo; X é igual a quantidade de sucessos tirados no dado.',
      },
      {
        type: 'action', keyword: 'Nise no En', title: 'Nise no En: Shui',
        target: 'Mori', custo: 'Nenhum',
        effect: 'Mori escolhe uma Skill de ação e causa X de dano em Kudamon e suas evoluções; X é equivalente ao custo de Memory da Skill escolhida multiplicado por 2. Até o final desse Round, a Skill escolhida terá seu custo reduzido para 0 e terá [Blitz].',
      },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-kudamon-line',
  };

  // ── Kudamon Line ────────────────────────────────────────────────────────────
  // HP Kudamon = HP tamer (9) + 5 = 14 | HP Reppamon = tamer (9) + 10 = 19
  // Kudamon speed: Levitate → voa. Speed base 5.
  // Desloc Kudamon = 1+2+5 = 8

  const kudamonLine: DigimonLine = {
    id: 'd-kudamon-line',
    tamerId: 't-mori',
    name: 'Kudamon Line',
    sectors: [], image: null,
    currentStage: 1,
    line: '??? ↔ Kudamon (Child) / Armor ↔ Reppamon ↔ ??? ↔ ???',
    stages: [
      // 0 — Baby (bloqueado)
      {
        stageName: '???', level: 'In-Training (Lvl 2)', cost: '0',
        type: '???', portrait: 'teal', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...moriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 1 — Kudamon (Child)
      {
        stageName: 'Kudamon', level: 'Child (Lvl 3)', cost: '0',
        type: 'Holy Beast', portrait: 'teal', size: 3, speed: 5, locked: false,
        status: {
          HP: 14, Deslocamento: 8, Iniciativa: 6, Defesa: 2, Armadura: 0,
        },
        attributes: { ...moriAttrs },
        weakness: {
          'Letal (+2)': 'Data',
          'Agravado (+3)': 'Trevas, Metal',
          'Resistente (-2)': 'Vírus',
        },
        affinity: {
          Fogo: 0, Vento: 1, Madeira: 0, Gelo: 0, Terra: 0,
          Luz: 0, Metal: 0, Trevas: 0, Água: 0, Trovão: 0,
          Físico: 1, Enfraquecer: 3, Resistência: 2, Cura: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Ataque', title: 'Dangan Senpu',
            alcance: 'corpo a corpo 1m', custo: 'Nenhum',
            dados: 'Destreza ou Força + Físico',
            effect: 'Nenhum.',
          },
          {
            type: 'action', keyword: 'Efeito', title: 'Zekkou Shou',
            alcance: 'projétil 5m', custo: '-2 Memory',
            dados: 'Manipulação + Enfraquecer',
            effect: 'Aplica 1 carga de [Blind] no inimigo atingido. Só pode ser usado contra inimigo que não esteja afetado por Blind.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Levitate',
            effect: 'Kudamon tem cargas infinitas de [Flight]. Caso seja derrubado de alguma forma, ele pode voltar a voar como uma Ação Livre durante o seu turno.',
          },
        ] as DigimonSkill[],
      },
      // 2 — Reppamon (Adult)
      {
        stageName: 'Reppamon', level: 'Adult (Lvl 4)', cost: '-2 Memory / duração 5 rounds',
        type: 'Holy Beast', portrait: 'teal', size: 3, speed: 5, locked: false,
        status: {
          HP: 19,          // 14 + 5
          Deslocamento: 8, // Força(1)+Destreza(2)+speed(5)
          Iniciativa: 6,
          Defesa: 3,       // min(2,3)+1 evo bonus
          Armadura: 0,
        },
        attributes: { ...moriAttrs },
        weakness: {
          'Letal (+2)': 'Data',
          'Agravado (+3)': 'Trevas, Metal',
          'Resistente (-2)': 'Vírus, Vento, Luz',
        },
        affinity: {
          Fogo: 0, Vento: 2, Madeira: 0, Gelo: 0, Terra: 0,
          Luz: 0, Metal: 0, Trevas: 0, Água: 0, Trovão: 0,
          Físico: 2, Enfraquecer: 3, Resistência: 2, Cura: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Ataque', title: 'Shinku Kamaitachi',
            alcance: 'projétil 5m', custo: '-2 Memory',
            dados: 'Destreza + Inteligência + Vento',
            effect: '[Jamming]. Ignora Defesa.',
          },
          {
            type: 'action', keyword: 'Ataque', title: 'Kurukuru Rekkuzan',
            alcance: 'corpo a corpo 2m', custo: 'Nenhum',
            dados: 'Destreza + Vigor + Físico',
            effect: 'Nenhum.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Dance in the Forest',
            effect: 'Reppamon recebe Deslocamento +5 e Defesa +3 se o campo de batalha for uma floresta.',
            toggleBonus: { statusBonus: { Deslocamento: 5, Defesa: 3 } },
          },
        ] as DigimonSkill[],
      },
      // 3 — Armor (Lvl 4 alternativo — bloqueado)
      {
        stageName: '???', level: 'Armor (Lvl 4)', cost: '—',
        type: '???', portrait: 'teal', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...moriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 4 — ??? (Perfect — bloqueado)
      {
        stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory',
        type: '???', portrait: 'teal', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...moriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 5 — ??? (Ultimate — bloqueado)
      {
        stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory',
        type: '???', portrait: 'teal', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...moriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
    ],
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  MIKI SAWATARI  —  purple                                   ║
  // ╚══════════════════════════════════════════════════════════════╝

  const mikiAttrs: Attributes = {
    Inteligência: 2, Força: 2, Presença: 2,
    Raciocínio: 3,  Destreza: 3, Manipulação: 2,
    Perseverança: 3, Vigor: 2,  Autocontrole: 3,
  };
  // HP=7 | Digisoul=6 | Def=min(3,3)=3 | Inic=3+3+1=7 | Desloc=2+3+5=10

  const miki: Tamer = {
    id: 't-miki',
    name: 'MIKI', surname: 'Sawatari',
    portrait: 'purple', image: null,
    age: 17, height: 160,
    sign: 'Aquário', birthday: '03 de Fevereiro de 2005',
    voice: 'Ikue Ohtani',
    tagline: 'O show deve continuar.',
    xp: 63, xpSpent: 0,
    status: {
      HP:       { v: 7,  max: 7  },
      Memory:   { v: 3,  max: 10 },
      Digisoul: { v: 6,  max: 6  },
      Deslocamento: 10,
      Autoridade:   2,
      Iniciativa:   7,
    },
    attributes: mikiAttrs,
    skills: {
      Mental: { Investigação: 1, Construção: 0, 'E.G.': 1, 'P.S.': 0, Folclore: 4, Ciência: 0, Notívago: 1 },
      Físico: { Briga: 0, Atletismo: 1, Sobrevivência: 0, Furtividade: 2, Culinária: 0, Limpeza: 0, Esquiva: 2 },
      Social: { Intimidação: 0, Persuasão: 2, Socializar: 0, Expressão: 5, Empatia: 3, Subterfúgio: 1, Sorte: 4 },
    },
    tamerSkills: [
      {
        type: 'action', keyword: 'Charge', title: 'Charge',
        target: 'Miki', custo: 'Nenhum',
        effect: 'Caso a Memory de Miki seja 2 ou menos, aumente-a para 3.',
      },
      {
        type: 'action', keyword: 'Glossary of Magic', title: 'Glossary of Magic: Needle-Through-Arm',
        target: '1 Inimigo', custo: '-2 Memory', dados: 'Destreza + Expressão',
        effect: 'Aplica 1 carga de [Bind] ou [Paralysis] no alvo. Em caso de Crítico, aplique uma carga extra da Condição escolhida.',
      },
      {
        type: 'action', keyword: 'Glossary of Magic', title: 'Glossary of Magic: Linking Rings',
        target: 'Blucomon', custo: '-X Memory',
        effect: 'X é igual à quantidade de Memory gasta [mín. 1, máx. 3]; aumenta os dados de ataques Físicos de Blucomon em +X e diminui o Deslocamento de Blucomon em -X; ambos os efeitos duram 3 Rounds.',
      },
      {
        type: 'action', keyword: 'Glossary of Magic', title: 'Glossary of Magic: Quick-change',
        target: '1 Digimon aliado', custo: '-1 Memory',
        effect: 'Escolha uma classe de atributos [Poder, Refinamento ou Resistência], então mude o valor de um dos atributos dessa classe para 1, e aumente o valor de outro para 3. Essas mudanças duram 1 Round.',
      },
      {
        type: 'action', keyword: 'Glossary of Magic', title: 'Glossary of Magic: Levitation Illusion',
        target: '1 Aliado', custo: '-1 Memory',
        effect: 'Aplica 3 cargas de [Flight] a 1 aliado. Se o alvo tiver sido um Digimon não-Data, reduza a Defesa e a Armadura dele para 0 durante o efeito. Não é possível ter mais de 1 alvo afetado por essa Skill ao mesmo tempo.',
      },
      {
        type: 'reaction', keyword: 'Glossary of Magic', title: 'Glossary of Magic: Magical Hats',
        target: 'Blucomon', custo: '-2 Memory',
        effect: 'Quando um inimigo designar Blucomon como alvo de um ataque, Miki pode ativar essa Skill. Miki escolhe um número de 1 a 4 e força o inimigo a rolar 1d4; se o inimigo não tirar o número escolhido por Miki, o ataque errará. Se o inimigo acertar, Miki recupera 1 de Memory.',
      },
      {
        type: 'action', keyword: 'Glossary of Magic', title: 'Glossary of Magic: Fire Breathing',
        target: '1 Inimigo', custo: '-1 Memory', dados: 'Destreza + Expressão',
        effect: 'Aplica 4 + X cargas de [Burn] no alvo; X é igual a quantidade de sucessos tirados no dado.',
      },
      {
        type: 'passive', keyword: 'The Show Must Go On', title: 'The Show Must Go On',
        effect: 'No início do Round, caso tenha usado uma ação que tenha [Glossary of Magic] no nome durante o Round anterior, Memory +1.',
      },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-blucomon-line',
  };

  // ── Blucomon Line ───────────────────────────────────────────────────────────
  // HP Blucomon = 7 + 5 = 12 | HP Paledramon = 12 + 5 = 17
  // Desloc = Força(2)+Destreza(3)+5 = 10

  const blucomonLine: DigimonLine = {
    id: 'd-blucomon-line',
    tamerId: 't-miki',
    name: 'Blucomon Line',
    sectors: [], image: null,
    currentStage: 1,
    line: '??? ↔ Blucomon (Child) / Armor ↔ Paledramon ↔ ??? ↔ ???',
    stages: [
      // 0 — Baby (bloqueado)
      {
        stageName: '???', level: 'In-Training (Lvl 2)', cost: '0',
        type: '???', portrait: 'blue', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...mikiAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 1 — Blucomon (Child)
      {
        stageName: 'Blucomon', level: 'Child (Lvl 3)', cost: '0',
        type: 'Small Dragon', portrait: 'blue', size: 3, speed: 5, locked: false,
        status: {
          HP: 17, Deslocamento: 10, Iniciativa: 7, Defesa: 3, Armadura: 0,
        },
        attributes: { ...mikiAttrs },
        weakness: {
          'Letal (+2)': 'Vírus',
          'Agravado (+3)': 'Fogo, Metal',
          'Resistente (-2)': 'Vacina',
        },
        affinity: {
          Fogo: 0, Vento: 0, Madeira: 0, Gelo: 4, Terra: 0,
          Luz: 0, Metal: 0, Trevas: 0, Água: 0, Trovão: 0,
          Físico: 1, Enfraquecer: 0, Resistência: 3, Cura: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Ataque', title: 'Ice Mash',
            alcance: 'corpo a corpo 1m', custo: 'Nenhum',
            dados: 'Força + Físico',
            effect: 'Nenhum.',
          },
          {
            type: 'action', keyword: 'Ataque', title: 'Baby Hail',
            alcance: 'projétil 5m', custo: 'Nenhum',
            dados: 'Vigor + Gelo',
            effect: 'Reduz em -2 o Deslocamento do inimigo atingido por esse ataque. Reduz em -4 o Deslocamento em caso de Crítico. Essas alterações duram 3 Rounds.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Sturdy',
            effect: 'Blucomon recebe +5 de HP.',
            alwaysOn: { statusBonus: { HP: 5 }, inheritable: true },
          },
        ] as DigimonSkill[],
      },
      // 2 — Paledramon (Adult)
      {
        stageName: 'Paledramon', level: 'Adult (Lvl 4)', cost: '-2 Memory',
        type: 'Dragon', portrait: 'blue', size: 3, speed: 5, locked: false,
        status: {
          HP: 17,
          Deslocamento: 10,
          Iniciativa: 7,
          Defesa: 4,  // min(3,3)+1
          Armadura: 0,
        },
        attributes: { ...mikiAttrs },
        weakness: {
          'Letal (+2)': 'Vírus',
          'Agravado (+3)': 'Fogo, Metal',
          'Resistente (-2)': 'Vacina, Gelo, Água',
        },
        affinity: {
          Fogo: 0, Vento: 0, Madeira: 0, Gelo: 5, Terra: 0,
          Luz: 0, Metal: 0, Trevas: 0, Água: 0, Trovão: 0,
          Físico: 2, Enfraquecer: 0, Resistência: 3, Cura: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Ataque', title: 'Ice Age',
            alcance: 'projétil 10m', custo: '-2 Memory',
            dados: 'Vigor + Destreza + Gelo',
            effect: '[Blast 2]. Aplica 1 carga de [Bind] em todos os alvos atingidos. Alvo: todos os inimigos dentro da área de [Blast].',
          },
          {
            type: 'action', keyword: 'Ataque', title: 'Meteor Hail',
            alcance: 'corpo a corpo 1m', custo: 'Nenhum',
            dados: 'Deslocamento + Físico',
            effect: 'Só pode ser usado caso Paledramon esteja sob a Condição de [Flight]. Após usar essa Skill, Deslocamento -3 para Paledramon, essa redução dura 3 Rounds, e pode stackar com ela própria.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Flying',
            effect: 'Durante o turno de Paledramon, é possível gastar sua ação de movimento para ganhar 5 cargas de [Flight] e se mover. É possível retirar todas as cargas de [Flight] como uma ação livre durante o turno de Paledramon.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Her Own Sun',
            effect: 'Imune a efeitos de clima que afetem Paledramon de forma negativa. Caso seja atingido por um ataque de Fogo de um Digimon de nível superior, essa passiva entrará em [Cooldown 3].',
          },
        ] as DigimonSkill[],
      },
      // 3 — Armor (Lvl 4 alternativo — bloqueado)
      {
        stageName: '???', level: 'Armor (Lvl 4)', cost: '—',
        type: '???', portrait: 'blue', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...mikiAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 4 — ??? (Perfect — bloqueado)
      {
        stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory',
        type: '???', portrait: 'blue', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...mikiAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 5 — ??? (Ultimate — bloqueado)
      {
        stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory',
        type: '???', portrait: 'blue', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...mikiAttrs }, weakness: {}, affinity: {}, skills: [],
      },
    ],
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  YURIETA MIYAMOTO  —  black                                 ║
  // ╚══════════════════════════════════════════════════════════════╝

  const yuriAttrs: Attributes = {
    Inteligência: 4, Força: 1, Presença: 3,
    Raciocínio: 3,  Destreza: 3, Manipulação: 1,
    Perseverança: 2, Vigor: 2,  Autocontrole: 3,
  };
  // HP=7 | Digisoul=5 | Def=min(3,3)=3 | Inic=3+3+1=7 | Desloc=1+3+5=9

  const yuri: Tamer = {
    id: 't-yuri',
    name: 'YURI', surname: 'Miyamoto',
    portrait: 'black', image: null,
    age: 17, height: 150,
    sign: 'Aquário', birthday: '29 de Janeiro de 2005',
    voice: 'Ogura Yui',
    tagline: 'Desenho o que os olhos não conseguem ver.',
    xp: 54, xpSpent: 0,
    status: {
      HP:       { v: 7,  max: 7  },
      Memory:   { v: 3,  max: 10 },
      Digisoul: { v: 5,  max: 5  },
      Deslocamento: 9,
      Autoridade:   2,
      Iniciativa:   7,
    },
    attributes: yuriAttrs,
    skills: {
      Mental: { Investigação: 3, Construção: 1, 'E.G.': 3, 'P.S.': 0, Folclore: 1, Ciência: 3, Notívago: 2 },
      Físico: { Briga: 1, Atletismo: 1, Sobrevivência: 4, Furtividade: 0, Culinária: 0, Limpeza: 1, Esquiva: 3 },
      Social: { Intimidação: 2, Persuasão: 1, Socializar: 3, Expressão: 3, Empatia: 2, Subterfúgio: 2, Sorte: 0 },
    },
    tamerSkills: [
      {
        type: 'action', keyword: 'Charge', title: 'Charge',
        target: 'Yuri', custo: 'Nenhum',
        effect: 'Caso a Memory de Yuri seja 2 ou menos, aumente-a pra 3.',
      },
      {
        type: 'reaction', keyword: 'Superego', title: 'Superego: Perfect Impression',
        target: 'Yuri ou 1 Aliado', custo: '-2 Memory',
        effect: 'Quando Yuri ou 1 aliado fizer uma rolagem, Yuri pode ativar essa Skill. Adiciona +1 sucesso ao resultado da rolagem. Caso o alvo tenha sido [Yuri] ou [Wormmon], o efeito muda para +2 sucessos.',
      },
      {
        type: 'action', keyword: 'Ego', title: 'Ego: Gaze, Guilty Iris',
        target: '1 Digimon aliado', custo: '-1 Memory',
        effect: 'Aplica 2 cargas de [Decoy] para o alvo. Caso Wormmon vá receber um ataque que irá zerar o HP dela, Yuri pode ativar essa Skill como uma Reação Livre; redirecione o ataque para outro alvo que esteja dentro do alcance do ataque inimigo.',
      },
      {
        type: 'action', keyword: 'Superego', title: 'Superego: Penetrating Needle',
        target: '1 Inimigo', custo: '-2 Memory', dados: 'Inteligência + Folclore',
        effect: 'Aplica [Security Attack -1] no alvo, esse efeito dura 3 Rounds.',
      },
      {
        type: 'action', keyword: 'Ego', title: 'Ego: Overachieving Puppet',
        target: 'Yuri ou 1 aliado humano', custo: '-2 Memory',
        effect: 'Aplica [Reboot +1] em Yuri ou 1 aliado humano. Caso o alvo tenha sido Yuri, o custo dessa Skill é 0 e ganha [Blitz]. Não é possível ter mais de um alvo afetado por essa Skill ao mesmo tempo.',
      },
      {
        type: 'reaction', keyword: 'Superego', title: 'Superego: Clawing Owl',
        target: '1 Inimigo', custo: '-1 Memory',
        effect: 'Quando um inimigo usar um ataque ou efeito, Yuri pode ativar essa Skill. Aplica [Delay] no ataque ou efeito do alvo.',
      },
      {
        type: 'passive', keyword: 'Id', title: 'Id: Fragile Perception',
        effect: 'Anula o efeito de redução de atributos de [Worm Bait].',
      },
      {
        type: 'passive', keyword: 'Ego', title: 'Ego: Enchained Apprenticeship',
        effect: 'No início da batalha, Yuri escolhe um aliado humano; a pessoa escolhida será tratado como um [Apprentice] para as Skills de Yuri. No início do turno de Yuri, se ela tiver menos Memory que seu [Apprentice], Yuri recebe Memory +1. Se tanto Yuri quanto seu [Apprentice] tiverem 0 de Memory, ambos ganham Memory +1.',
      },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-wormmon-line',
  };

  // ── Wormmon Line ────────────────────────────────────────────────────────────
  // Linha especial: Leafmon (0) ↔ Minomon (1) ↔ Wormmon (2) ↔ ??? ↔ ??? ↔ ???
  // HP Wormmon = 7 + 5 = 12 | Desloc = 1+3+5 = 9

  const wormmonLine: DigimonLine = {
    id: 'd-wormmon-line',
    tamerId: 't-yuri',
    name: 'Wormmon Line',
    sectors: [], image: null,
    currentStage: 2, // Wormmon é o Child atual
    line: 'Leafmon ↔ Minomon ↔ Wormmon (Child) / Armor ↔ ??? ↔ ??? ↔ ???',
    stages: [
      // 0 — Leafmon (Baby I — revelado)
      {
        stageName: 'Leafmon', level: 'Fresh (Lvl 1)', cost: '0',
        type: 'Plant', portrait: 'green', size: 1, speed: 5, locked: false,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...yuriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 1 — Minomon (Baby II — revelado)
      {
        stageName: 'Minomon', level: 'In-Training (Lvl 2)', cost: '0',
        type: 'Larva', portrait: 'green', size: 2, speed: 5, locked: false,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...yuriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 2 — Wormmon (Child)
      {
        stageName: 'Wormmon', level: 'Child (Lvl 3)', cost: '0',
        type: 'Larva', portrait: 'black', size: 3, speed: 5, locked: false,
        status: {
          HP: 12, Deslocamento: 9, Iniciativa: 7, Defesa: 3, Armadura: 0,
        },
        attributes: { ...yuriAttrs },
        weakness: {
          'Agravado (+3)': 'Fogo, Físico, Enfraquecer, Trevas',
        },
        affinity: {
          Fogo: 0, Vento: 0, Madeira: 0, Gelo: 0, Terra: 0,
          Luz: 0, Metal: 0, Trevas: 0, Água: 0, Trovão: 0,
          Físico: 1, Enfraquecer: 3, Resistência: 0, Cura: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Efeito', title: 'Nebaneba Net',
            alcance: 'projétil 5m', custo: '-2 Memory',
            dados: 'Destreza + Enfraquecer',
            effect: 'Aplica 1 carga de [Paralysis] no inimigo atingido. Em caso de Crítico, aplica 1 carga extra. Só pode ser usado contra inimigo que não esteja afetado por Paralysis.',
          },
          {
            type: 'action', keyword: 'Ataque', title: 'Thread Clump Drop',
            alcance: 'projétil 5m', custo: '-1 Memory',
            dados: 'Destreza + Físico',
            effect: 'Só pode ser usado contra inimigo que esteja com cargas de [Flight]. Derruba o inimigo, tirando todas as cargas de [Flight] dele.',
          },
          {
            type: 'action', keyword: 'Ataque', title: 'Silk Thread',
            alcance: 'projétil 5m', custo: 'Nenhum',
            dados: 'Destreza + Físico',
            effect: 'Nenhum.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'To You, from Me',
            effect: 'Altera o efeito de [Averted Gaze].',
          },
        ] as DigimonSkill[],
      },
      // 3 — ??? (Adult — bloqueado)
      {
        stageName: '???', level: 'Adult (Lvl 4)', cost: '-2 Memory',
        type: '???', portrait: 'black', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...yuriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 4 — Armor (Lvl 4 alternativo — bloqueado)
      {
        stageName: '???', level: 'Armor (Lvl 4)', cost: '—',
        type: '???', portrait: 'black', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...yuriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 5 — ??? (Perfect — bloqueado)
      {
        stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory',
        type: '???', portrait: 'black', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...yuriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 5 — ??? (Ultimate — bloqueado)
      {
        stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory',
        type: '???', portrait: 'black', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...yuriAttrs }, weakness: {}, affinity: {}, skills: [],
      },
    ],
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  EISUKE MORIKAWA  —  gold                                   ║
  // ╚══════════════════════════════════════════════════════════════╝

  const eisukeAttrs: Attributes = {
    Inteligência: 2, Força: 2, Presença: 2,
    Raciocínio: 4,  Destreza: 4, Manipulação: 2,
    Perseverança: 2, Vigor: 3,  Autocontrole: 4,
  };
  // HP=8 | Digisoul=6 | Def=min(4,4)=4 | Inic=4+4+1=9 | Desloc=2+4+5=11

  const eisuke: Tamer = {
    id: 't-eisuke',
    name: 'EISUKE', surname: 'Morikawa',
    portrait: 'gold', image: null,
    age: 17, height: 185,
    sign: 'Escorpião', birthday: '31 de Outubro de 2004',
    voice: 'Kouki Uchiyama',
    tagline: 'Antes do meu corpo ceder.',
    xp: 24, xpSpent: 0,
    status: {
      HP:       { v: 8,  max: 8  },
      Memory:   { v: 3,  max: 10 },
      Digisoul: { v: 6,  max: 6  },
      Deslocamento: 11,
      Autoridade:   2,
      Iniciativa:   9,
    },
    attributes: eisukeAttrs,
    skills: {
      Mental: { Investigação: 2, Construção: 1, 'E.G.': 1, 'P.S.': 3, Folclore: 1, Ciência: 1, Notívago: 2 },
      Físico: { Briga: 1, Atletismo: 1, Sobrevivência: 1, Furtividade: 1, Culinária: 3, Limpeza: 2, Esquiva: 2 },
      Social: { Intimidação: 1, Persuasão: 3, Socializar: 1, Expressão: 2, Empatia: 4, Subterfúgio: 3, Sorte: 1 },
    },
    tamerSkills: [
      {
        type: 'action', keyword: 'Charge', title: 'Meditate',
        target: 'Eisuke', custo: 'Nenhum',
        effect: 'Caso a Memory de Eisuke seja 2 ou menos, aumente-a para 3.',
      },
      {
        type: 'action', keyword: 'Mark of Protection', title: 'Shield Set: Aegis',
        target: '1 Digimon Aliado que não tenha Blocker', custo: '-2 Memory',
        effect: 'Marca um Digimon aliado. O Digimon marcado tem [Blocker]. A marca é perdida quando o alvo usar o [Blocker] dessa Skill.',
      },
      {
        type: 'action', keyword: 'My Body as a Shield', title: 'Shield Set: Rho Aias',
        target: 'Eisuke', custo: '-X Memory',
        effect: 'Essa Skill pode ser ativada durante qualquer momento do turno de Eisuke ou do inimigo. X é igual à quantidade de Memory gasta [mín.1, máx. 3]. Adiciona Defesa: X e [Blocker] para Eisuke. Após usar o [Blocker] que essa Skill deu, os efeitos dela somem.',
      },
      {
        type: 'action', keyword: 'Stagnation', title: 'Nanghait',
        target: '1 Digimon aliado', custo: '-X Memory',
        effect: 'X é igual à quantidade de Memory gasta [mín.1, máx. 3]. Dá Defesa +X para um Digimon aliado e reduz o dano de seus ataques em -X. Esses efeitos duram 1 Round.',
      },
      {
        type: 'reaction', keyword: 'Message from the Village of Beginnings', title: 'And their Dreams continue...',
        target: '1 Digimon Aliado', custo: '-1 Memory',
        effect: 'Quando um Digimon aliado sofrer dano fatal, Eisuke pode ativar essa Skill. O Digimon aliado irá sobreviver com 1 de HP, e caso esteja conectado a um Digivice, [Save].',
      },
      {
        type: 'passive', keyword: 'Deflect', title: 'Deflect',
        effect: 'Quando um inimigo falhar um ataque contra um Digimon aliado, Eisuke irá rolar a Defesa atual do Digimon aliado e causará dano ao inimigo que errou o ataque de acordo com o número de sucessos dessa rolagem.',
      },
      {
        type: 'passive', keyword: 'Shield Maintenance', title: 'Shield Maintenance',
        effect: 'No início do turno de Eisuke, caso ele tenha usado [Blocker] no Round anterior, Memory +1.',
      },
      {
        type: 'passive', keyword: 'Before My Body Submits', title: 'Before My Body Submits',
        effect: 'Enquanto Eisuke estiver sob o efeito de [My Body as Shield], ele recebe os efeitos dessa Skill: Defesa +1 e caso a rolagem do inimigo ainda seja 6d10 ou mais após o cálculo de redução da Defesa, reduz mais 3 dados na rolagem de ataque do inimigo.',
        toggleBonus: { statusBonus: { Defesa: 1 } },
      },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-solarmon-line',
  };

  // ── Solarmon Line ───────────────────────────────────────────────────────────
  // HP Solarmon = 8 + 5 = 13 | HP Guardromon = 13 + 5 = 18
  // Desloc = 2+4+5 = 11 | Arm Solarmon = 1 (passiva Armored)
  // Guardromon: Chrondigizoit aplica -3 Desloc/-3 Inic +1 Def +2 Arm na prática

  const solarmonLine: DigimonLine = {
    id: 'd-solarmon-line',
    tamerId: 't-eisuke',
    name: 'Solarmon Line',
    sectors: [], image: null,
    currentStage: 1,
    line: '??? ↔ Solarmon (Child) / Armor ↔ Guardromon (Gold) ↔ ??? ↔ ???',
    stages: [
      // 0 — Baby (bloqueado)
      {
        stageName: '???', level: 'In-Training (Lvl 2)', cost: '0',
        type: '???', portrait: 'gold', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...eisukeAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 1 — Solarmon (Child)
      {
        stageName: 'Solarmon', level: 'Child (Lvl 3)', cost: '0',
        type: 'Machine', portrait: 'gold', size: 3, speed: 5, locked: false,
        status: {
          HP: 18, Deslocamento: 11, Iniciativa: 9, Defesa: 4, Armadura: 1,
        },
        attributes: { ...eisukeAttrs },
        weakness: {
          'Letal (+2)': 'Data',
          'Agravado (+3)': 'Água, Terra',
          'Resistente (-2)': 'Vírus',
        },
        affinity: {
          Fogo: 2, Vento: 0, Madeira: 0, Gelo: 0, Terra: 0,
          Luz: 0, Metal: 0, Trevas: 0, Água: 0, Trovão: 0,
          Físico: 1, Enfraquecer: 0, Resistência: 2, Cura: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Ataque', title: 'Shiny Ring',
            alcance: 'projétil 5m', custo: 'Nenhum',
            dados: 'Destreza + Fogo',
            effect: 'Aplica 2 cargas de [Burn]. Em caso de Crítico, aplica +2 cargas extras.',
          },
          {
            type: 'action', keyword: 'Ataque', title: 'Shiny Attack',
            alcance: 'corpo a corpo 1m', custo: 'Nenhum',
            dados: 'Força + Físico',
            effect: 'Nenhum.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Armored',
            effect: 'Armadura +1 para Solarmon.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Sturdy',
            effect: 'Solarmon recebe +5 de HP.',
            alwaysOn: { statusBonus: { HP: 5 }, inheritable: true },
          },
        ] as DigimonSkill[],
      },
      // 2 — Guardromon Gold (Adult)
      // Status base (sem Chrondigizoit): HP=18, Desloc=11, Inic=9, Def=4+1=5, Arm=0
      // Com Chrondigizoit (passiva sempre ativa): Desloc-3=8, Inic-3=6, Def+1=6, Arm+2=2
      // Registramos os valores COM a passiva ativa pois é o estado de combate real
      {
        stageName: 'Guardromon (Gold)', level: 'Adult (Lvl 4)', cost: '-2 Memory / duração 5 rounds',
        type: 'Machine', portrait: 'gold', size: 3, speed: 5, locked: false,
        status: {
          HP: 18,
          Deslocamento: 8,  // 11 - 3 (Chrondigizoit)
          Iniciativa: 6,    // 9  - 3 (Chrondigizoit)
          Defesa: 6,        // min(4,4)+1 evo + 1 Chrondigizoit
          Armadura: 2,      // Chrondigizoit
        },
        attributes: { ...eisukeAttrs },
        weakness: {
          'Agravado (+3)': 'Água, Fogo, Enfraquecer',
          'Resistente (-2)': 'Físico, Metal',
        },
        affinity: {
          Fogo: 2, Vento: 0, Madeira: 0, Gelo: 0, Terra: 0,
          Luz: 0, Metal: 0, Trevas: 0, Água: 0, Trovão: 0,
          Físico: 1, Enfraquecer: 0, Resistência: 4, Cura: 0,
        },
        skills: [
          {
            type: 'action', keyword: 'Ataque', title: 'Destruction Grenade',
            alcance: 'projétil 8m', custo: 'Nenhum',
            dados: 'Destreza + Autocontrole + Fogo',
            effect: 'Nenhum.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Chrondigizoit',
            effect: 'Diminui o Deslocamento e a Iniciativa de Guardromon em -3. Aumenta a Defesa em +1 e a Armadura em +2.',
          },
          {
            type: 'passive', keyword: 'Passiva', title: 'Defensive Program',
            effect: 'Guardromon não pode atacar inimigos que não tenham atacado ele no Round atual. No início do Round, ganha [Blocker].',
          },
        ] as DigimonSkill[],
      },
      // 3 — Armor (Lvl 4 alternativo — bloqueado)
      {
        stageName: '???', level: 'Armor (Lvl 4)', cost: '—',
        type: '???', portrait: 'gold', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...eisukeAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 4 — ??? (Perfect — bloqueado)
      {
        stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory',
        type: '???', portrait: 'gold', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...eisukeAttrs }, weakness: {}, affinity: {}, skills: [],
      },
      // 5 — ??? (Ultimate — bloqueado)
      {
        stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory',
        type: '???', portrait: 'gold', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 },
        attributes: { ...eisukeAttrs }, weakness: {}, affinity: {}, skills: [],
      },
    ],
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  SACHI FUJIMURA  —  rose  (sem digimon por enquanto)        ║
  // ╚══════════════════════════════════════════════════════════════╝

  const sachiAttrs: Attributes = {
    Inteligência: 3, Força: 1, Presença: 3,
    Raciocínio: 2,  Destreza: 3, Manipulação: 1,
    Perseverança: 5, Vigor: 2,  Autocontrole: 3,
  };
  // HP=7 | Digisoul=8 | Def=min(3,2)=2 | Inic=3+3+1=7 | Desloc=1+3+5=9

  const sachi: Tamer = {
    id: 't-sachi',
    name: 'SACHI', surname: 'Fujimura',
    portrait: 'rose', image: null,
    age: 18, height: 161,
    sign: 'Peixes', birthday: '29 de Fevereiro de 2005',
    voice: 'Rie Takahashi',
    tagline: 'Toda história merece ser contada.',
    xp: 96, xpSpent: 0,
    status: {
      HP:       { v: 7,  max: 7  },
      Memory:   { v: 3,  max: 10 },
      Digisoul: { v: 8,  max: 8  },
      Deslocamento: 9,
      Autoridade:   2,
      Iniciativa:   7,
    },
    attributes: sachiAttrs,
    skills: {
      Mental: { Investigação: 2, Construção: 1, 'E.G.': 1, 'P.S.': 1, Folclore: 1, Ciência: 1, Notívago: 1 },
      Físico: { Briga: 0, Atletismo: 0, Sobrevivência: 0, Furtividade: 0, Culinária: 1, Limpeza: 2, Esquiva: 1 },
      Social: { Intimidação: 1, Persuasão: 0, Socializar: 1, Expressão: 0, Empatia: 5, Subterfúgio: 0, Sorte: 2 },
    },
    tamerSkills: [
      {
        type: 'action', keyword: 'Charge', title: 'Charge',
        target: 'Sachi', custo: 'Nenhum',
        effect: 'Caso a Memory de Sachi seja 2 ou menos, aumente-a para 3.',
      },
      {
        type: 'reaction', keyword: 'Storywriter', title: 'Storywriter',
        custo: '-X Memory',
        effect: 'Cooldown: 1 Round. Quando um aliado humano usar uma Skill que custe Memory, Sachi pode ativar essa Skill. Sachi pagará o custo de Memory da Skill do aliado em seu lugar.',
      },
      {
        type: 'reaction', keyword: 'A Story about all of you', title: 'A Story about all of you',
        custo: '-2 Memory',
        effect: 'Quando um aliado humano fizer uma rolagem, Sachi pode ativar essa Skill. Caso a rolagem tenha menos de 7 dados, Sachi adiciona sua [Empatia] à rolagem; caso a rolagem tenha 7 dados ou mais, Sachi permite que o aliado rerolle X dados, com X sendo sua [Empatia].',
      },
      {
        type: 'action', keyword: 'Stage Out', title: 'Stage Out',
        target: '1 Aliado humano', custo: '-1 Memory',
        effect: 'Também pode ser ativado durante o início do Round. Efeitos de Memory que fossem afetar Sachi até o final desse Round serão redirecionados para o aliado escolhido por ela.',
      },
      {
        type: 'action', keyword: 'Puppet Theater', title: 'Puppet Theater',
        custo: '-1 Memory',
        effect: 'Sachi invoca um [Puppet Token / Lv.3] adjacente a ela e pelos próximos 3 Rounds, no final do turno dela, Sachi pode invocar um [Puppet Token Lv.3] como uma Ação Livre e sem pagar o custo. Enquanto [Puppet Theater] estiver ativo, Sachi não pode usar essa Skill de novo.',
      },
      {
        type: 'action', keyword: 'Catharsis', title: 'Catharsis',
        custo: '-2 Memory',
        effect: 'Sachi invoca um [Enhanced Puppet Token / Lv.4] adjacente à ela e escolhe um [Token] aliado em campo; quando o [Token] escolhido fizer seu próximo ataque, o ataque dele acertará garantido, dados só serão rolados para definir quanto de dano foi causado caso o ataque não tenha dano fixo.',
      },
      {
        type: 'passive', keyword: 'Spectator\'s Chair', title: 'Spectator\'s Chair',
        effect: 'No início do turno de Sachi, caso Sachi ou sua Digimon não tenham feito ataques no Round anterior, ela irá curar 40% de sua [Empatia] como HP para todos os aliados humanos na batalha que ela consiga ver.',
      },
      {
        type: 'passive', keyword: 'Storyteller\'s Mask', title: 'Storyteller\'s Mask',
        effect: 'Quando [Spectator\'s Chair] ativar, permite que Sachi faça uma cura extra para o aliado com menor HP na batalha — em caso de empate, Sachi escolhe — que ela consiga ver.',
      },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: null, // Digimon a ser revelado futuramente
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // AppState final
  // ─────────────────────────────────────────────────────────────────────────────

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  HARE OUHARA  —  orange                                     ║
  // ╚══════════════════════════════════════════════════════════════╝

  const hareAttrs: Attributes = {
    Inteligência: 1, Força: 2, Presença: 5,
    Raciocínio: 2, Destreza: 2, Manipulação: 1,
    Perseverança: 3, Vigor: 3, Autocontrole: 2,
  };

  const hare: Tamer = {
    id: 't-hare',
    name: 'HARE', surname: 'Ouhara',
    portrait: 'orange', image: null,
    age: 17, height: 165,
    sign: 'Libra', birthday: '1 de Outubro',
    voice: 'Akemi Kanda',
    tagline: 'Domain of Sky.',
    xp: 80, xpSpent: 0,
    status: {
      HP:       { v: 8, max: 8 },
      Memory:   { v: 3, max: 10 },
      Digisoul: { v: 5, max: 5 },
      Deslocamento: 9,
      Autoridade: 0,
      Iniciativa: 5,
    },
    attributes: hareAttrs,
    skills: {
      Mental: { Investigação: 0, Construção: 1, 'E.G.': 0, 'P.S.': 1, Folclore: 1, Ciência: 0, Notívago: 1 },
      Físico: { Briga: 0, Atletismo: 2, Sobrevivência: 1, Furtividade: 0, Culinária: 2, Limpeza: 2, Esquiva: 0 },
      Social: { Intimidação: 2, Persuasão: 0, Socializar: 4, Expressão: 2, Empatia: 4, Subterfúgio: 0, Sorte: 1 },
    },
    tamerSkills: [
      { type: 'action', keyword: 'Domain', title: 'Domain of Sky', custo: 'Nenhum',
        effect: 'Ativa o Domain de Hare e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.' },
      { type: 'action', keyword: 'Goggle Girl', title: 'Goggle Girl',
        target: '1 personagem não analisado', custo: '-1 Memory',
        effect: 'Libera a ficha do alvo analisado.' },
      { type: 'action', keyword: 'Jogress', title: 'Jogress: Sky & Oblivion', custo: 'Nenhum',
        effect: 'Requerimento: [Domain of Sky] + [Domain of Oblivion]. Tanto Hibito quanto Hare podem ativar essa Skill. Escolha uma Skill Passiva que recupere Memory de cada Domain. As Skills escolhidas são herdadas pelo [Domain of Time]. Em seguida, ative o [Domain of Time].' },
      { type: 'action', keyword: 'Domain of Sky', title: 'Sunny Day', custo: '-3 Memory',
        effect: 'Muda o clima para [Intense Sunlight]. Esse efeito dura 5 Rounds.' },
      { type: 'action', keyword: 'Domain of Sky', title: 'Foggy Day', custo: '-3 Memory',
        effect: 'Muda o clima para [Dense Fog]. Esse efeito dura 5 Rounds.' },
      { type: 'action', keyword: 'Domain of Sky', title: 'Rainy Day', custo: '-3 Memory',
        effect: 'Muda o clima para [Heavy Rain]. Esse efeito dura 5 Rounds.' },
      { type: 'action', keyword: 'Domain of Sky', title: 'Weather Digimental',
        target: 'Toy Agumon, Blucomon, Tinkermon, Solarmon, Kudamon ou Wormmon', custo: '-2 Memory',
        effect: 'Caso o clima tenha sido causado por uma Skill com "Day" no nome, o custo é 0. Aplica 1 carga de [Armor Evolution] no Digimon escolhido e libera [Armor Purge] como reação livre para Hare.' },
      { type: 'action', keyword: 'Domain of Sky', title: 'Sky Memory Boost',
        target: 'Hare + 2 Aliados Humanos', custo: '-3 Memory',
        effect: 'Não pode ser usado fora de combate. Ativa uma Skill de Hare com "Day" no nome sem pagar o custo, depois entra em [Delay]; ao sair do [Delay], Memory +2 para Hare e os aliados escolhidos.' },
      { type: 'passive', keyword: 'Domain of Sky', title: 'Skygazing',
        effect: 'No início do Round, caso o clima seja [Clear Skies], Memory +1 para Hare e todos os aliados humanos dentro do Domain.' },
      { type: 'passive', keyword: 'Domain of Sky', title: 'Weather Forecast',
        effect: 'No início do Round, caso o clima tenha sido alterado no Round anterior, Memory +1 para Hare e todos os aliados humanos dentro do Domain.' },
      { type: 'action', keyword: 'Domain of Time', title: 'Sunny Wind',
        target: 'Hare ou 1 Aliado', custo: '-1 Memory', dados: 'Perseverança + Primeiros Socorros',
        effect: 'Caso o clima seja [Intense Sunlight], o custo é 0. Remova 2 + X cargas de um Relógio de Ferimento do aliado escolhido e cure 1 + X de HP; X = sucessos obtidos.' },
      { type: 'passive', keyword: 'Domain of Time', title: 'Sun-Viewing Recital',
        effect: 'Quando cargas de [Burn] forem aplicadas em personagens, Memory +1 para Hare, Hibito e todos os aliados dentro do [Domain of Time]. Máximo duas vezes por Round.' },
      { type: 'passive', keyword: 'Domain of Time', title: 'Faintly, like the Summer Wind',
        effect: 'Aumenta as rolagens de [Perseverança] de Hare em +2 dados enquanto equipada com [Matoi: Koyomi]. Sempre que usar uma Skill com apenas 1 aliado como alvo, o aliado recebe +2 dados em rolagens de [Perseverança] até o final do Round.' },
      { type: 'passive', keyword: 'Domain of Time', title: 'The Flame That Counts the Years',
        effect: 'Enquanto esse Domain estiver ativo, [Humanos] são imunes a ataques. No final do Round, 3 personagens aleatórios são afetados por 4 cargas de [Burn].' },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-toyagumon-line',
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  KANADE HANKEI  —  blue                                     ║
  // ╚══════════════════════════════════════════════════════════════╝

  const kanadeAttrs: Attributes = {
    Inteligência: 3, Força: 1, Presença: 3,
    Raciocínio: 3, Destreza: 4, Manipulação: 2,
    Perseverança: 2, Vigor: 3, Autocontrole: 1,
  };

  const kanade: Tamer = {
    id: 't-kanade',
    name: 'KANADE', surname: 'Hankei',
    portrait: 'wheat', image: null,
    age: 17, height: 157,
    sign: 'Peixes', birthday: '19 de Fevereiro',
    voice: 'Kana Asumi',
    tagline: 'Domain of Suffocation.',
    xp: 85, xpSpent: 0,
    status: {
      HP:       { v: 8, max: 8 },
      Memory:   { v: 3, max: 10 },
      Digisoul: { v: 3, max: 3 },
      Deslocamento: 10,
      Autoridade: 0,
      Iniciativa: 6,
    },
    attributes: kanadeAttrs,
    skills: {
      Mental: { Investigação: 0, Construção: 2, 'E.G.': 2, 'P.S.': 2, Folclore: 0, Ciência: 2, Notívago: 0 },
      Físico: { Briga: 0, Atletismo: 0, Sobrevivência: 1, Furtividade: 2, Culinária: 1, Limpeza: 1, Esquiva: 0 },
      Social: { Intimidação: 0, Persuasão: 0, Socializar: 3, Expressão: 4, Empatia: 2, Subterfúgio: 2, Sorte: 0 },
    },
    tamerSkills: [
      { type: 'action', keyword: 'Domain', title: 'Domain of Suffocation', custo: 'Nenhum',
        effect: 'Ativa o Digital Gate de Kanade. Libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.' },
      { type: 'action', keyword: 'Fuga', title: 'Desperate Escape',
        target: 'Todos os aliados', custo: '-5 HP para todos os Digimons aliados',
        effect: 'Kanade e seus aliados são transportados para a zona segura mais próxima e fogem da batalha. Se não houver zona segura no alcance, a Skill falha, mas o custo ainda é pago.' },
      { type: 'action', keyword: 'Domain of Suffocation', title: 'Mikazuki',
        target: '1 Aliado sem HP completo', custo: '-1 Memory', dados: 'Inteligência + Primeiros Socorros + Cura',
        effect: 'Recupera HP do aliado de acordo com os sucessos + 3.' },
      { type: 'action', keyword: 'Domain of Suffocation', title: 'A Deal with Dagomon',
        target: '1 Digimon aliado', custo: '-1 Memory',
        effect: 'Aplica 10 cargas de [Curse] no Digimon e aumenta em +10 o MAXHP dele, curando essa quantidade logo em seguida. Se o [Curse] acabar, o aumento de HP é desativado. Só 1 Digimon afetado por vez.' },
      { type: 'action', keyword: 'Domain of Suffocation', title: 'Suffocating Memory Boost',
        target: 'Kanade + 2 aliados humanos', custo: '-3 Memory',
        effect: 'Não pode ser usado fora de combate. Reduz o HP dos Digimons escolhidos em -50% do HP atual, então entra em [Delay]; ao sair do [Delay], Memory +2 para Kanade e os aliados escolhidos.' },
      { type: 'action', keyword: 'Domain of Suffocation', title: 'Air Purifier',
        target: '1 Digimon Aliado com Condição Negativa', custo: '-1 Memory',
        effect: 'Reduz o HP do Digimon em -20% do MAXHP e limpa 1 Condição Negativa. Se o clima for [Heavy Rain], a redução é evitada e o alvo recupera HP equivalente à afinidade Cura de Kanade.' },
      { type: 'passive', keyword: 'Domain of Suffocation', title: 'Emergency Oxygen',
        effect: 'No início do Round, caso o HP de um Digimon aliado não esteja completo, Memory +1 para Kanade e todos os aliados humanos dentro do Domain.' },
      { type: 'passive', keyword: 'Domain of Suffocation', title: 'Breath Control',
        effect: 'No início do Round, caso o HP de um Digimon aliado esteja acima da metade, Memory +1 para Kanade e todos os aliados humanos dentro do Domain.' },
      { type: 'passive', keyword: 'Domain of Suffocation', title: 'A Glimmer in the Ocean',
        effect: 'Libera a afinidade [Cura] para Kanade. Adiciona [Cura] a todas as rolagens que recuperem HP.',
        alwaysOn: { affinityBonus: { Cura: 1 } } },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-penmon-line',
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  SHINRA SORAKADO  —  green                                  ║
  // ╚══════════════════════════════════════════════════════════════╝

  const shinraAttrs: Attributes = {
    Inteligência: 2, Força: 3, Presença: 3,
    Raciocínio: 2, Destreza: 2, Manipulação: 1,
    Perseverança: 3, Vigor: 3, Autocontrole: 2,
  };

  const shinra: Tamer = {
    id: 't-shinra',
    name: 'SHINRA', surname: 'Sorakado',
    portrait: 'green', image: null,
    age: 18, height: 170,
    sign: 'Virgem', birthday: '8 de Setembro',
    voice: 'Tsubasa Yonaga',
    tagline: 'Domain of Nature.',
    xp: 80, xpSpent: 0,
    status: {
      HP:       { v: 8, max: 8 },
      Memory:   { v: 3, max: 10 },
      Digisoul: { v: 5, max: 5 },
      Deslocamento: 10,
      Autoridade: 0,
      Iniciativa: 5,
    },
    attributes: shinraAttrs,
    skills: {
      Mental: { Investigação: 0, Construção: 0, 'E.G.': 2, 'P.S.': 1, Folclore: 4, Ciência: 2, Notívago: 2 },
      Físico: { Briga: 2, Atletismo: 3, Sobrevivência: 0, Furtividade: 0, Culinária: 2, Limpeza: 1, Esquiva: 3 },
      Social: { Intimidação: 0, Persuasão: 0, Socializar: 0, Expressão: 0, Empatia: 2, Subterfúgio: 0, Sorte: 2 },
    },
    tamerSkills: [
      { type: 'action', keyword: 'Domain', title: 'Domain of Nature', custo: 'Nenhum',
        effect: 'Ativa o Domain de Shinra e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.' },
      { type: 'action', keyword: 'Domain of Nature', title: 'Hedge of Thorns',
        target: 'Todos os inimigos', custo: '-3 Memory', dados: 'Vigor + Folclore',
        effect: '[Blast 2]. Ignora Defesa. Acumula o dano total e distribui como cura entre os aliados de Shinra (exceto Shinra e Floramon).' },
      { type: 'action', keyword: 'Domain of Nature', title: 'The Boy who took the Sword', custo: '-1 Memory',
        effect: 'Cria a espada [La Vie en Rose]. Durante o turno de Shinra, caso a espada não esteja com ele, pode chamá-la de volta como ação livre. Ao final da batalha, a espada é desfeita.' },
      { type: 'action', keyword: 'Domain of Nature', title: 'Serene Fragrance',
        target: '1 Inimigo', custo: '-2 Memory', dados: 'Raciocínio + Folclore',
        effect: 'Reduz o número de sucessos das rolagens do inimigo em -1 durante 1 Round.' },
      { type: 'action', keyword: 'Domain of Nature', title: 'In Natura Memory Boost',
        target: 'Shinra + 2 aliados humanos', custo: '-3 Memory',
        effect: 'Não pode ser usado fora de combate. Ganha Queen\'s Favor +3, então entra em [Delay]; ao sair do [Delay], Memory +2 para Shinra e os aliados escolhidos.' },
      { type: 'action', keyword: 'Domain of Nature', title: "Earth's Kiss",
        target: 'Todos os aliados', custo: '-3 Memory',
        effect: 'Pelos próximos 3 Rounds, no início de cada Round, recupera 10% do MAXHP de Shinra e seus aliados. Se o clima for [Intense Sunlight], a cura é 20%.' },
      { type: 'action', keyword: 'Domain of Nature', title: "Earth's Boon",
        target: '1 Digimon Aliado', custo: '-2 Memory',
        effect: 'Shinra escolhe um ataque do Digimon; toda vez que esse ataque for usado, o Digimon recupera 3 HP. Se o alvo for Floramon, ataques com [La Vie en Rose] também são afetados. Se o clima for [Intense Sunlight], a recuperação aumenta +2.' },
      { type: 'passive', keyword: 'Domain of Nature', title: 'Narcissism',
        effect: 'No início do Round, caso o HP de Shinra e Floramon esteja completo, Memory +1 para Shinra e todos os aliados dentro do Domain.' },
      { type: 'passive', keyword: 'Domain of Nature', title: 'Queendom',
        effect: 'A rainha do Domain é invocada no início da batalha e adiciona a barra Queen\'s Favor [máx. 10]. Para cada sucesso nas rolagens de Shinra, ganha Queen\'s Favor. No início do Round, pode gastar Queen\'s Favor em múltiplos de 5 para dar Memory +1 para Shinra e todos os aliados dentro do Domain.' },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-floramon-line',
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  KUMO SUMERAGI  —  indigo                                   ║
  // ╚══════════════════════════════════════════════════════════════╝

  const kumoAttrs: Attributes = {
    Inteligência: 2, Força: 1, Presença: 1,
    Raciocínio: 3, Destreza: 4, Manipulação: 4,
    Perseverança: 2, Vigor: 2, Autocontrole: 4,
  };

  const kumo: Tamer = {
    id: 't-kumo',
    name: 'KUMO', surname: 'Sumeragi',
    portrait: 'indigo', image: null,
    age: 18, height: 174,
    sign: 'Gêmeos', birthday: '29 de Maio',
    voice: 'Romi Park',
    tagline: 'Domain of Logic.',
    xp: 82, xpSpent: 0,
    status: {
      HP:       { v: 7, max: 7 },
      Memory:   { v: 3, max: 10 },
      Digisoul: { v: 6, max: 6 },
      Deslocamento: 10,
      Autoridade: 0,
      Iniciativa: 9,
    },
    attributes: kumoAttrs,
    skills: {
      Mental: { Investigação: 3, Construção: 0, 'E.G.': 0, 'P.S.': 0, Folclore: 2, Ciência: 0, Notívago: 2 },
      Físico: { Briga: 0, Atletismo: 0, Sobrevivência: 0, Furtividade: 3, Culinária: 0, Limpeza: 0, Esquiva: 1 },
      Social: { Intimidação: 2, Persuasão: 4, Socializar: 0, Expressão: 1, Empatia: 0, Subterfúgio: 4, Sorte: 0 },
    },
    tamerSkills: [
      { type: 'action', keyword: 'Domain', title: 'Domain of Logic', custo: 'Nenhum',
        effect: 'Ativa o Domain de Kumo e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.' },
      { type: 'action', keyword: 'Domain of Logic', title: 'Graffiti: Cannon',
        target: '1 Inimigo', custo: '-1 Memory', dados: 'Destreza + Expressão',
        effect: 'Aplica 3 cargas de [Mist] no inimigo escolhido.' },
      { type: 'action', keyword: 'Domain of Logic', title: 'Overheating',
        target: '1 Digimon aliado', custo: '-X Memory',
        effect: 'X é o custo pago [mín.1, máx.3]. Aumenta o dano dos ataques em +X, mas o Digimon se torna o último na ordem de turnos e não pode mudar sua posição. Dura 3 Rounds.' },
      { type: 'action', keyword: 'Domain of Logic', title: 'Rat Gambit',
        target: '1 Aliado', custo: '-2 Memory',
        effect: 'Diminui a dificuldade mínima para sucesso para 6 e reduz -3 dados das rolagens do aliado escolhido. Ambos os efeitos duram 3 Rounds.' },
      { type: 'action', keyword: 'Domain of Logic', title: 'Black Book: Throw-Up',
        target: '1 Digimon Aliado', custo: '-1 Memory',
        effect: 'Aplica 1 carga de [Haste] no Digimon escolhido.' },
      { type: 'action', keyword: 'Domain of Logic', title: 'Logic Memory Boost',
        target: 'Kumo + 2 Humanos Aliados', custo: '-3 Memory',
        effect: 'Não pode ser usado fora de combate. Ativa uma Skill de Kumo com "Graffiti" no nome sem pagar o custo, então entra em [Delay]; ao sair do [Delay], Memory +2 para Kumo e os aliados escolhidos.' },
      { type: 'passive', keyword: 'Domain of Logic', title: 'Intangible Asset: Rivalrous',
        effect: 'No início do Round, caso haja pelo menos 1 inimigo afetado por uma Condição Negativa causada por Kumo ou aliados, Memory +1 para Kumo e todos os aliados dentro do Domain.' },
      { type: 'passive', keyword: 'Domain of Logic', title: 'Intangible Asset: Goodwill',
        effect: 'No início do Round, caso haja pelo menos 1 aliado afetado por uma Condição Negativa causada por um inimigo, Memory +1 para Kumo e todos os aliados dentro do Domain.' },
      { type: 'passive', keyword: 'Domain of Logic', title: 'Co-Sign Asset',
        effect: 'No início do Round, Kumo escolhe um aliado com 4 ou mais de Memory e aplica 1 carga de [Haste] nele. Só 1 aliado afetado por vez.' },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-hyokomon-line',
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  HIBITO AKUGETSU  —  blue (id separado de Kanade)           ║
  // ╚══════════════════════════════════════════════════════════════╝

  const hibitoAttrs: Attributes = {
    Inteligência: 4, Força: 2, Presença: 2,
    Raciocínio: 3, Destreza: 4, Manipulação: 2,
    Perseverança: 1, Vigor: 2, Autocontrole: 2,
  };

  const hibito: Tamer = {
    id: 't-hibito',
    name: 'HIBITO', surname: 'Akugetsu',
    portrait: 'blue', image: null,
    age: 14, height: 161,
    sign: 'Câncer', birthday: '4 de Julho',
    voice: 'Chiwa Saito',
    tagline: 'Domain of Oblivion.',
    xp: 80, xpSpent: 0,
    status: {
      HP:       { v: 7, max: 7 },
      Memory:   { v: 3, max: 10 },
      Digisoul: { v: 3, max: 3 },
      Deslocamento: 11,
      Autoridade: 0,
      Iniciativa: 7,
    },
    attributes: hibitoAttrs,
    skills: {
      Mental: { Investigação: 2, Construção: 2, 'E.G.': 3, 'P.S.': 0, Folclore: 0, Ciência: 3, Notívago: 1 },
      Físico: { Briga: 1, Atletismo: 1, Sobrevivência: 4, Furtividade: 2, Culinária: 0, Limpeza: 0, Esquiva: 2 },
      Social: { Intimidação: 1, Persuasão: 0, Socializar: 0, Expressão: 0, Empatia: 0, Subterfúgio: 3, Sorte: 3 },
    },
    tamerSkills: [
      { type: 'action', keyword: 'Domain', title: 'Domain of Oblivion', custo: 'Nenhum',
        effect: 'Ativa o Domain de Hibito e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.' },
      { type: 'action', keyword: 'Jogress', title: 'Jogress: Sky & Oblivion', custo: 'Nenhum',
        effect: 'Requerimento: [Domain of Sky] + [Domain of Oblivion]. Tanto Hibito quanto Hare podem ativar essa Skill. Escolha uma Skill Passiva que recupere Memory de cada Domain. As Skills escolhidas são herdadas pelo [Domain of Time]. Em seguida, ative o [Domain of Time].' },
      { type: 'action', keyword: 'Domain of Oblivion', title: 'Mark of Persecution',
        target: '1 Inimigo', custo: '-2 Memory', dados: 'Inteligência + Intimidação',
        effect: 'Marca o inimigo. Pelos próximos 3 Rounds, toda vez que o inimigo marcado for atingido consecutivamente por aliados de Hibito, o próximo atacante recebe [Security Attack +X] (X = hits consecutivos, máx.3). Se a sequência for quebrada, a Skill é desativada.' },
      { type: 'action', keyword: 'Domain of Oblivion', title: 'Traumae',
        target: 'Hibito ou 1 Aliado', custo: '-2 Memory',
        effect: 'Pode ser usado como reação a ataques Físicos. Reduz dano Físico recebido em -1 (humanos: -2). Caso o ataque seja fatal, o aliado pode rolar 2d10; com 1+ sucesso, sobrevive com 1 HP. Dura 2 Rounds em Hibito/Ghostmon, 1 Round nos demais.' },
      { type: 'action', keyword: 'Domain of Oblivion', title: 'Memory Drain',
        target: '1~2 Inimigos com 1+ de Memory', custo: '-1 Memory', dados: 'Destreza + Subterfúgio',
        effect: 'Rouba Memory de até 2 inimigos conforme o número de sucessos, máximo de 3 por inimigo.' },
      { type: 'action', keyword: 'Domain of Oblivion', title: 'Rebellion',
        target: 'Todos os Digimons aliados', custo: '-3 Memory',
        effect: 'Dá +2 sucessos em rolagens de ataque para todos os Digimons aliados. Ao final do Round, caso algum não tenha causado dano, reduz o HP dele em -25% do MAXHP. Dura 3 Rounds.' },
      { type: 'action', keyword: 'Domain of Oblivion', title: 'Build Up',
        target: '1 Digimon Aliado', custo: '-2 Memory',
        effect: 'Aumenta o MAXHP do Digimon em +15% e cura essa quantidade. O Digimon ganha Iniciativa +1 (Ghostmon: +2). O HP dura 5 Rounds, a Iniciativa dura 3 e só funciona a partir do próximo Round.' },
      { type: 'action', keyword: 'Domain of Oblivion', title: 'Oblivion Memory Boost',
        target: 'Hibito + 2 Humanos Aliados', custo: '-3 Memory',
        effect: 'Não pode ser usado fora de combate. Aplica 6 cargas de [Burn] a um personagem à escolha de Hibito, então entra em [Delay]; ao sair do [Delay], Memory +2 para Hibito e os aliados escolhidos.' },
      { type: 'passive', keyword: 'Domain of Oblivion', title: 'An Eye for an Eye',
        effect: 'No início do Round, se um inimigo sofreu dano no Round anterior por meio de um ataque, Memory +1 para Hibito e todos os aliados dentro do Domain.' },
      { type: 'passive', keyword: 'Domain of Oblivion', title: 'A Tooth for a Tooth',
        effect: 'No início do Round, se um Digimon aliado sofreu dano no Round anterior por meio de um ataque, Memory +1 para Hibito e todos os aliados dentro do Domain.' },
      { type: 'action', keyword: 'Domain of Time', title: 'Soul Ablaze',
        target: '1 Aliado', custo: '-1 Memory',
        effect: 'Invoca 1 [Silhouette Token] adjacente ao aliado escolhido. Se o número de Silhouette Tokens em campo chegar a 3, Memory +1 para o aliado. Se o aliado for humano ou Digimon com "Sistermon" no nome, o Token ganha 1 carga de [Reboot].' },
      { type: 'action', keyword: 'Domain of Time', title: 'Wheel of Time', custo: '-3 Memory',
        effect: 'Todos os [Silhouette Tokens] fazem um ataque (Ação Livre, sem alvo válido necessário). Os ataques entram em [Delay]; ao resolver, o dano é dobrado e o alcance aumenta para 6 metros. Após os ataques, todos os Tokens são deletados.' },
      { type: 'passive', keyword: 'Domain of Time', title: 'Twilight Memories',
        effect: 'Durante o seu turno, Hibito pode invocar 1 [Silhouette Token] adjacente a ele como Ação Livre. Se o clima for [Intense Sunlight], pode criar 1 Token extra. Máximo de 3 Silhouette Tokens em campo.' },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-ghostmon-line',
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  EMI CHOUHOU'IN  —  rose                                    ║
  // ╚══════════════════════════════════════════════════════════════╝

  const emiAttrs: Attributes = {
    Inteligência: 1, Força: 2, Presença: 3,
    Raciocínio: 3, Destreza: 2, Manipulação: 3,
    Perseverança: 3, Vigor: 2, Autocontrole: 2,
  };

  const emi: Tamer = {
    id: 't-emi',
    name: 'EMI', surname: "Chouhou'in",
    portrait: 'rose', image: null,
    age: 18, height: 161,
    sign: 'Escorpião', birthday: '13 de Novembro',
    voice: 'Shion Wakayama',
    tagline: 'Domain of Emotion.',
    xp: 86, xpSpent: 0,
    status: {
      HP:       { v: 7, max: 7 },
      Memory:   { v: 3, max: 10 },
      Digisoul: { v: 5, max: 5 },
      Deslocamento: 9,
      Autoridade: 0,
      Iniciativa: 5,
    },
    attributes: emiAttrs,
    skills: {
      Mental: { Investigação: 0, Construção: 0, 'E.G.': 1, 'P.S.': 0, Folclore: 1, Ciência: 1, Notívago: 4 },
      Físico: { Briga: 0, Atletismo: 1, Sobrevivência: 0, Furtividade: 0, Culinária: 1, Limpeza: 1, Esquiva: 1 },
      Social: { Intimidação: 0, Persuasão: 4, Socializar: 2, Expressão: 0, Empatia: 3, Subterfúgio: 2, Sorte: 0 },
    },
    tamerSkills: [
      { type: 'action', keyword: 'Domain', title: 'Domain of Emotion', custo: 'Nenhum',
        effect: 'Ativa o Domain de Emi e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques. Caso Shinra esteja próximo do Domain de Emi, ele poderá ativar [The Boy who took the Sword] mesmo que o Domain dele não esteja ativo.' },
      { type: 'action', keyword: 'Domain of Emotion', title: 'Cupid Arrow',
        target: '1 Aliado', custo: '-1 Memory',
        effect: 'Pode ser ativado durante qualquer momento do turno de um aliado. Emi escolhe uma Skill do aliado que custe 2+ de Memory e a coloca em [Cooldown: 2]; em troca, o aliado recebe Memory +1.' },
      { type: 'action', keyword: 'Domain of Emotion', title: 'Eye of Envy',
        target: '1 Inimigo', custo: '-X Memory',
        effect: 'Emi copia uma Skill do tipo [Ação] do inimigo que ela já tenha informações e a usa, pagando o custo conforme descrito na Skill copiada.' },
      { type: 'action', keyword: 'Domain of Emotion', title: 'To the Most Beautiful',
        target: '1 Digimon aliado', custo: '-2 Memory',
        effect: 'Pelos próximos 3 Rounds, toda vez que o Digimon atacar um inimigo com mais Defesa que ele, recebe [Security Attack +1] e Defesa +1 (stack até 3x). Some quando a Skill desativar.' },
      { type: 'action', keyword: 'Domain of Emotion', title: 'Love at First Sight',
        target: '1 Inimigo (1ª vez vendo Emi)', custo: '-2 Memory', dados: 'Presença + Persuasão',
        effect: 'Aplica 1 carga de [Charm].' },
      { type: 'action', keyword: 'Domain of Emotion', title: 'Aggravating Heart',
        target: '1 Aliado', custo: '-2 Memory',
        effect: 'Escolhe uma Skill de Emi em [Cooldown] e aumenta +X dados nas rolagens de ataque do aliado (X = número do Cooldown atual). Quando o Cooldown acabar, o efeito é desativado. Só 1 aliado afetado por vez.' },
      { type: 'action', keyword: 'Domain of Emotion', title: 'Emotion Memory Boost',
        target: "Emi + 2 aliados afetados por [Emi's Beloved] no Round anterior", custo: '-3 Memory',
        effect: 'Não pode ser usado fora de combate. Custa 1 de Memory se houver inimigo com [Charm]. Entra em [Delay]; ao sair do [Delay], Memory +2 para Emi e os aliados escolhidos.' },
      { type: 'passive', keyword: 'Domain of Emotion', title: "Emi's Beloved",
        effect: 'No início do Round, escolha Filhos de Marte (masculino) ou Filhas de Vênus (feminino). Se o grupo escolhido for maior que o outro, Memory +1 para todos do grupo escolhido dentro do Domain. Se Emi fizer parte do grupo, Memory +1 extra para ela também.' },
      { type: 'passive', keyword: 'Domain of Emotion', title: 'Longing',
        effect: 'Quando Emi ou aliados causarem 15+ dano no Round, Emi pode reduzir o custo de 1 Skill em -1. Quando o HP de um inimigo for a 0, Emi pode reduzir o custo de 1 Skill para 0. Máximo de 2 Skills afetadas. Após usar, a Skill ganha [Cooldown: 3].' },
    ] as TamerSkill[],
    inventory:   [],
    digimonId: 'd-betamon-line',
  };

  // ── Toy Agumon / Omekamon / Yoyomon (Hare) ────────────────────────────────
  // HP = haireHP(8)+5 = 13; Omekamon = 13+5 = 18
  const toyAgumonLine: DigimonLine = {
    id: 'd-toyagumon-line',
    tamerId: 't-hare',
    name: 'Toy Agumon Line',
    sectors: [], image: null,
    currentStage: 1,
    line: '??? ↔ Toy Agumon (Child) / Yoyomon (Armor) ↔ Omekamon ↔ ??? ↔ ???',
    stages: [
      { stageName: '???', level: 'In-Training (Lvl 2)', cost: '0', type: '???', portrait: 'orange', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...hareAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: 'Toy Agumon', level: 'Child (Lvl 3)', cost: '0', type: 'Puppet', portrait: 'orange', size: 3, speed: 5, locked: false,
        status: { HP: 18, Deslocamento: 9, Iniciativa: 5, Defesa: 2, Armadura: 0 }, attributes: { ...hareAttrs },
        weakness: { 'Letal (+2)': 'Vírus', 'Agravado (+3)': 'Água, Enfraquecer', 'Resistente (-2)': 'Vacina' },
        affinity: { Fogo: 1, Luz: 1, Físico: 1, Enfraquecer: 5, Resistência: 2 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Toy Flame', alcance: 'projétil 8m', custo: 'Nenhum', dados: 'Destreza + Fogo', effect: 'Nenhum.' },
          { type: 'action', keyword: 'Ataque', title: 'Fancy Star', alcance: 'projétil 5m', custo: 'Nenhum', dados: 'Perseverança + Luz', effect: 'Nenhum.' },
          { type: 'action', keyword: 'Ataque', title: 'Block Punch', alcance: 'corpo a corpo 1m', custo: 'Nenhum', dados: 'Força + Físico', effect: 'Nenhum.' },
          {
            type: 'passive', keyword: 'Passiva', title: 'Sturdy',
            effect: 'ToyAgumon recebe +5 de HP.',
            alwaysOn: { statusBonus: { HP: 5 }, inheritable: true },
          },
        ] as DigimonSkill[] },
      { stageName: 'Omekamon', level: 'Adult (Lvl 4)', cost: '-2 Memory', type: 'Puppet', portrait: 'orange', size: 3, speed: 5, locked: false,
        status: { HP: 18, Deslocamento: 9, Iniciativa: 5, Defesa: 3, Armadura: 0 }, attributes: { ...hareAttrs },
        weakness: { 'Letal (+2)': 'Vírus', 'Agravado (+3)': 'Enfraquecer, Físico', 'Resistente (-2)': 'Vacina, Fogo, Luz' },
        affinity: { Fogo: 1, Luz: 1, Físico: 2, Enfraquecer: 6, Resistência: 2 },
        skills: [
          { type: 'action', keyword: 'Efeito', title: "Poe's Law", custo: '-3 Memory', dados: 'Presença + Enfraquecer',
            effect: 'Até o final do Round, Omekamon é tratado como [Omegamon / Vacina / Ultimate (Lvl.6) / Holy Knight]. Inimigos Lvl 3 ou menos perdem seus turnos; Lvl 4 podem resistir (rolagem). Lvl 5+ são imunes.' },
          { type: 'action', keyword: 'Ataque', title: 'Omeka Kick', alcance: 'corpo a corpo 1m', custo: 'Nenhum', dados: 'Força + Físico + 3d10', effect: 'Nenhum.' },
          { type: 'action', keyword: 'Ataque', title: 'RKGK Rocket', alcance: 'projétil 5m', custo: '-2 Memory', dados: 'Destreza + Enfraquecer + 2d10', effect: 'Aplica 1 carga de [Rage] no inimigo atingido.' },
        ] as DigimonSkill[] },
      { stageName: 'Yoyomon', level: 'Armor (Lvl 4)', cost: '[Weather Digimental] / Duração: efeito "Day" atual', type: 'Puppet', portrait: 'orange', size: 3, speed: 5, locked: false,
        status: { HP: 18, Deslocamento: 9, Iniciativa: 5, Defesa: 3, Armadura: 0 }, attributes: { ...hareAttrs },
        weakness: { 'Agravado (+3)': 'Trevas, Água, Gelo' },
        affinity: { Fogo: 1, Luz: 1, Físico: 3, Enfraquecer: 5, Resistência: 2 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Torpedo Crossing', alcance: 'corpo a corpo 3m', custo: '-1 Digimental', dados: '[Poder] + Físico',
            effect: 'Após o ataque, mesmo que erre, Yoyomon pode se reposicionar de acordo com o alcance da Skill.' },
          { type: 'action', keyword: 'Ataque', title: 'One-Hand Swing', alcance: 'corpo a corpo 2m', custo: '-2 Digimental', dados: '[Poder] + Físico + 3d10',
            effect: 'Consegue atingir alvos sob [Flight].' },
          { type: 'passive', keyword: 'Passiva', title: 'Armor Evolution',
            effect: 'Yoyomon ganha uma nova barra [Digimental]. No início de cada turno, perde 1 de Digimental.' },
          { type: 'passive', keyword: 'Passiva', title: 'Climate Armor: Sunny Day',
            effect: 'O primeiro efeito de [Intense Sunlight] afeta todas as ações de Yoyomon, independente das condições. Yoyomon é imune a efeitos negativos de climas comuns.' },
          { type: 'passive', keyword: 'Passiva', title: 'Sharp Look',
            effect: 'Assim que Yoyomon entrar na batalha, Hare pode imediatamente usar [Goggle Girl] como ação livre sem pagar o custo.' },
        ] as DigimonSkill[] },
      { stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory', type: '???', portrait: 'orange', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...hareAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory', type: '???', portrait: 'orange', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...hareAttrs }, weakness: {}, affinity: {}, skills: [] },
    ],
  };

  // ── Penmon / Swanmon (Kanade) ───────────────────────────────────────────────
  const penmonLine: DigimonLine = {
    id: 'd-penmon-line', tamerId: 't-kanade', name: 'Penmon Line',
    sectors: [], image: null, currentStage: 1,
    line: '??? ↔ Penmon ↔ Swanmon ↔ ??? ↔ ???',
    stages: [
      { stageName: '???', level: 'In-Training (Lvl 2)', cost: '0', type: '???', portrait: 'wheat', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...kanadeAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: 'Penmon', level: 'Child (Lvl 3)', cost: '0', type: 'Bird', portrait: 'wheat', size: 3, speed: 5, locked: false,
        status: { HP: 13, Deslocamento: 10, Iniciativa: 6, Defesa: 3, Armadura: 0 }, attributes: { ...kanadeAttrs },
        weakness: { 'Letal (+2)': 'Data', 'Agravado (+3)': 'Fogo, Madeira', 'Resistente (-2)': 'Vírus' },
        affinity: { Gelo: 3, Físico: 3, Resistência: 3 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Slide Attack', alcance: 'corpo a corpo 3m', custo: '-1 Memory', dados: 'Deslocamento',
            effect: 'Se a afinidade Físico de Penmon for menor que 3, reduz -3 dados da rolagem.' },
          { type: 'action', keyword: 'Ataque', title: 'Ice Prism', alcance: 'projétil 5m', custo: 'Nenhum', dados: 'Inteligência + Gelo', effect: 'Nenhum.' },
        ] as DigimonSkill[] },
      { stageName: 'Swanmon', level: 'Adult (Lvl 4)', cost: '-2 Memory', type: 'Bird', portrait: 'wheat', size: 3, speed: 5, locked: false,
        status: { HP: 18, Deslocamento: 10, Iniciativa: 6, Defesa: 4, Armadura: 0 }, attributes: { ...kanadeAttrs },
        weakness: { 'Letal (+2)': 'Data', 'Agravado (+3)': 'Fogo, Terra', 'Resistente (-2)': 'Vírus, Gelo, Vento' },
        affinity: { Vento: 1, Gelo: 4, Físico: 3, Resistência: 3 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Down Tornado', alcance: 'projétil 8m', custo: 'Nenhum', dados: 'Destreza + Gelo + Vento', effect: 'Nenhum.' },
          { type: 'action', keyword: 'Efeito', title: 'White Marie', target: 'Kanade', custo: '-2 Memory',
            effect: 'Cooldown: 5 Turnos. Kanade ganha 3 cargas de [Flight]; enquanto tiver essas cargas, toda vez que curar HP de um aliado, as penas de suas asas atacam 1 inimigo no alcance do Deslocamento; dano = metade da cura. Dura 3 Rounds.' },
          { type: 'passive', keyword: 'Passiva', title: 'White Wings',
            effect: 'Swanmon tem cargas infinitas de [Flight]. Caso seja derrubada, pode voltar a voar como Ação Livre. Swanmon pode carregar 1 acompanhante em suas costas.' },
        ] as DigimonSkill[] },

      { stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory', type: '???', portrait: 'wheat', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...kanadeAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory', type: '???', portrait: 'wheat', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...kanadeAttrs }, weakness: {}, affinity: {}, skills: [] },
    ],
  };

  // ── Floramon / Coatlmon (Shinra) ────────────────────────────────────────────
  const floramonLine: DigimonLine = {
    id: 'd-floramon-line', tamerId: 't-shinra', name: 'Floramon Line',
    sectors: [], image: null, currentStage: 1,
    line: '??? ↔ Floramon ↔ Coatlmon ↔ ??? ↔ ???',
    stages: [
      { stageName: '???', level: 'In-Training (Lvl 2)', cost: '0', type: '???', portrait: 'green', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...shinraAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: 'Floramon', level: 'Child (Lvl 3)', cost: '0', type: 'Plant', portrait: 'green', size: 3, speed: 5, locked: false,
        status: { HP: 13, Deslocamento: 10, Iniciativa: 5, Defesa: 2, Armadura: 0 }, attributes: { ...shinraAttrs },
        weakness: { 'Letal (+2)': 'Vírus', 'Agravado (+3)': 'Fogo, Vento', 'Resistente (-2)': 'Vacina' },
        affinity: { Enfraquecer: 5, Resistência: 1 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Poison Ivy', alcance: 'corpo a corpo 3m', custo: '-2 Memory', dados: 'Força + Enfraquecer',
            effect: 'Aplica 8 cargas de [Poison] no inimigo atingido.' },
          { type: 'action', keyword: 'Efeito', title: 'Sweet Scent', alcance: 'projétil 10m', custo: '-3 Memory', dados: 'Presença + Enfraquecer',
            effect: 'Cooldown: 3 Turnos. [Blast 1]. Aplica 1 carga de [Charm] em todos os inimigos atingidos.' },
        ] as DigimonSkill[] },
      { stageName: 'Coatlmon', level: 'Adult (Lvl 4)', cost: '-2 Memory', type: 'Mythical Beast', portrait: 'green', size: 3, speed: 5, locked: false,
        status: { HP: 18, Deslocamento: 10, Iniciativa: 5, Defesa: 3, Armadura: 0 }, attributes: { ...shinraAttrs },
        weakness: { 'Letal (+2)': 'Vírus', 'Agravado (+3)': 'Trevas, Trovão', 'Resistente (-2)': 'Vacina, Vento, Terra', 'Imune': 'Charm' },
        affinity: { Vento: 1, Terra: 1, Enfraquecer: 5, Resistência: 1 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Toltecan Wind', alcance: 'projétil 10m', custo: '-2 Memory', dados: 'Força + Vento + 3d10',
            effect: '[Blast 2]. Inimigos atingidos são forçados a mover 3 quadrados para trás.' },
          { type: 'action', keyword: 'Ataque', title: 'Fossil Wave', alcance: 'projétil 8m', custo: '-2 Memory', dados: 'Força + Terra + 3d10',
            effect: 'Custa 0 caso o alvo tenha [Bind]. Aplica 1 carga de [Bind] no inimigo se não tiver; se já tiver, o ataque ganha +3d10.' },
          { type: 'passive', keyword: 'Passiva', title: 'In the Garden where Love Blooms',
            effect: 'Coatlmon é imune a [Charm]. Quando um inimigo aplicar [Charm] em 1 aliado, Coatlmon pode gastar sua ação do turno para negar o efeito (1x por Round).' },
          { type: 'passive', keyword: 'Passiva', title: 'White-Winged Snake',
            effect: 'Coatlmon tem cargas infinitas de [Flight]. Caso seja derrubada, pode voltar a voar como Ação Livre.' },
        ] as DigimonSkill[] },

      { stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory', type: '???', portrait: 'green', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...shinraAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory', type: '???', portrait: 'green', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...shinraAttrs }, weakness: {}, affinity: {}, skills: [] },
    ],
  };

  // ── Hyokomon (Kumo) — Adult não revelado ────────────────────────────────────
  const hyokomonLine: DigimonLine = {
    id: 'd-hyokomon-line', tamerId: 't-kumo', name: 'Hyokomon Line',
    sectors: [], image: null, currentStage: 1,
    line: '??? ↔ Hyokomon ↔ ??? ↔ ??? ↔ ???',
    stages: [
      { stageName: '???', level: 'In-Training (Lvl 2)', cost: '0', type: '???', portrait: 'indigo', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...kumoAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: 'Hyokomon', level: 'Child (Lvl 3)', cost: '0', type: 'Chick', portrait: 'indigo', size: 3, speed: 5, locked: false,
        status: { HP: 12, Deslocamento: 10, Iniciativa: 9, Defesa: 3, Armadura: 0 }, attributes: { ...kumoAttrs },
        weakness: { 'Letal (+2)': 'Data', 'Agravado (+3)': 'Enfraquecer, Trevas', 'Resistente (-2)': 'Vírus' },
        affinity: { Físico: 4 },
        skills: [
          { type: 'reaction', keyword: 'Reação', title: 'Karatakewari', alcance: 'corpo a corpo 1m', custo: '-1 Memory', dados: 'Destreza + Físico',
            effect: 'Quando Hyokomon for alvo de ataque corpo a corpo, pode ativar essa Skill. Se os sucessos dessa Skill forem maiores que a rolagem de ataque do inimigo, cancela o ataque.' },
          { type: 'action', keyword: 'Ataque', title: 'Hiken: Piyopiyo Giri', alcance: 'corpo a corpo 1m', custo: 'Nenhum', dados: 'Destreza + Físico', effect: 'Nenhum.' },
        ] as DigimonSkill[] },
      { stageName: '???', level: 'Adult (Lvl 4)', cost: '-2 Memory', type: '???', portrait: 'indigo', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...kumoAttrs }, weakness: {}, affinity: {}, skills: [] },

      { stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory', type: '???', portrait: 'indigo', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...kumoAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory', type: '???', portrait: 'indigo', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...kumoAttrs }, weakness: {}, affinity: {}, skills: [] },
    ],
  };

  // ── Ghostmon / Fla Wizarmon (Hibito) ────────────────────────────────────────
  const ghostmonLine: DigimonLine = {
    id: 'd-ghostmon-line', tamerId: 't-hibito', name: 'Ghostmon Line',
    sectors: [], image: null, currentStage: 1,
    line: '??? ↔ Ghostmon ↔ Fla Wizarmon ↔ ??? ↔ ???',
    stages: [
      { stageName: '???', level: 'In-Training (Lvl 2)', cost: '0', type: '???', portrait: 'blue', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...hibitoAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: 'Ghostmon', level: 'Child (Lvl 3)', cost: '0', type: 'Ghost', portrait: 'blue', size: 3, speed: 5, locked: false,
        status: { HP: 12, Deslocamento: 11, Iniciativa: 7, Defesa: 3, Armadura: 0 }, attributes: { ...hibitoAttrs },
        weakness: { 'Letal (+2)': 'Vacina', 'Agravado (+3)': 'Água, Gelo', 'Resistente (-2)': 'Data' },
        affinity: { Luz: 2, Trevas: 1, Resistência: 1 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Little Plasma', alcance: 'projétil 5m', custo: 'Nenhum', dados: 'Inteligência + Luz', effect: 'Nenhum.' },
          { type: 'action', keyword: 'Ataque', title: 'Jack Raid', alcance: 'corpo a corpo 1m', custo: '-2 Memory', dados: 'Força + Trevas',
            effect: 'Entra em [Delay] ao ser usado. Enquanto com essa Skill em [Delay], Ghostmon tem 1 carga de [Phantasm].' },
          { type: 'passive', keyword: 'Passiva', title: 'Levitate',
            effect: 'Ghostmon tem cargas infinitas de [Flight]. Caso seja derrubado, pode voltar a voar como Ação Livre.' },
          { type: 'passive', keyword: 'Passiva', title: "Will-o'-the-Wisp",
            effect: 'Altera o efeito de [Burn] para que recupere o HP do alvo ao invés de reduzir.' },
        ] as DigimonSkill[] },
      { stageName: 'Fla Wizarmon', level: 'Adult (Lvl 4)', cost: '-2 Memory', type: 'Demon Man', portrait: 'blue', size: 3, speed: 5, locked: false,
        status: { HP: 17, Deslocamento: 11, Iniciativa: 7, Defesa: 4, Armadura: 0 }, attributes: { ...hibitoAttrs },
        weakness: { 'Letal (+2)': 'Vacina', 'Agravado (+3)': 'Água, Terra', 'Resistente (-2)': 'Data, Fogo, Trevas' },
        affinity: { Fogo: 2, Luz: 2, Trevas: 1, Resistência: 1 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Magic Ignition', alcance: 'projétil 5m', custo: 'Nenhum', dados: 'Inteligência + Fogo + 2d10',
            effect: 'Se esse ataque errar, causa 2 de dano no alvo.' },
          { type: 'action', keyword: 'Efeito', title: 'Fire Cloud', custo: '-2 Memory',
            effect: 'Pode ser colocado em [Delay] ao ativar. Muda o clima para [Intense Sunlight] durante 3 Rounds. Se o clima já for [Intense Sunlight], muda para: Projétil 10m, [Blast 1], aplica 2 + X cargas de [Burn] em todos na área (X = sucessos em Raciocínio + Fogo).' },
          { type: 'passive', keyword: 'Passiva', title: 'Fire Sorcery',
            effect: 'Quando cargas de [Burn] forem ser aplicadas em Fla Wizarmon, pode redirecionar para um de seus dois fósforos (se o fósforo não tiver cargas). Cargas nos fósforos não contam para o relógio. Ao usar ataque com [Fogo] ou [Intense Sunlight] no texto, pode gastar todas as cargas de um fósforo para reduzir o custo em -1 ou aumentar a rolagem em +2 dados.' },
        ] as DigimonSkill[] },

      { stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory', type: '???', portrait: 'blue', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...hibitoAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory', type: '???', portrait: 'blue', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...hibitoAttrs }, weakness: {}, affinity: {}, skills: [] },
    ],
  };

  // ── Betamon / Coelamon (Emi) ────────────────────────────────────────────────
  const betamonLine: DigimonLine = {
    id: 'd-betamon-line', tamerId: 't-emi', name: 'Betamon Line',
    sectors: [], image: null, currentStage: 1,
    line: '??? ↔ Betamon ↔ Coelamon ↔ ??? ↔ ???',
    stages: [
      { stageName: '???', level: 'In-Training (Lvl 2)', cost: '0', type: '???', portrait: 'rose', size: 1, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...emiAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: 'Betamon', level: 'Child (Lvl 3)', cost: '0', type: 'Amphibian', portrait: 'rose', size: 3, speed: 5, locked: false,
        status: { HP: 12, Deslocamento: 9, Iniciativa: 5, Defesa: 2, Armadura: 0 }, attributes: { ...emiAttrs },
        weakness: { 'Letal (+2)': 'Vacina', 'Agravado (+3)': 'Terra, Madeira', 'Resistente (-2)': 'Data' },
        affinity: { Água: 1, Trovão: 2, Físico: 5, Resistência: 2 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Dengeki Biririn', alcance: 'corpo a corpo 1m', custo: 'Nenhum', dados: 'Força + Trovão',
            effect: 'Aplica 1 carga de [Paralysis] no inimigo atingido.' },
          { type: 'action', keyword: 'Ataque', title: 'Cutter Fin', alcance: 'corpo a corpo 2m', custo: 'Nenhum', dados: 'Força + Físico',
            effect: '[Jamming]. Pode escolher alvos sob [Flight]. Se o alvo estiver sob [Flight], o ataque recebe +2d10.' },
          { type: 'passive', keyword: 'Passiva', title: 'Amphibian',
            effect: 'Betamon ganha +1 de afinidade com Água. Na água: Defesa +1, Deslocamento +5, ignora obstáculos.' },
        ] as DigimonSkill[] },
      { stageName: 'Coelamon', level: 'Adult (Lvl 4)', cost: '-2 Memory', type: 'Ancient Fish', portrait: 'rose', size: 3, speed: 5, locked: false,
        status: { HP: 17, Deslocamento: 9, Iniciativa: 5, Defesa: 3, Armadura: 0 }, attributes: { ...emiAttrs },
        weakness: { 'Letal (+2)': 'Vacina', 'Agravado (+3)': 'Trovão, Madeira', 'Resistente (-2)': 'Data, Água, Físico' },
        affinity: { Água: 3, Trovão: 2, Físico: 6, Resistência: 2 },
        skills: [
          { type: 'action', keyword: 'Ataque', title: 'Destructive Spear', alcance: 'projétil 8m', custo: '-2 Memory', dados: 'Força + Água + 3d10',
            effect: 'Se atingir um inimigo de nível inferior ao de Coelamon, Memory +1.' },
          { type: 'action', keyword: 'Ataque', title: 'Variable Darts', alcance: 'corpo a corpo 3m', custo: '-1 Memory', dados: 'Força + Físico + 2d10',
            effect: 'Pode usar ação livre para colocar em [Cooldown: 2]; se fizer isso, Coelamon ganha [Blocker]. Consegue atingir inimigos sob [Flight].' },
          { type: 'passive', keyword: 'Passiva', title: 'From the Net Ocean',
            effect: 'Coelamon tem +2 de afinidade à Água. Na água: Defesa +3, Deslocamento +5, ignora obstáculos. Ao sair da água no seu turno, faz ação de movimento imediata; se ficar adjacente a um inimigo, ganha 1 carga de [Unsuspend].' },
        ] as DigimonSkill[] },

      { stageName: '???', level: 'Perfect (Lvl 5)', cost: '-3 Memory', type: '???', portrait: 'rose', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...emiAttrs }, weakness: {}, affinity: {}, skills: [] },
      { stageName: '???', level: 'Ultimate (Lvl 6)', cost: '-3 Memory', type: '???', portrait: 'rose', size: 3, speed: 5, locked: true,
        status: { HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 }, attributes: { ...emiAttrs }, weakness: {}, affinity: {}, skills: [] },
    ],
  };

  // ── Pastas de Setor (CRUD) ─────────────────────────────────────────────────
  const defaultSectors: SectorFolder[] = [
    { n: 1, name: 'Kuwaga',    bioma: 'Bosque',   color: 'sage'   },
    { n: 2, name: 'Sisters',   bioma: 'Pradaria', color: 'wheat'  },
    { n: 3, name: '—',         bioma: 'Castelo',  color: 'rose'   },
    { n: 4, name: 'Dark Area', bioma: '—',        color: 'indigo' },
    { n: 5, name: 'Heaven',    bioma: '—',        color: 'gold'   },
  ];

  // ── Pastas de BUG (CRUD) ────────────────────────────────────────────────────
  const defaultBugFolders: BugFolder[] = [
    { cls: 'ledo', color: 'red'   },
    { cls: 'chi',  color: 'green' },
    { cls: 'haru', color: 'white' },
  ];

  // ── Bestiário Selvagem — Setor 2: Sisters ───────────────────────────────────

  const greymon = makeWildDigimon('d-greymon', 'Greymon', 'Adult (Lvl 4)', 'Dinosaur', 'orange', [2],
    'Koromon ↔ ??? ↔ Greymon ↔ ??? ↔ ???');
  greymon.stages[0].attributes = { Inteligência:2,Força:6,Presença:6,Raciocínio:2,Destreza:4,Manipulação:1,Perseverança:6,Vigor:6,Autocontrole:1 };
  greymon.stages[0].status = { HP:30,Deslocamento:16,Iniciativa:5,Defesa:3,Armadura:1 };
  greymon.stages[0].affinity = { Fogo:3,Físico:2 };
  greymon.stages[0].weakness = { 'Letal (+2)':'Vacina','Agravado (+3)':'Água, Gelo','Resistente (-2)':'Data, Fogo' };
  greymon.stages[0].skills = [
    { type:'action',keyword:'Ataque',title:'Mega Flame',alcance:'projétil 8m',custo:'-2 Memory',dados:'Vigor + Fogo + 2d10',effect:'Aplica 4 cargas de [Burn] no inimigo atingido.' },
    { type:'action',keyword:'Ataque',title:'Blaster Tail',alcance:'corpo a corpo 2m',custo:'-2 Memory',dados:'Força + Físico + 3d10',effect:'[Blast 1].' },
    { type:'action',keyword:'Ataque',title:'Horn Strike',alcance:'corpo a corpo 1m',custo:'Nenhum',dados:'Força + Físico',effect:'Nenhum.' },
    { type:'passive',keyword:'Passiva',title:'Digital Body +',effect:'Caso seja atacado por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Survive +',effect:'No início do seu turno, HP -2 e Memory +2.' },
    { type:'passive',keyword:'Passiva',title:'Abnormal Fighting Spirit',effect:'+1 sucesso em ataques. Ao causar dano em um inimigo durante o seu turno com um ataque, ganha 1 carga de [Unsuspend]. Esse segundo efeito só pode ser ativado uma vez por Round.' },
  ];

  const picoDevimon = makeWildDigimon('d-pico-devimon', 'Pico Devimon', 'Child (Lvl 3)', 'Small Devil', 'purple', [2],
    '??? ↔ Pico Devimon ↔ ??? ↔ ??? ↔ ???');
  picoDevimon.stages[0].attributes = { Inteligência:3,Força:1,Presença:1,Raciocínio:3,Destreza:3,Manipulação:4,Perseverança:1,Vigor:1,Autocontrole:1 };
  picoDevimon.stages[0].status = { HP:9,Deslocamento:8,Iniciativa:5,Defesa:3,Armadura:0 };
  picoDevimon.stages[0].affinity = { Trevas:3 };
  picoDevimon.stages[0].weakness = { 'Letal (+2)':'Vacina','Agravado (+3)':'Luz, Fogo','Resistente (-2)':'Data, Trevas' };
  picoDevimon.stages[0].skills = [
    { type:'action',keyword:'Ataque',title:'Pico Darts',alcance:'projétil 5m',custo:'-1 Memory',dados:'Destreza + Trevas',effect:'Recupera o HP de Pico Devimon de acordo com a quantidade de dano causado.' },
    { type:'action',keyword:'Efeito',title:"Devil's Whisper",alcance:'projétil 8m',custo:'-2 Memory',dados:'Manipulação + Trevas',effect:'Aplica 1 carga de [Charm] no inimigo escolhido. Se o inimigo escolhido for um Digimon do tipo [Angel] de Nível 4 ou menos, esse efeito é um sucesso automático.' },
    { type:'passive',keyword:'Passiva',title:'Digital Body',effect:'Caso seja atacado por um humano, duplica sua Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Survive',effect:'No início do seu turno, HP -1 e Memory +1.' },
  ];

  const sistermonNoir = makeWildDigimon('d-sistermon-noir', 'Sistermon Noir', 'Adult (Lvl 4)', 'Puppet', 'black', [2],
    '??? ↔ ??? ↔ Sistermon Ciel / Sistermon Noir ↔ ??? ↔ ???');
  sistermonNoir.stages[0].attributes = { Inteligência:4,Força:2,Presença:4,Raciocínio:4,Destreza:6,Manipulação:3,Perseverança:0,Vigor:4,Autocontrole:5 };
  sistermonNoir.stages[0].status = { HP:25,Deslocamento:15,Iniciativa:11,Defesa:5,Armadura:0 };
  sistermonNoir.stages[0].affinity = { Fogo:2,Trevas:3 };
  sistermonNoir.stages[0].weakness = { 'Letal (+2)':'Vacina','Agravado (+3)':'Luz, Fogo','Resistente (-2)':'Data' };
  sistermonNoir.stages[0].skills = [
    { type:'action',keyword:'Ataque',title:'Mickey Bullet',alcance:'projétil 8m',custo:'-1 Memory',dados:'Destreza + Trevas',effect:'Role 1d4 ao ativar essa Skill; X é igual ao número tirado. X inimigos são escolhidos como alvo. Se os dados desse ataque rodarem uma Falha Crítica, mude o alvo para aliados.' },
    { type:'action',keyword:'Ataque',title:'Bless Fire',alcance:'projétil 8m',custo:'-2 Memory',dados:'Destreza + Fogo',effect:'[Piercing]. Atinge todos os personagens que estiverem no caminho da linha desse ataque.' },
    { type:'passive',keyword:'Passiva',title:'Digital Body +',effect:'Caso seja atacada por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Selfless Survive',effect:'No início do turno de Sistermon Noir, ela perde 2 HP. Em seguida, concede Memory +2 para si mesma ou para 1 aliado à sua escolha. Caso o alvo não seja Sistermon Noir, o custo em HP é aumentado em +3.' },
    { type:'passive',keyword:'Passiva',title:'I still believe in you',effect:'Todos os Digimons aliados do tipo [Small Dragon] e do atributo [Data] causam +2 de dano com seus ataques enquanto Noir estiver em batalha.' },
  ];

  const sistermonCiel = makeWildDigimon('d-sistermon-ciel', 'Sistermon Ciel', 'Adult (Lvl 4)', 'Puppet', 'blue', [2],
    '??? ↔ ??? ↔ Sistermon Ciel / Sistermon Noir ↔ ??? ↔ ???');
  sistermonCiel.stages[0].attributes = { Inteligência:4,Força:3,Presença:3,Raciocínio:4,Destreza:6,Manipulação:3,Perseverança:0,Vigor:4,Autocontrole:5 };
  sistermonCiel.stages[0].status = { HP:25,Deslocamento:15,Iniciativa:11,Defesa:5,Armadura:0 };
  sistermonCiel.stages[0].affinity = { Físico:5 };
  sistermonCiel.stages[0].weakness = { 'Letal (+2)':'Vírus','Agravado (+3)':'Fogo, Gelo','Resistente (-2)':'Vacina, Vento' };
  sistermonCiel.stages[0].skills = [
    { type:'action',keyword:'Ataque',title:'Shirotsume Ichimonji-giri',alcance:'corpo a corpo 1m',custo:'-2 Memory',dados:'Destreza + Físico',effect:'Caso esteja acima do inimigo na ordem de turnos, ganha 1 carga de [Phantasm] antes do ataque ser concluído.' },
    { type:'action',keyword:'Ataque',title:'Byakusai',alcance:'projétil 5m',custo:'-1 Memory',dados:'Destreza + Físico',effect:'Divide o dano total causado entre os dois inimigos igualmente. Se não for possível dividir igualmente, Ciel escolhe qual dos dois alvos tomará a maior parte do dano.' },
    { type:'passive',keyword:'Passiva',title:'Digital Body +',effect:'Caso seja atacada por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Survive +',effect:'No início do turno do usuário, HP -2 e Memory +2.' },
    { type:'passive',keyword:'Passiva',title:'Moving On',effect:'Enquanto não houver um Digimon do tipo [Small Dragon] e do atributo [Data] em campo, Memory +1 no início do turno de Ciel.' },
  ];

  const yahiroSaki = makeWildDigimon('d-yahiro-saki', 'Yahiro Saki', 'N/A', 'Illusion, SIGN 02', 'rose', [2],
    'Sem informação');
  yahiroSaki.stages[0].attributes = { Inteligência:6,Força:6,Presença:2,Raciocínio:3,Destreza:3,Manipulação:5,Perseverança:1,Vigor:2,Autocontrole:3 };
  yahiroSaki.stages[0].status = { HP:50,Deslocamento:11,Iniciativa:2,Defesa:7,Armadura:0 };
  yahiroSaki.stages[0].affinity = { Madeira:3,Físico:2 };
  yahiroSaki.stages[0].weakness = { 'Letal (+2)':'Variável','Agravado (+3)':'Fogo, Físico','Resistente (-2)':'Variável','Inefetivo (-3)':'Enfraquecer' };
  yahiroSaki.stages[0].skills = [
    { type:'action',keyword:'Ataque',title:'Sakura Festal',alcance:'projétil 15m',custo:'-1 Memory',dados:'Inteligência + Madeira + 3d10',effect:'Dano fixo: 4. Nenhum efeito adicional.' },
    { type:'action',keyword:'Ataque',title:'Naginata',alcance:'corpo a corpo 2m',custo:'Nenhum',dados:'Força + Físico + 2d10',effect:'Dano fixo: 5. Nenhum efeito adicional.' },
    { type:'action',keyword:'Ataque',title:'Sakura Dance',alcance:'corpo a corpo 3m',custo:'-2 Memory',dados:'Força + Físico + Madeira',effect:'[Blast 2]. Dano fixo: 10.' },
    { type:'action',keyword:'Efeito',title:'Withering',alcance:'projétil 5m',custo:'-1 Memory',dados:'Manipulação + Enfraquecer',effect:'Aplica 6 cargas de [Withering] no alvo. Withering: ao estourar, 5 dano imediato. Pelos 3 Rounds seguintes, no fim do turno do afetado, ele sofre o mesmo dano. Aplicações subsequentes aumentam o dano em +2 (máx 10). Resistir: Perseverança + Resistência.' },
    { type:'passive',keyword:'Passiva',title:'Transient Nature of Life',effect:'Ataques contra alvos adjacentes à Yahiro Saki recebem [Assassinate] e ignoram Defesa.' },
    { type:'passive',keyword:'Passiva',title:'Sakura Whimsical Stroll: Present',effect:'No início do seu turno, Memory +2. Saki tem duas ações por turno. +2 Turnos na batalha — as iniciativas desses turnos são ½ e ⅓ do resultado da rolagem de iniciativa, respectivamente.' },
    { type:'passive',keyword:'Passiva',title:'Sakura Whimsical Stroll: Hatred',effect:'No início do seu turno, caso esteja em até 20 metros de onde [Yahiro Akugetsu] está, Memory +2.' },
  ];

  // ── Setor 2 — entradas faltantes ────────────────────────────────────────────

  const sistermonBlanc = makeWildDigimon('d-sistermon-blanc', 'Sistermon Blanc', 'Child (Lvl 3)', 'Puppet', 'gold', [2],
    '??? ↔ Sistermon Blanc ↔ ??? ↔ ??? ↔ ???');
  sistermonBlanc.stages[0].attributes = { Inteligência:2,Força:1,Presença:1,Raciocínio:1,Destreza:2,Manipulação:0,Perseverança:4,Vigor:2,Autocontrole:1 };
  sistermonBlanc.stages[0].status = { HP:8,Deslocamento:7,Iniciativa:3,Defesa:1,Armadura:0 };
  sistermonBlanc.stages[0].affinity = { Luz:2,Cura:1 };
  sistermonBlanc.stages[0].weakness = { 'Letal (+2)':'Data','Agravado (+3)':'Trevas, Fogo','Resistente (-2)':'Vírus, Luz' };
  sistermonBlanc.stages[0].skills = [
    { type:'action',keyword:'Ataque',title:'Divine Pierce',alcance:'corpo a corpo 1m ou projétil 8m',custo:'Nenhum [corpo a corpo] ou -1 Memory [projétil]',dados:'Força + Físico [corpo a corpo] ou Inteligência + Luz [projétil]',effect:'Nenhum.' },
    { type:'action',keyword:'Efeito',title:'Protect Wave',alcance:'—',custo:'-X Memory',effect:'X é igual à quantidade de Memory usada [mín.1, máx.4]. Cancela o próximo ataque ou efeito que atingiria os X aliados escolhidos.' },
    { type:'passive',keyword:'Passiva',title:'Digital Body',effect:'Caso seja atacado por um humano, duplica sua Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Selfless Survive',effect:'No início do turno de Sistermon Blanc, ela perde 1 HP. Em seguida, concede Memory +1 para si mesma ou para 1 aliado à sua escolha. Caso o alvo não seja Sistermon Blanc, o custo em HP é aumentado em +2.' },
    { type:'passive',keyword:'Passiva',title:"You're my Hero",effect:'Enquanto houver ao menos um Digimon aliado do tipo [Small Dragon] e de atributo [Data] em batalha, no início de cada Round todas as [Sistermons] recebem [Blocker].' },
  ] as DigimonSkill[];

  const sakuraFabrication = makeWildDigimon('d-sakura-fabrication', 'Sakura Fabrication', 'Adult (Lvl 4)', 'Token, Illusion, SIGN 02', 'rose', [2],
    'Token invocado por Yahiro Saki');
  sakuraFabrication.stages[0].attributes = { Inteligência:1,Força:1,Presença:1,Raciocínio:1,Destreza:4,Manipulação:4,Perseverança:1,Vigor:1,Autocontrole:4 };
  sakuraFabrication.stages[0].status = { HP:11,Deslocamento:12,Iniciativa:6,Defesa:3,Armadura:0 };
  sakuraFabrication.stages[0].affinity = {};
  sakuraFabrication.stages[0].weakness = { 'Letal (+2)':'Variável','Agravado (+3)':'Físico, Fogo','Resistente (-2)':'Variável','Inefetivo (-3)':'Enfraquecer' };
  sakuraFabrication.stages[0].skills = [
    { type:'passive',keyword:'Passiva',title:'Digital Body',effect:'Caso seja atacado por um humano, duplique sua Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Illusionary Touch',effect:'Ao atacar um inimigo, o inimigo deve rolar sua Defesa ou Destreza + Esquiva; caso falhe na rolagem, ele receberá 3 de dano. Esses ataques não reduzem Defesa.' },
    { type:'passive',keyword:'Passiva',title:'Wraith',effect:'Imune a Ataques de Oportunidade.' },
    { type:'passive',keyword:'Passiva',title:'Error',effect:'Caso seja atingido por [De-Digivolve], é deletado.' },
  ] as DigimonSkill[];

  // ── BUGs — ledo.red ─────────────────────────────────────────────────────────

  const redTrivial = makeBug('b-ledo-trivial', 'red.trivial', 'ledo', 'red', [1,2,3,4,5], 'Baby II (Lvl 2) · Red Eraser');
  redTrivial.attributes = { Inteligência:2,Força:0,Presença:0,Raciocínio:2,Destreza:2,Manipulação:2,Perseverança:0,Vigor:2,Autocontrole:0 };
  redTrivial.status = { HP:5,Deslocamento:5,Iniciativa:2,Defesa:2,Armadura:0 };
  redTrivial.weakness = { 'Letal (+2)':'Vacina','Agravado (+3)':'Água, Gelo, Físico','Resistente (-2)':'Data' };
  redTrivial.affinity = {};
  redTrivial.skills = [
    { type:'action',keyword:'Efeito',title:'Promise of Warmth',alcance:'—',custo:'-1 Memory',effect:'Aplica 1 carga de [Haste] em si e ganha uma fraqueza agravada aleatória entre as afinidades que ainda não possui.' },
    { type:'passive',keyword:'Passiva',title:'Memory Leak',effect:'No início do seu turno, perca 1 de Memory.' },
    { type:'passive',keyword:'Passiva',title:'Heartbleed',effect:'Qualquer efeito que faria o personagem perder Memory passa a causar ganho da mesma quantidade de Memory, em vez de redução.' },
    { type:'passive',keyword:'Passiva',title:'Cheers for the Dead',effect:'Quando levar um golpe fatal, causa uma explosão que atinge todos dentro de um alcance em metros igual ao seu Deslocamento atual. O dano é igual ao HP que red.trivial tinha quando foi morto.' },
  ] as any;

  const redLow = makeBug('b-ledo-low', 'red.low', 'ledo', 'red', [1,2,3,4,5], 'Child (Lvl 3) · Red Eraser');
  redLow.attributes = { Inteligência:2,Força:2,Presença:2,Raciocínio:2,Destreza:4,Manipulação:3,Perseverança:0,Vigor:4,Autocontrole:0 };
  redLow.status = { HP:10,Deslocamento:10,Iniciativa:4,Defesa:2,Armadura:0 };
  redLow.weakness = { 'Letal (+2)':'Vacina','Agravado (+3)':'Água, Gelo','Resistente (-2)':'Data, Fogo' };
  redLow.affinity = { Fogo:3 };
  redLow.skills = [
    { type:'reaction',keyword:'Efeito-Reação',title:'Attack Juggling',alcance:'5m',custo:'-1 Memory',effect:'Quando um inimigo dentro do alcance fizer um ataque corpo a corpo contra um único alvo, pode ser ativada. Redireciona o ataque para um personagem dentro do alcance que tenha o tipo [Red].' },
    { type:'action',keyword:'Ataque',title:'Flame Juggler',alcance:'projétil 5m',custo:'-1 Memory',dados:'Destreza + Fogo',effect:'Dano fixo: 3. Aplica 2 + X cargas de [Burn] no inimigo escolhido; X é igual aos sucessos dos dados.' },
    { type:'action',keyword:'Efeito',title:'Spotlight for the New Life',alcance:'—',custo:'-1 Memory',effect:'Recupera 3 HP de 1 aliado do tipo [Red]. Caso a cura ultrapasse o MAXHP, aumente o MAXHP de acordo com o excesso.' },
    { type:'passive',keyword:'Passiva',title:'Digital Body',effect:'Caso seja atacado por um humano, duplica a Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Memory Leak',effect:'No início do seu turno, perca 1 de Memory.' },
    { type:'passive',keyword:'Passiva',title:'Heartbleed',effect:'Qualquer efeito que faria o personagem perder Memory passa a causar ganho da mesma quantidade de Memory, em vez de redução.' },
  ] as any;

  const redHigh = makeBug('b-ledo-high', 'red.high', 'ledo', 'red', [1,2,3,4,5], 'Adult (Lvl 4) · Red Eraser');
  redHigh.attributes = { Inteligência:4,Força:2,Presença:4,Raciocínio:4,Destreza:6,Manipulação:6,Perseverança:0,Vigor:4,Autocontrole:0 };
  redHigh.status = { HP:20,Deslocamento:13,Iniciativa:6,Defesa:4,Armadura:0 };
  redHigh.weakness = { 'Letal (+2)':'Vacina','Agravado (+3)':'Água, Gelo','Resistente (-2)':'Data, Fogo','Imune':'[Charm]' };
  redHigh.affinity = { Fogo:3,Enfraquecer:2 };
  redHigh.skills = [
    { type:'action',keyword:'Efeito',title:'Masquerade',alcance:'15m',custo:'-2 Memory',dados:'Manipulação + Enfraquecer',effect:'Cooldown: 3 Turnos. Aplica 1 carga de [Charm] no alvo.' },
    { type:'reaction',keyword:'Efeito-Reação',title:'Main Attraction',alcance:'8m',custo:'-1 Memory',effect:'Quando um aliado escolher um personagem do tipo [Red] como alvo de um efeito, pode ser usada. [Blitz]. Aplica 1 carga de [Decoy] no alvo.' },
    { type:'action',keyword:'Ataque',title:'Red Applause',alcance:'projétil 10m',custo:'-2 Memory',dados:'Presença + Fogo',effect:'[Blast 1]. Dano fixo: 3. Aplica 4 + X cargas de [Burn] nos alvos atingidos; X = número de Erasers do tipo [Red] em batalha (excluindo o próprio usuário).' },
    { type:'passive',keyword:'Passiva',title:'Digital Body +',effect:'Caso seja atacado por um humano ou um Digimon de nível inferior, duplica a Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Memory Leak +',effect:'No início do seu turno, perca 2 de Memory.' },
    { type:'passive',keyword:'Passiva',title:'Heartbleed',effect:'Qualquer efeito que faria o personagem perder Memory passa a causar ganho da mesma quantidade de Memory, em vez de redução.' },
  ] as any;

  const redHood = makeBug('b-ledo-hood', 'red.hood', 'ledo', 'red', [1,2,3,4,5], 'Adult (Lvl 4) · Red Eraser');
  redHood.attributes = { Inteligência:0,Força:6,Presença:6,Raciocínio:0,Destreza:3,Manipulação:0,Perseverança:4,Vigor:6,Autocontrole:0 };
  redHood.status = { HP:40,Deslocamento:15,Iniciativa:3,Defesa:1,Armadura:3 };
  redHood.weakness = { 'Letal (+2)':'Vacina','Agravado (+3)':'Gelo, [Charm]','Resistente (-2)':'Data, Físico','Imune':'[Burn]' };
  redHood.affinity = { Físico:5 };
  redHood.skills = [
    { type:'action',keyword:'Efeito',title:'Hooded Girls Never Run Away',alcance:'—',custo:'-2 Memory',effect:'Cooldown: 5 Turnos. Iniciativa +2 e ganha uma ação extra em seus turnos (efetivo a partir do próximo Round). Ambos os efeitos duram 3 turnos.' },
    { type:'action',keyword:'Ataque',title:'Sucker Punch',alcance:'projétil 8m',custo:'-1 Memory ou -3 HP',dados:'Força + Físico',effect:'[Assassinate]. Dano fixo: 3. Pode ser ativada como Reação quando um inimigo estiver prestes a encerrar seu turno ainda com ações disponíveis. Nesse caso, recebe [Blitz]. Se acertar, uma ação não utilizada do inimigo é gasta.' },
    { type:'action',keyword:'Ataque',title:'Brutality',alcance:'corpo a corpo 1m',custo:'-2 Memory ou -6 HP',dados:'Força + Físico',effect:'Dano fixo: 5. Se o alvo tiver mais Defesa do que a Armadura atual, duplique o dano e o [Security Attack] desse ataque.' },
    { type:'passive',keyword:'Passiva',title:'Digital Body +',effect:'Caso seja atacado por um humano ou um Digimon de nível inferior, duplica a Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Memory Leak +',effect:'No início do seu turno, perca 2 de Memory.' },
    { type:'passive',keyword:'Passiva',title:'Heartbleed',effect:'Qualquer efeito que faria o personagem perder Memory passa a causar ganho da mesma quantidade de Memory, em vez de redução.' },
    { type:'passive',keyword:'Passiva',title:'You Must Become Strong',effect:'Fixa sua Defesa em 1. Quando receber um ataque fatal, sobrevive com 1 HP e fica imune a dano por ataques até o final do Round. No início do próximo Round, aumenta o dano de seus ataques em +2 permanentemente. Pode ser ativado até 3 vezes por batalha.' },
    { type:'passive',keyword:'Passiva',title:'Fire Does Not Burn You',effect:'Quando for ser afetado por uma Condição Negativa, perde 1 de Armadura e cancela o efeito.' },
  ] as any;

  // ── BUGs — chi.green ────────────────────────────────────────────────────────

  // green.chevalier — Baby II (Lvl 2)
  const greenChevalier = makeBug('b-chi-chevalier', 'green.chevalier', 'chi', 'green', [1,2,3,4,5], 'Baby II (Lvl 2) · Green Eraser');
  greenChevalier.attributes = { Inteligência:0,Força:0,Presença:0,Raciocínio:2,Destreza:2,Manipulação:0,Perseverança:2,Vigor:0,Autocontrole:2 };
  greenChevalier.status = { HP:7,Deslocamento:6,Iniciativa:4,Defesa:2,Armadura:0 };
  greenChevalier.weakness = { 'Letal (+2)':'Data','Agravado (+3)':'Enfraquecer, Trevas, [Condições do tipo Ferimento]','Resistente (-2)':'Vírus' };
  greenChevalier.affinity = {};
  greenChevalier.skills = [
    { type:'action',keyword:'Efeito',title:'Inspire',alcance:'—',custo:'-1 Memory',effect:'Concede [Blocker] e Defesa +1 ao alvo (1 aliado do tipo [Green]) durante 3 turnos.' },
    { type:'passive',keyword:'Passiva',title:'Domain Dweller',effect:'No início do seu turno, caso esteja dentro de um Domain, Memory +2.' },
    { type:'passive',keyword:'Passiva',title:'En Garde!',effect:'Ao ser atacado por um inimigo, ao invés de reduzir os dados dele com sua Defesa, rode Destreza + Defesa contra ele. Caso vença, reduza a Defesa do alvo em -2 permanentemente (some após [Defense Break] ou green.chevalier ser derrotado). Caso perca, diminua sua Defesa e receba dano normalmente.' },
  ] as any;

  // green.priestess — Adult (Lvl 4)
  const greenPriestess = makeBug('b-chi-priestess', 'green.priestess', 'chi', 'green', [1,2,3,4,5], 'Adult (Lvl 4) · Green Eraser');
  greenPriestess.attributes = { Inteligência:6,Força:0,Presença:2,Raciocínio:2,Destreza:2,Manipulação:6,Perseverança:2,Vigor:0,Autocontrole:6 };
  greenPriestess.status = { HP:20,Deslocamento:7,Iniciativa:8,Defesa:2,Armadura:1 };
  greenPriestess.weakness = { 'Letal (+2)':'Data','Agravado (+3)':'Enfraquecer, [Burn]','Resistente (-2)':'Vírus, Luz','Imune':'[Curse]' };
  greenPriestess.affinity = { Luz:2,Físico:1,Cura:2 };
  greenPriestess.skills = [
    { type:'action',keyword:'Efeito',title:'Safe Zone',alcance:'15m',custo:'-2 Memory',effect:'Cooldown: 5 Turnos. [Blast 3]. Aumenta a afinidade à Resistência dos aliados em +2 e, caso tenham [Blocker], também aumenta a Defesa em +3. Ambos os efeitos duram 3 turnos.' },
    { type:'action',keyword:'Efeito',title:'Green Gradation',alcance:'15m',custo:'-1 Memory',dados:'Inteligência + Cura',effect:'Recupera 2 + X de HP do aliado escolhido (X = sucessos). Com 2+ sucessos, aplica 1 carga de [Blocker] no aliado.' },
    { type:'action',keyword:'Efeito',title:'Evolution Code',alcance:'15m',custo:'-1 Memory (Lvl 2) ou -2 Memory (Lvl 3)',effect:'Evolui 1 aliado do tipo [Green] abaixo do Lvl 4 para o próximo nível, recupera totalmente seu HP e fixa a Memory dele em 3.' },
    { type:'passive',keyword:'Passiva',title:'Digital Body +',effect:'Caso seja atacado por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.' },
    { type:'passive',keyword:'Passiva',title:'Domain Dweller',effect:'No início do seu turno, caso esteja dentro de um Domain, Memory +2.' },
    { type:'passive',keyword:'Passiva',title:'Simple Domain',effect:'No início do Round, caso não haja Domain ativo, cria um [Simple Domain] 20×20. Conta como Domain para aliados do tipo [Green]. Some quando outro Domain for ativado.' },
  ] as any;

  return {
    tamers: [
      naoki, eisuke, miki, yuri, sachi, mori,
      hare, kanade, shinra, kumo, emi, hibito,
    ],
    bestiary: [
      tinkermonLine, kudamonLine, blucomonLine, wormmonLine, solarmonLine,
      toyAgumonLine, penmonLine, floramonLine, hyokomonLine, ghostmonLine, betamonLine,
      // Setor 2 — Sisters
      greymon, picoDevimon, sistermonBlanc, sistermonNoir, sistermonCiel, yahiroSaki, sakuraFabrication,
    ],
    bugs: [
      // ledo.red
      redTrivial, redLow, redHigh, redHood,
      // chi.green
      greenChevalier, greenPriestess,
      // haru.white — a ser adicionado
    ],
    survivors: DEFAULT_SURVIVORS,
    stages: [],
    sectors: defaultSectors,
    bugFolders: defaultBugFolders,
    signs: [],
    skillTree: [],
    customClimas:     [],
    customKeywords:   [],
    customConditions: [],
    jogressConfigs:   [],
    tokenDefs: DEFAULT_TOKEN_DEFS,
    visibility: {},
  };
}