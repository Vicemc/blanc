import type { AppState, Survivor, SurvivorStatus, SurvivorAttributes, Merit, MindLink, SkillSet, Portrait, SurvivorLoreBlock } from '../types'
import { DEFAULT_SKILL_SET } from '../types'

export function makeSurvivor(id: string, name: string, portrait: Portrait = 'sage'): Survivor {
  return {
    id,
    name,
    portrait,
    image:      null,
    imageKey:   null,
    attributes: { Poder: 2, Refinamento: 2, Resistência: 2 },
    status:     { HP: { v: 10, max: 10 }, Digisoul: { v: 5, max: 5 }, Deslocamento: 3, Iniciativa: 3 },
    skills:     {
      Mental: { ...DEFAULT_SKILL_SET.Mental },
      Físico: { ...DEFAULT_SKILL_SET.Físico },
      Social: { ...DEFAULT_SKILL_SET.Social },
    },
    survivorSkills: [],
    merits:   [],
    mindLink: { digimonId: null, active: false },
    inventory: [],
    lore: [
      { text: '', visible: false },
      { text: '', visible: false },
      { text: '', visible: false },
    ] as SurvivorLoreBlock[],
  }
}

// ── Survivor padrão: Yahiro Akugetsu ──────────────────────────────
const DEFAULT_SURVIVORS: Survivor[] = [
  {
    ...makeSurvivor('sv-yahiro', 'Yahiro', 'rose'),
    surname: 'Akugetsu',
    tagline: 'Aquela que carrega as cerejeiras',
    age: 17, height: 158, sign: 'Sagitário', birthday: '17 de Dezembro', voice: 'Yui Ishikawa',
    attributes: { Poder: 2, Refinamento: 3, Resistência: 2 },
    status: { HP: { v: 10, max: 10 }, Digisoul: { v: 8, max: 8 }, Deslocamento: 3, Iniciativa: 3 },
  },
]

function mergeWithDefaults(state: AppState): AppState {
  const defaults = buildDefaultState()

  return {
    ...defaults,
    ...state,
    survivors: state.survivors?.length ? state.survivors : defaults.survivors,
    tamers:    state.tamers?.length    ? state.tamers    : defaults.tamers,
    bestiary:  state.bestiary?.length  ? state.bestiary  : defaults.bestiary,
    bugs:      state.bugs?.length      ? state.bugs      : defaults.bugs,
    signs:     state.signs?.length     ? state.signs     : defaults.signs,
  }
}

function findTamer(state: AppState, tamerId: string) {
  return state.tamers.find(t => t.id === tamerId)
}

export function findSurvivor(state: AppState, survivorId: string) {
  return (state.survivors ?? []).find(sv => sv.id === survivorId)
}

function findDigimon(state: AppState, digimonId: string) {
  return state.bestiary.find(d => d.id === digimonId)
}

function findBug(state: AppState, bugId: string) {
  return state.bugs.find(b => b.id === bugId)
}

function findSign(state: AppState, signId: string) {
  return state.signs.find(s => s.id === signId)
}

function isVisible(state: AppState, key: string) {
  return Boolean(state.visibility && state.visibility[key])
}

function setVisibility(state: AppState, key: string, visible: boolean) {
  const visibility = { ...(state.visibility ?? {}) }
  if (visible) {
    visibility[key] = 'full'
  } else {
    delete visibility[key]
  }
  return { ...state, visibility }
}

function makeSkillTreePhase() {
  return {
    name: '',
    prerequisites: [],
    bonuses: [],
  }
}

function buildDefaultState(): AppState {
  return {
    tamers:    [],
    survivors: DEFAULT_SURVIVORS,
    bestiary:  [],
    bugs:      [],
    signs:     [],
    stages:    [],
    sectors:   [],
    bugFolders:  [],
    skillTree:   [],
    customClimas:     [],
    customKeywords:   [],
    customConditions: [],
    jogressConfigs:   [],
    tokenDefs:  [],
    visibility: { intro: 'full', bestiary: 'full' },
  }
}

export {
  buildDefaultState,
  mergeWithDefaults,
  findTamer,
  findDigimon,
  findBug,
  findSign,
  isVisible,
  setVisibility,
  makeSkillTreePhase,
  DEFAULT_SURVIVORS,
}
