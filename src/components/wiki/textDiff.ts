// Diff de palavras leve (LCS) para destacar mudanças entre dois textos da Wiki.
// Sem dependências externas — suficiente para corpos de página (algumas centenas
// de palavras). Quebra por espaços preservando-os para reconstruir o texto.

export type DiffOp = 'equal' | 'insert' | 'delete'

export interface DiffPart {
  op:   DiffOp
  text: string
}

// Tokeniza preservando os separadores (espaços/quebras) como tokens próprios,
// para que a junção reconstrua exatamente o texto original.
function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? []
}

// Diff por LCS clássico. Retorna a sequência de operações para transformar
// `before` em `after`.
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const n = a.length
  const m = b.length

  // Tabela de LCS (n+1) x (m+1)
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const parts: DiffPart[] = []
  const push = (op: DiffOp, text: string) => {
    const last = parts[parts.length - 1]
    if (last && last.op === op) last.text += text
    else parts.push({ op, text })
  }

  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('equal', a[i]); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { push('delete', a[i]); i++ }
    else { push('insert', b[j]); j++ }
  }
  while (i < n) { push('delete', a[i]); i++ }
  while (j < m) { push('insert', b[j]); j++ }

  return parts
}
