import { describe, it, expect } from 'vitest'
import {
  xpCostAttribute, xpCostSkill,
  calcTamerDerived, calcDigimonDerived,
  getVisLevel, pendingCost, pendingSkillCost,
} from './store'
import { ruleSlug, ruleTabFor } from './rulesData'
import type { Attributes, AppState } from '../types'

const attrs: Attributes = {
  Inteligência: 2, Força: 3, Presença: 2,
  Raciocínio: 4, Destreza: 3, Manipulação: 2,
  Perseverança: 3, Vigor: 4, Autocontrole: 2,
}

describe('custos de XP', () => {
  it('atributo custa novoNível × 5', () => {
    expect(xpCostAttribute(1)).toBe(5)
    expect(xpCostAttribute(5)).toBe(25)
  })
  it('skill custa novoNível × 3', () => {
    expect(xpCostSkill(1)).toBe(3)
    expect(xpCostSkill(4)).toBe(12)
  })
})

describe('calcTamerDerived', () => {
  it('aplica as fórmulas base', () => {
    const d = calcTamerDerived(attrs)
    expect(d.HP).toBe(attrs.Vigor + 5)                       // Vigor + size(5)
    expect(d.Digisoul).toBe(attrs.Perseverança + attrs.Autocontrole)
    expect(d.Iniciativa).toBe(attrs.Destreza + attrs.Autocontrole + 1)
    expect(d.Deslocamento).toBe(attrs.Força + attrs.Destreza + 5)
  })
})

describe('calcDigimonDerived', () => {
  it('HP de parceiro é relativo ao HP do tamer por nível', () => {
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Child (Lvl 3)').HP).toBe(15)   // +5
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Armor (Lvl 4)').HP).toBe(18)   // +8
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Adult (Lvl 4)').HP).toBe(20)   // +10
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Perfect (Lvl 5)').HP).toBe(25) // +15
    expect(calcDigimonDerived(attrs, 3, 5, 0, 10, 'Ultimate (Lvl 6)').HP).toBe(30)// +20
  })
  it('sem tamer usa Vigor + size', () => {
    expect(calcDigimonDerived(attrs, 3).HP).toBe(attrs.Vigor + 3)
  })
  it('Defesa = min(Destreza, Raciocínio) + bônus de evolução', () => {
    expect(calcDigimonDerived(attrs, 3, 5, 2).Defesa).toBe(Math.min(attrs.Destreza, attrs.Raciocínio) + 2)
  })
})

describe('getVisLevel', () => {
  const base = { visibility: {} } as unknown as AppState
  it('palcos são full por padrão; resto é hidden', () => {
    expect(getVisLevel(base, 'stage', 's1')).toBe('full')
    expect(getVisLevel(base, 'bestiary', 'd1')).toBe('hidden')
  })
  it('migra valores booleanos antigos', () => {
    const s = { visibility: { 'bestiary:d1': true, 'bestiary:d2': false } } as unknown as AppState
    expect(getVisLevel(s, 'bestiary', 'd1')).toBe('full')
    expect(getVisLevel(s, 'bestiary', 'd2')).toBe('hidden')
  })
  it('respeita valores de 3 estados', () => {
    const s = { visibility: { 'bug:b1': 'name' } } as unknown as AppState
    expect(getVisLevel(s, 'bug', 'b1')).toBe('name')
  })
})

describe('pendingCost', () => {
  it('soma o custo de comprar do nível atual ao alvo', () => {
    // de 2 → 4 em um atributo: custa 15 (nível 3) + 20 (nível 4) = 35
    expect(pendingCost({ Força: 2 }, attrs)).toBe(xpCostAttribute(4) + xpCostAttribute(5))
  })
  it('skill: de 0 com +2 custa nível1 + nível2', () => {
    expect(pendingSkillCost({ Briga: 2 }, { Briga: 0 })).toBe(xpCostSkill(1) + xpCostSkill(2))
  })
})

describe('ruleSlug', () => {
  it('normaliza variantes numéricas e sufixos', () => {
    expect(ruleSlug('Burn')).toBe('burn')
    expect(ruleSlug('Security Attack +1')).toBe('security-attack')
    expect(ruleSlug('Blast 2')).toBe('blast')
    expect(ruleSlug('De-Digivolve')).toBe('de-digivolve')
  })
})

describe('ruleTabFor', () => {
  it('climas vão para a aba climas, keywords para regras', () => {
    expect(ruleTabFor('Intense Sunlight')).toBe('climas')
    expect(ruleTabFor('Burn')).toBe('regras')
  })
})
