// Rolador de dados World of Darkness (pool de d10).
// Regras da campanha: sucesso ≥ 7 · 10 explode · 1 cancela 1 sucesso ·
// crítico com 5+ sucessos · pool ≤ 0 vira Chance Roll (1d10, sucesso só com 10).

export interface RollResult {
  pool:         number
  difficulty:   number
  rolls:        number[]   // todos os dados rolados (inclui explosões)
  rawSuccesses: number     // dados ≥ dificuldade
  ones:         number     // quantidade de 1 (cada um cancela 1 sucesso)
  successes:    number     // líquido, mínimo 0
  botch:        boolean     // 0 sucessos e pelo menos um 1
  crit:         boolean     // 5+ sucessos
  chance:       boolean     // foi um Chance Roll (pool ≤ 0)
}

export function rollD10(): number {
  return Math.floor(Math.random() * 10) + 1
}

export interface RollOpts { difficulty?: number; explode?: boolean }

export function rollPool(pool: number, opts: RollOpts = {}): RollResult {
  const difficulty = opts.difficulty ?? 7
  const explode = opts.explode ?? true

  // Chance Roll
  if (pool <= 0) {
    const r = rollD10()
    const success = r === 10
    return {
      pool, difficulty, rolls: [r],
      rawSuccesses: success ? 1 : 0, ones: r === 1 ? 1 : 0,
      successes: success ? 1 : 0, botch: r === 1, crit: false, chance: true,
    }
  }

  const rolls: number[] = []
  let rawSuccesses = 0
  let ones = 0
  let toRoll = pool
  let guard = 0

  while (toRoll > 0 && guard < 1000) {
    let extra = 0
    for (let i = 0; i < toRoll; i++) {
      const r = rollD10()
      rolls.push(r)
      if (r >= difficulty) rawSuccesses++
      if (r === 1) ones++
      if (explode && r === 10) extra++
    }
    toRoll = extra
    guard++
  }

  const net = rawSuccesses - ones
  const successes = Math.max(0, net)
  return {
    pool, difficulty, rolls, rawSuccesses, ones, successes,
    botch: rawSuccesses === 0 && ones > 0,
    crit: successes >= 5,
    chance: false,
  }
}

// Resumo curto para o log do Palco / histórico.
export function formatRoll(r: RollResult, label?: string): string {
  const head = label ? `${label}: ` : ''
  if (r.chance) return `${head}Chance Roll [${r.rolls[0]}] → ${r.successes ? '1 sucesso' : (r.botch ? 'botch' : 'falha')}`
  const outcome = r.botch ? 'BOTCH' : r.crit ? `${r.successes} sucessos (CRÍTICO)` : `${r.successes} sucesso${r.successes !== 1 ? 's' : ''}`
  return `${head}${r.pool}d10 [${r.rolls.join(', ')}] → ${outcome}`
}
