import type { ClimaEntry, KeywordEntry, ConditionEntry } from '../types'

export const BASE_CLIMAS: ClimaEntry[] = [
  {
    id: 'clima-base-clear', name: 'Clear Skies', type: 'Natural', color: 'ink-mute', icon: '☀',
    effects: [{ tag: 'Neutro', desc: 'Não há efeitos adicionais. Clima inicial padrão.', color: 'ink-mute' }],
    gm_only: false,
  },
  {
    id: 'clima-base-sun', name: 'Intense Sunlight', type: 'Natural', color: 'orange', icon: '🌞',
    effects: [
      { tag: 'Fogo +2',  desc: 'Dano de ataques de Fogo +2.',                                          color: 'orange' },
      { tag: 'Água −2',  desc: 'Dano de ataques de Água −2.',                                          color: 'blue'   },
      { tag: 'Burn',     desc: 'Ações que apliquem Burn recebem +1 sucesso e +2 cargas extras.',        color: 'coral'  },
    ],
    gm_only: false,
  },
  {
    id: 'clima-base-fog', name: 'Dense Fog', type: 'Natural', color: 'indigo', icon: '🌫',
    effects: [
      { tag: 'Enfraquecer +2', desc: 'Ações que usem Enfraquecer recebem +2 sucessos.',              color: 'indigo'   },
      { tag: 'Físico −2',      desc: 'Ataques Físicos têm −2 sucessos.',                             color: 'ink-mute' },
      { tag: 'Blind / Mist',   desc: 'Ações que causem Blind ou Mist recebem +1 sucesso.',           color: 'indigo'   },
    ],
    gm_only: false,
  },
  {
    id: 'clima-base-rain', name: 'Heavy Rain', type: 'Natural', color: 'blue', icon: '🌧',
    effects: [
      { tag: 'Água +2',     desc: 'Dano de ataques de Água +2.',                                   color: 'blue'  },
      { tag: 'Fogo −2',     desc: 'Dano de ataques de Fogo −2.',                                   color: 'coral' },
      { tag: 'Trovão +1',   desc: 'Ações de Trovão recebem +1 sucesso.',                           color: 'gold'  },
      { tag: 'Paralysis',   desc: 'Ações que apliquem Paralysis aplicam +2 cargas extras.',        color: 'indigo'},
    ],
    gm_only: false,
  },
]

export const BASE_KEYWORDS: KeywordEntry[] = [
  { id: 'kw-base-blitz',    keyword: 'Blitz',           category: 'Ação',            type: 'neutral',  desc: 'Ação vira **Ação Livre**. Só pode ser ativada **1x por Round**.' },
  { id: 'kw-base-delay',    keyword: 'Delay',           category: 'Ação',            type: 'neutral',  desc: 'Ação é consumida ao declarar, mas resolve depois. Entra em [Cooldown 1] e ao acabar resolve sem custo.' },
  { id: 'kw-base-cooldown', keyword: 'Cooldown',        category: 'Ação',            type: 'neutral',  desc: 'Após o uso, a ação fica indisponível por **X Rounds**.' },
  { id: 'kw-base-secatk',   keyword: 'Security Attack', category: 'Ataque / Efeito', type: 'neutral',  desc: 'Modifica quanto de Defesa o ataque reduz do alvo. Também afeta a redução de Armadura com [Piercing].' },
  { id: 'kw-base-blast',    keyword: 'Blast',           category: 'Ataque / Efeito', type: 'neutral',  desc: 'Atinge todos num raio X a partir de um ponto no alcance. Apenas a **maior Defesa** entre os alvos é reduzida da rolagem.' },
  { id: 'kw-base-jamming',  keyword: 'Jamming',         category: 'Ataque / Efeito', type: 'neutral',  desc: 'Ignora **Digital Body** e quaisquer variações.' },
  { id: 'kw-base-alliance', keyword: 'Alliance',        category: 'Ataque / Efeito', type: 'neutral',  desc: 'Pode consumir ação de aliado no alcance. Ataque recebe [Security Attack +1] e adiciona dados = valor de uma Afinidade do aliado.' },
  { id: 'kw-base-piercing', keyword: 'Piercing',        category: 'Ataque / Efeito', type: 'neutral',  desc: 'Ignora [Blocker] e não sofre redução de dados pela Defesa. Ao causar dano, reduz Armadura pelo [Security Attack] atual.' },
  { id: 'kw-base-assassin', keyword: 'Assassinate',     category: 'Ataque / Efeito', type: 'neutral',  desc: 'Ignora [Imune], [Inefetivo], [Resistente]. Não é redirecionado por [Decoy]. Permite escolher alvo livremente.' },
  { id: 'kw-base-counter',  keyword: 'Counter',         category: 'Reações',         type: 'reaction', desc: 'Quando alvo de ataque corpo a corpo, rola **Força + Briga**. Se vencer, anula e causa dano. Não funciona vs nível 5+.' },
  { id: 'kw-base-blocker',  keyword: 'Blocker',         category: 'Reações',         type: 'reaction', desc: 'Intercepta ataque a um aliado, teleportando-se e recebendo o golpe no lugar. Blocker é removido após.' },
  { id: 'kw-base-save',     keyword: 'Save',            category: 'Reações',         type: 'reaction', desc: 'Retorna o Digimon ao Digivice. Pode voltar como Ação Livre no próximo turno do Domador.' },
  { id: 'kw-base-apurge',   keyword: 'Armor Purge',     category: 'Reações',         type: 'reaction', desc: 'Quando Digimon sofreria dano fatal, remove 1 carga de [Armor Evolution] e reduz o dano a 0.' },
]

