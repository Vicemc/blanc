import type { AppState } from '../types'

function mergeWithDefaults(state: AppState): AppState {
  const defaults = buildDefaultState()

  return {
    ...defaults,
    ...state,
    tamers: state.tamers?.length ? state.tamers : defaults.tamers,
    bestiary: state.bestiary?.length ? state.bestiary : defaults.bestiary,
    bugs: state.bugs?.length ? state.bugs : defaults.bugs,
    signs: state.signs?.length ? state.signs : defaults.signs,
  }
}

function findTamer(state: AppState, tamerId: string) {
  return state.tamers.find(t => t.id === tamerId)
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
    visibility[key] = true
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
    tamers: [],
    bestiary: [],
    bugs: [],
    signs: [],
    stages: [],
    sectors: [],
    bugFolders: [],
    skillTree: [],
    customClimas: [],
    customKeywords: [],
    customConditions: [],
    tokenDefs: [],
    visibility: { intro: true, bestiary: true },
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
}
