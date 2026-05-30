import type { Attributes } from '../../../types'
import { xpCostAttribute, xpCostSkill } from '../../../data/store'
import type { TokenSpawn } from './types'

// ── Parser de Tokens ────────────────────────────────────────────────
// Detecta padrões como [Puppet Token / Lv.3], [Silhouette Token], [Enhanced Puppet Token / Lv.4]
// Retorna null se o efeito não invocar token.
export function parseTokenSpawns(effect: string): TokenSpawn[] {
  const tokens: TokenSpawn[] = []
  const bracketRe = /\[([^\]]*Token[^\]]*)\]/gi
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = bracketRe.exec(effect)) !== null) {
    const raw = m[1].trim()
    if (raw === 'Token' || raw === 'Tokens') continue
    const sentenceStart = Math.max(0, effect.lastIndexOf('.', m.index) + 1)
    const sentence = effect.slice(sentenceStart, effect.indexOf('.', m.index) === -1 ? undefined : effect.indexOf('.', m.index) + 1)
    const isSpawn = /invoca|invocar|ganha|cria|criar|adiciona/i.test(sentence)
    if (!isSpawn) continue

    const levelMatch = raw.match(/[/\s]+(Lv\.\d+)/i)
    const level = levelMatch ? levelMatch[1] : ''
    const name = raw.replace(/\s*\/?\s*Lv\.\d+/i, '').trim()

    const qtyMatch = effect.slice(Math.max(0, m.index - 10), m.index).match(/(\d+)\s*$/)
    const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1

    const key = `${name}|${level}`
    if (!seen.has(key)) {
      seen.add(key)
      tokens.push({ name, level, qty })
    }
  }
  return tokens
}

// ── XP Staging ─────────────────────────────────────────────────────
// Retorna quantos pontos de XP custará a compra pendente
export function pendingCost(pending: Record<string, number>, base: Attributes | Record<string, number>, isAttr: boolean) {
  let total = 0
  for (const [k, delta] of Object.entries(pending)) {
    if (delta <= 0) continue
    const cur = (base as Record<string, number>)[k] ?? 0
    for (let i = 1; i <= delta; i++) {
      total += isAttr ? xpCostAttribute(cur + i) : xpCostSkill(cur + i)
    }
  }
  return total
}

// ── Mapa de ícones de afinidade ──────────────────────────────────
export const AFFINITY_ICONS: Record<string, string> = {
  'Água':        '/affinity/Agua.png',
  'Cura':        '/affinity/Cura.png',
  'Enfraquecer': '/affinity/Enfraquecer.png',
  'Físico':      '/affinity/Fisico.png',
  'Fogo':        '/affinity/Fogo.png',
  'Gelo':        '/affinity/Gelo.png',
  'Luz':         '/affinity/Luz.png',
  'Madeira':     '/affinity/Madeira.png',
  'Metal':       '/affinity/Metal.png',
  'Resistência': '/affinity/Resistencia.png',
  'Terra':       '/affinity/Terra.png',
  'Trevas':      '/affinity/Trevas.png',
  'Trovão':      '/affinity/Trovao.png',
  'Vento':       '/affinity/Vento.png',
}