export const BASE_CONDITIONS: ConditionEntry[] = [
  // Ferimento
  { id:'cond-base-burn',      name:'Burn',                    category:'Ferimento',               type:'wound',    resist:'Vigor + Resistência',         desc:'Ao estourar: **7 dano** (humano: 2). Por 3 Rounds, no fim do turno sofre o mesmo dano.' },
  { id:'cond-base-poison',    name:'Poison',                  category:'Ferimento',               type:'wound',    resist:'Vigor + Resistência',         desc:'Ao estourar: **1 dano**. Por 3 Rounds, ao rolar dados sofre 1 dano por dado rolado.' },
  { id:'cond-base-bleed',     name:'Bleed',                   category:'Ferimento',               type:'wound',    resist:'Vigor + Resistência',         desc:'Ao estourar: **3 dano**. Por 3 Rounds, ao mover ou atacar corpo a corpo sofre 2 dano.' },
  { id:'cond-base-curse',     name:'Curse',                   category:'Ferimento',               type:'wound',    resist:'Perseverança + Resistência',  desc:'Ao estourar: perde **2 Memory**. Por 3 Rounds, no fim do turno perde 1 Memory; sem Memory, perde HP equivalente.' },
  // Acumulação
  { id:'cond-base-sleep',     name:'Sleep (máx 3)',           category:'Acumulação',              type:'stack',    resist:'Vigor + Resistência',         desc:'1ª carga recupera HP total. Adormecido não age/reage, Defesa ignorada, ataques causam dano total. Remove no fim do próximo turno ou ao sofrer dano.' },
  { id:'cond-base-charm',     name:'Charm (máx 3)',           category:'Acumulação',              type:'stack',    resist:'Autocontrole + Resistência',  desc:'Próxima ação é controlada pelo aplicador. Cargas extras controlam ações extras. Remove após executar.' },
  { id:'cond-base-bind',      name:'Bind (máx 5)',            category:'Acumulação',              type:'stack',    resist:'Destreza + Resistência',      desc:'−5 Deslocamento por carga. Se Deslocamento chegar a 0, no próximo turno perde o turno e remove cargas.' },
  { id:'cond-base-paralysis', name:'Paralysis (máx 5)',       category:'Acumulação',              type:'stack',    resist:'Perseverança + Resistência',  desc:'−3 dados em **todas** as rolagens. No fim do turno remove 1 carga.' },
  { id:'cond-base-mist',      name:'Mist (máx 10)',           category:'Acumulação',              type:'stack',    resist:'Destreza + Resistência',      desc:'A cada 2 cargas, dano recebido +1. Com 9+ cargas, rolagens contra o alvo ganham +1 sucesso.' },
  { id:'cond-base-dedigiv',   name:'De-Digivolve (máx 3)',   category:'Acumulação',              type:'stack',    resist:'Perseverança + Resistência',  desc:'Regride 1 nível por carga (cargas simultâneas acumulam). Após regressão, remove todas as cargas.' },
  { id:'cond-base-decoy',     name:'Decoy (máx 3)',           category:'Acumulação',              type:'stack',    resist:'Presença + Resistência',      desc:'No início do turno de cada inimigo, ele rola Inteligência + Resistência. Falha obriga a atacar o alvo do Decoy. Remove 1 carga no fim do turno do afetado.' },
  // Positivas de Acumulação
  { id:'cond-base-flight',    name:'Flight',                  category:'Positivas de Acumulação', type:'positive', desc:'Imune a ataques corpo a corpo. Ignora obstáculos e áreas impassáveis. No fim do turno perde 1 carga.' },
  { id:'cond-base-haste',     name:'Haste (máx 2)',           category:'Positivas de Acumulação', type:'positive', desc:'+5 Deslocamento por carga. Se Deslocamento ≥ 21, ganha turno extra (iniciativa = metade do principal). Remove todas ao ativar.' },
  // Permanentes — Negativas
  { id:'cond-base-blind',     name:'Blind',                   category:'Permanentes — Negativas', type:'neg',      resist:'Raciocínio + Resistência',    desc:'Todas as rolagens viram **Chance Rolls** (1d10, sucesso só com 10). Ações de escolha de alvo também.' },
  { id:'cond-base-rage',      name:'Rage',                    category:'Permanentes — Negativas', type:'neg',      resist:'Autocontrole + Resistência',  desc:'+1 sucesso em ataques no próprio turno, mas **deve atacar quem aplicou**. Se não causar dano, −2 sucessos em tudo no turno seguinte; depois remove.' },
  { id:'cond-base-bbwolf',    name:'Big Bad Wolf',            category:'Permanentes — Negativas', type:'neg',      resist:'Força + Resistência',         desc:'Ações de Ledo contra o alvo ganham efeitos extras descritos nas skills. Dura até fim do combate ou remoção específica.' },
  { id:'cond-base-sacrifice', name:'Sacrifice (só humanos)',  category:'Permanentes — Negativas', type:'neg',      desc:'Memory vai a 0 e fica bloqueada. Alvo não age/reage nem pode sair. Um [SIGN] pode converter 30% do MAXHP em Memory. Só remove com ação complexa + Digivice de autoridade ≥ do [SIGN].' },
  // Permanentes — Positivas
  { id:'cond-base-phantasm',  name:'Phantasm',                category:'Permanentes — Positivas', type:'positive', desc:'Não pode receber Blocker/Decoy nem ser alvo de ataques/efeitos. Se atacar, acerta automaticamente e causa dano total. Remove ao atacar.' },
  { id:'cond-base-armorev',   name:'Armor Evolution',         category:'Permanentes — Positivas', type:'positive', desc:'Muda o nível para Armor. Permanece enquanto a barra Digimental for maior que 0.' },
  { id:'cond-base-reboot',    name:'Reboot',                  category:'Permanentes — Positivas', type:'positive', desc:'Pode usar reações no turno inimigo como Ações Livres. Cada reação remove 1 carga. Se não usar, remove todas no fim do round.' },
  { id:'cond-base-unsuspend', name:'Unsuspend',               category:'Permanentes — Positivas', type:'positive', desc:'Pode realizar ataques como Ações Livres no próprio turno. Cada ataque remove 1 carga. Se não atacar, remove todas no fim do turno.' },
]

export function getEffectiveClimas(customClimas: ClimaEntry[]): ClimaEntry[] {
  if (customClimas.length === 0) return BASE_CLIMAS
  const hasBase = customClimas.some(c => BASE_CLIMAS.some(b => b.id === c.id))
  if (!hasBase) return [...BASE_CLIMAS, ...customClimas]
  return customClimas
}

export function groupBy<T>(arr: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const k = key(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return Array.from(map.entries())
}
