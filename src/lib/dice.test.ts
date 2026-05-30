import { describe, it, expect, vi } from 'vitest'
import { rollPool, formatRoll } from './dice'

describe('rollPool', () => {
  it('pool ≤ 0 vira Chance Roll (1 dado)', () => {
    const r = rollPool(0)
    expect(r.chance).toBe(true)
    expect(r.rolls.length).toBe(1)
  })

  it('Chance Roll só tem sucesso com 10', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.95) // → 10
    const r = rollPool(-2)
    expect(r.successes).toBe(1)
    spy.mockReturnValue(0.5) // → 6
    expect(rollPool(0).successes).toBe(0)
    spy.mockRestore()
  })

  it('conta sucessos ≥ dificuldade', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.7) // → 8 (sucesso, não explode)
    const r = rollPool(3, { difficulty: 7, explode: false })
    expect(r.rolls).toEqual([8, 8, 8])
    expect(r.successes).toBe(3)
    spy.mockRestore()
  })

  it('1 cancela sucesso e gera botch quando zera', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.0) // → 1
    const r = rollPool(3, { explode: false })
    expect(r.successes).toBe(0)
    expect(r.botch).toBe(true)
    spy.mockRestore()
  })

  it('crit com 5+ sucessos', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.7) // → 8
    const r = rollPool(5, { explode: false })
    expect(r.crit).toBe(true)
    spy.mockRestore()
  })

  it('explosão adiciona dados extras', () => {
    let calls = 0
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      // primeiro dado = 10 (explode), depois 6 (não explode)
      return calls++ === 0 ? 0.95 : 0.5
    })
    const r = rollPool(1, { explode: true })
    expect(r.rolls.length).toBe(2)
    spy.mockRestore()
  })
})

describe('formatRoll', () => {
  it('inclui label e resultado', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.7)
    const out = formatRoll(rollPool(2, { explode: false }), 'Ataque')
    expect(out).toContain('Ataque')
    expect(out).toContain('2d10')
    spy.mockRestore()
  })
})
