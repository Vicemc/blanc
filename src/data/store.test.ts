import { describe, it, expect } from 'vitest'
import {
  calcTamerDerived, calcDigimonDerived,
  xpCostAttribute, xpCostSkill,
  buildDefaultState, mergeWithDefaults,
} from './store'
import type { Attributes, AppState } from '../types'

const attrs: Attributes = {
  Inteligência: 2, Força: 3, Presença: 2,
  Raciocínio: 4, Destreza: 3, Manipulação: 2,
  Perseverança: 3, Vigor: 4, Autocontrole: 2,
}

// ── Cálculos derivados ────────────────────────────────────────────────────────

describe('calcTamerDerived', () => {
  it('HP = Vigor + size (default 5)', () => {
    expect(calcTamerDerived(attrs).HP).toBe(attrs.Vigor + 5)
    expect(calcTamerDerived(attrs, 7).HP).toBe(attrs.Vigor + 7)
  })
  it('Digisoul = Perseverança + Autocontrole', () => {
    expect(calcTamerDerived(attrs).Digisoul).toBe(attrs.Perseverança + attrs.Autocontrole)
  })
  it('Iniciativa = Destreza + Autocontrole + 1', () => {
    expect(calcTamerDerived(attrs).Iniciativa).toBe(attrs.Destreza + attrs.Autocontrole + 1)
  })
  it('Deslocamento = Força + Destreza + speed (default 5)', () => {
    expect(calcTamerDerived(attrs).Deslocamento).toBe(attrs.Força + attrs.Destreza + 5)
    expect(calcTamerDerived(attrs, 5, 8).Deslocamento).toBe(attrs.Força + attrs.Destreza + 8)
  })
})

describe('calcDigimonDerived', () => {
  it('HP de parceiro é HP do tamer + bônus por nível', () => {
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Child (Lvl 3)').HP).toBe(15)
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Armor (Lvl 4)').HP).toBe(18)
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Adult (Lvl 4)').HP).toBe(20)
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Perfect (Lvl 5)').HP).toBe(25)
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Ultimate (Lvl 6)').HP).toBe(30)
  })
  it('nível desconhecido cai no bônus padrão de +5', () => {
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, '??? (Lvl ?)').HP).toBe(15)
  })
  it('sem tamer vinculado usa Vigor + size', () => {
    expect(calcDigimonDerived(attrs, 3).HP).toBe(attrs.Vigor + 3)
    expect(calcDigimonDerived(attrs, 6).HP).toBe(attrs.Vigor + 6)
  })
  it('Defesa = min(Destreza, Raciocínio) + bônus de evolução', () => {
    expect(calcDigimonDerived(attrs).Defesa).toBe(Math.min(attrs.Destreza, attrs.Raciocínio))
    expect(calcDigimonDerived(attrs, 3, 5, 2).Defesa).toBe(Math.min(attrs.Destreza, attrs.Raciocínio) + 2)
  })
  it('Iniciativa e Deslocamento seguem as mesmas fórmulas do tamer', () => {
    const d = calcDigimonDerived(attrs)
    expect(d.Iniciativa).toBe(attrs.Destreza + attrs.Autocontrole + 1)
    expect(d.Deslocamento).toBe(attrs.Força + attrs.Destreza + 5)
  })
})

// ── Custos de XP ──────────────────────────────────────────────────────────────

describe('custos de XP', () => {
  it('atributo custa novoNível × 5', () => {
    expect(xpCostAttribute(1)).toBe(5)
    expect(xpCostAttribute(3)).toBe(15)
    expect(xpCostAttribute(5)).toBe(25)
  })
  it('skill custa novoNível × 3', () => {
    expect(xpCostSkill(1)).toBe(3)
    expect(xpCostSkill(4)).toBe(12)
    expect(xpCostSkill(5)).toBe(15)
  })
})

// ── mergeWithDefaults — a rede de segurança do carregamento ───────────────────

