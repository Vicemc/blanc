import { describe, it, expect } from 'vitest'
import { diffWords } from './textDiff'

// Reconstrói o texto "antes" (equal + delete) e "depois" (equal + insert).
function rebuild(parts: ReturnType<typeof diffWords>) {
  const before = parts.filter(p => p.op !== 'insert').map(p => p.text).join('')
  const after  = parts.filter(p => p.op !== 'delete').map(p => p.text).join('')
  return { before, after }
}

describe('diffWords', () => {
  it('texto idêntico → tudo equal', () => {
    const parts = diffWords('o gato dorme', 'o gato dorme')
    expect(parts.every(p => p.op === 'equal')).toBe(true)
  })

  it('reconstrói os dois lados a partir das operações', () => {
    const before = 'o gato preto dorme na cama'
    const after  = 'o gato branco dorme no sofá'
    const { before: b, after: a } = rebuild(diffWords(before, after))
    expect(b).toBe(before)
    expect(a).toBe(after)
  })

  it('detecta inserção pura', () => {
    const parts = diffWords('linha um', 'linha um e dois')
    expect(parts.some(p => p.op === 'insert')).toBe(true)
    expect(parts.some(p => p.op === 'delete')).toBe(false)
  })

  it('detecta remoção pura', () => {
    const parts = diffWords('linha um e dois', 'linha um')
    expect(parts.some(p => p.op === 'delete')).toBe(true)
    expect(parts.some(p => p.op === 'insert')).toBe(false)
  })

  it('lida com texto vazio dos dois lados', () => {
    expect(diffWords('', '')).toEqual([])
    expect(rebuild(diffWords('', 'novo texto')).after).toBe('novo texto')
    expect(rebuild(diffWords('texto antigo', '')).before).toBe('texto antigo')
  })
})
