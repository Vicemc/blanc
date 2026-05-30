import type { AppState, Survivor, Portrait, SurvivorLoreBlock } from '../types'
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
export const DEFAULT_SURVIVORS: Survivor[] = [
  {
    ...makeSurvivor('sv-yahiro', 'Yahiro', 'rose'),
    surname: 'Akugetsu',
    tagline: 'Aquela que carrega as cerejeiras',
    age: 17, height: 158, sign: 'Sagitário', birthday: '17 de Dezembro', voice: 'Yui Ishikawa',
    attributes: { Poder: 2, Refinamento: 3, Resistência: 2 },
    status: { HP: { v: 10, max: 10 }, Digisoul: { v: 8, max: 8 }, Deslocamento: 3, Iniciativa: 3 },
  },
]

export function findSurvivor(state: AppState, survivorId: string) {
  return (state.survivors ?? []).find(sv => sv.id === survivorId)
}

export function findSign(state: AppState, signId: string) {
  return (state.signs ?? []).find(s => s.id === signId)
}