describe('mergeWithDefaults', () => {
  it('preserva runtime do usuário (xp, status, atributos) dos tamers', () => {
    const defaults = buildDefaultState()
    const base = buildDefaultState()
    const target = base.tamers[0]
    const saved: AppState = {
      ...base,
      tamers: base.tamers.map(t =>
        t.id === target.id
          ? { ...t, xp: 999, status: { ...t.status, HP: { v: 1, max: t.status.HP.max } } }
          : t,
      ),
    }
    const merged = mergeWithDefaults(saved, defaults)
    const mt = merged.tamers.find(t => t.id === target.id)!
    expect(mt.xp).toBe(999)
    expect(mt.status.HP.v).toBe(1)
  })

  it('reinjeta tamerSkills do código (não preserva os do saved)', () => {
    const defaults = buildDefaultState()
    const withSkills = defaults.tamers.find(t => t.tamerSkills.length > 0) ?? defaults.tamers[0]
    const saved: AppState = {
      ...defaults,
      tamers: defaults.tamers.map(t =>
        t.id === withSkills.id ? { ...t, tamerSkills: [] } : t,
      ),
    }
    const merged = mergeWithDefaults(saved, defaults)
    const mt = merged.tamers.find(t => t.id === withSkills.id)!
    expect(mt.tamerSkills).toEqual(withSkills.tamerSkills)
  })

  it('preserva status/atributos do bestiário mas reinjeta skills do código', () => {
    const defaults = buildDefaultState()
    const line = defaults.bestiary.find(l => l.tamerId)!
    const saved: AppState = {
      ...defaults,
      bestiary: defaults.bestiary.map(l =>
        l.id === line.id
          ? { ...l, stages: l.stages.map(st => ({ ...st, skills: [] })) }
          : l,
      ),
    }
    const merged = mergeWithDefaults(saved, defaults)
    const ml = merged.bestiary.find(l => l.id === line.id)!
    // skills voltam do código
    expect(ml.stages[line.currentStage].skills).toEqual(line.stages[line.currentStage].skills)
  })

  it('mantém linhas de bestiário criadas pelo usuário que não existem no código', () => {
    const defaults = buildDefaultState()
    const custom = { ...defaults.bestiary[0], id: 'd-user-custom', name: 'Custom Mon' }
    const saved: AppState = { ...defaults, bestiary: [...defaults.bestiary, custom] }
    const merged = mergeWithDefaults(saved, defaults)
    expect(merged.bestiary.some(l => l.id === 'd-user-custom')).toBe(true)
  })

  it('injeta novos bugs do código que faltam no saved', () => {
    const defaults = buildDefaultState()
    const saved: AppState = { ...defaults, bugs: [] }
    const merged = mergeWithDefaults(saved, defaults)
    expect(merged.bugs.length).toBe(defaults.bugs.length)
  })

  it('preserva bugs editados pelo usuário', () => {
    const defaults = buildDefaultState()
    if (defaults.bugs.length === 0) return
    const edited = { ...defaults.bugs[0], lore: 'EDITED-LORE' }
    const saved: AppState = { ...defaults, bugs: [edited] }
    const merged = mergeWithDefaults(saved, defaults)
    expect(merged.bugs.find(b => b.id === edited.id)!.lore).toBe('EDITED-LORE')
  })

  it('preenche coleções ausentes com defaults/vazios sem quebrar', () => {
    const defaults = buildDefaultState()
    const saved = { ...defaults } as Partial<AppState> as AppState
    delete (saved as Record<string, unknown>).stages
    delete (saved as Record<string, unknown>).visibility
    delete (saved as Record<string, unknown>).tokenDefs
    const merged = mergeWithDefaults(saved, defaults)
    expect(Array.isArray(merged.stages)).toBe(true)
    expect(typeof merged.visibility).toBe('object')
    expect(Array.isArray(merged.tokenDefs)).toBe(true)
  })
})