// ── Dicionário de tooltips para keywords e condições ─────────────────────────
export const KEYWORD_TIPS: Record<string, string> = {
  // Keywords de Ação
  'Blitz': 'Ação vira Ação Livre. Só pode ser ativada 1x por Round.',
  'Delay': 'Ação é consumida ao declarar, mas resolve depois. Entra em Cooldown 1 e ao acabar resolve sem custo.',
  'Cooldown': 'Após o uso, a ação fica indisponível por X Rounds.',
  // Keywords de Ataque
  'Security Attack': 'Modifica quanto de Defesa o ataque reduz do alvo. Também afeta a redução de Armadura com Piercing.',
  'Security Attack +1': 'O ataque reduz 1 ponto a mais de Defesa do alvo (e Armadura, se tiver Piercing).',
  'Security Attack -1': 'O ataque reduz 1 ponto a menos de Defesa do alvo.',
  'Security Attack +2': 'O ataque reduz 2 pontos a mais de Defesa do alvo.',
  'Blast': 'Atinge todos num raio X a partir de um ponto no alcance. Apenas a maior Defesa entre os alvos é reduzida da rolagem.',
  'Blast 1': 'Atinge todos num raio 1 a partir de um ponto no alcance. Apenas a maior Defesa entre os alvos é reduzida da rolagem.',
  'Blast 2': 'Atinge todos num raio 2 a partir de um ponto no alcance. Apenas a maior Defesa entre os alvos é reduzida da rolagem.',
  'Jamming': 'Ignora Digital Body e quaisquer variações.',
  'Alliance': 'Pode consumir ação de aliado no alcance. Ataque recebe Security Attack +1 e adiciona dados = valor de uma Afinidade do aliado.',
  'Piercing': 'Ignora Blocker e não sofre redução pela Defesa. Ao causar dano, reduz Armadura pelo Security Attack atual.',
  'Assassinate': 'Ignora Imune, Inefetivo e Resistente. Não é redirecionado por Decoy. Permite escolher alvo livremente.',
  // Reações
  'Counter': 'Quando alvo de ataque corpo a corpo, rola Força + Briga. Se vencer, anula e causa dano. Não funciona vs nível 5+.',
  'Blocker': 'Intercepta ataque a um aliado, teleportando-se e recebendo o golpe no lugar. Blocker é removido após.',
  'Save': 'Retorna o Digimon ao Digivice. Pode voltar como Ação Livre no próximo turno do Domador.',
  'Armor Purge': 'Quando o Digimon sofreria dano fatal, remove 1 carga de Armor Evolution e reduz o dano a 0.',
  // Ferimentos
  'Burn': 'Relógio de ferimento (máx 10 cargas). Ao estourar: 7 dano (humano: 2). Por 3 Rounds, no fim do turno sofre o mesmo dano. Resistir: Vigor + Resistência.',
  'Poison': 'Relógio de ferimento (máx 10 cargas). Ao estourar: 1 dano. Por 3 Rounds, ao rolar dados sofre 1 dano por dado rolado. Resistir: Vigor + Resistência.',
  'Bleed': 'Relógio de ferimento (máx 10 cargas). Ao estourar: 3 dano. Por 3 Rounds, ao mover ou atacar corpo a corpo sofre 2 dano. Resistir: Vigor + Resistência.',
  'Bleeding': 'Relógio de ferimento (máx 10 cargas). Ao estourar: 3 dano. Por 3 Rounds, ao mover ou atacar corpo a corpo sofre 2 dano. Resistir: Vigor + Resistência.',
  'Curse': 'Relógio de ferimento (máx 10 cargas). Ao estourar: perde 2 Memory. Por 3 Rounds, no fim do turno perde 1 Memory. Resistir: Perseverança + Resistência.',
  // Acumulação
  'Sleep': 'Acumulação (máx 3). 1ª carga recupera HP total. Adormecido não age/reage, Defesa ignorada. Remove no fim do próximo turno ou ao sofrer dano. Resistir: Vigor + Resistência.',
  'Charm': 'Acumulação (máx 3). Próxima ação é controlada pelo aplicador. Remove após executar. Resistir: Autocontrole + Resistência.',
  'Bind': 'Acumulação (máx 5). −5 Deslocamento por carga. Se Deslocamento chegar a 0, perde o turno e remove cargas. Resistir: Destreza + Resistência.',
  'Paralysis': 'Acumulação (máx 5). −3 dados em todas as rolagens. No fim do turno remove 1 carga. Resistir: Perseverança + Resistência.',
  'Mist': 'Acumulação (máx 10). A cada 2 cargas, dano recebido +1. Com 9+ cargas, rolagens contra o alvo ganham +1 sucesso. Resistir: Destreza + Resistência.',
  'De-Digivolve': 'Acumulação (máx 3). Regride 1 nível por carga. Após regressão, remove todas as cargas. Resistir: Perseverança + Resistência.',
  'Decoy': 'Acumulação (máx 3). No início do turno de cada inimigo, rola Int + Resistência. Falha obriga a atacar o alvo do Decoy. Resistir: Presença + Resistência.',
  // Positivas
  'Flight': 'Imune a ataques corpo a corpo. Ignora obstáculos e áreas impassáveis. No fim do turno perde 1 carga.',
  'Haste': 'Acumulação (máx 2). +5 Deslocamento por carga. Se Deslocamento ≥ 21, ganha turno extra. Remove todas ao ativar.',
  'Phantasm': 'Não pode ser alvo de ataques ou efeitos. Se atacar, acerta automaticamente e causa dano total. Remove ao atacar.',
  'Armor Evolution': 'Muda o nível para Armor. Permanece enquanto a barra Digimental for maior que 0.',
  'Reboot': 'Pode usar reações no turno inimigo como Ações Livres. Cada reação remove 1 carga.',
  'Unsuspend': 'Pode realizar ataques como Ações Livres no próprio turno. Cada ataque remove 1 carga.',
  // Permanentes negativas
  'Blind': 'Permanente. Todas as rolagens viram Chance Rolls (1d10, sucesso só com 10). Resistir: Raciocínio + Resistência.',
  'Rage': 'Permanente. +1 sucesso em ataques, mas deve atacar quem aplicou. Se não causar dano, −2 sucessos no turno seguinte. Resistir: Autocontrole + Resistência.',
  'Big Bad Wolf': 'Permanente. Ações de Ledo contra o alvo ganham efeitos extras. Dura até fim do combate. Resistir: Força + Resistência.',
  'Sacrifice': 'Permanente. Memory vai a 0 e fica bloqueada. Alvo não age/reage. Só remove com ação complexa + Digivice autoridade ≥ do SIGN.',
  // Climas
  'Intense Sunlight': 'Dano de Fogo +2, Água −2. Burn recebe +1 sucesso e +2 cargas extras. Algumas habilidades têm efeitos adicionais.',
  'Dense Fog': 'Enfraquecer +2 sucessos. Físico −2 sucessos. Blind e Mist recebem +1 sucesso.',
  'Heavy Rain': 'Dano de Água +2, Fogo −2. Trovão +1 sucesso. Paralysis aplica +2 cargas extras.',
  'Clear Skies': 'Clima padrão. Não há efeitos adicionais.',
  // Outros
  'Digital Body': 'Caso seja atacado por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.',
  'Chance Roll': '1d10, sucesso apenas com resultado acima de 10.',
  'Averted Gaze': 'Efeito especial de Wormmon — alterado pela passiva To You, from Me.',
  'Worm Bait': 'Efeito especial de Wormmon — redução de atributos anulada pela passiva Id: Fragile Perception.',
}
