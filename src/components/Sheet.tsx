import type {
  AppState, Tamer, DigimonLine, DigimonStage, Bug, Sign,
  AttributeKey, Attributes, SkillSet, TamerSkill, DigimonSkill, DigimonStageStatus, PassiveToggleBonus,
  SkillTreePhase
} from '../types'
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS, AFFINITY_KEYS, PORTRAIT_LIST, BUG_COLORS } from '../types'
import {
  findTamer, findDigimon, findBug,
  calcTamerDerived, calcDigimonDerived,
  xpCostAttribute, xpCostSkill,
  makeEmptyStage, makeDefaultAttributes, makeSlimLine,
  buySkillTreeSkill,
  DIGIMON_DEFAULT_IMAGES
} from '../data/store'
import { GrainFill } from "./GrainFill"
import { Toast } from './Toast'
import styles from './Sheet.module.css'

// ── Modo de visualização: número ou bolinhas ─────────────────────
import React, { useState, useMemo, useCallback, useRef, createContext, useContext } from 'react'
type DisplayMode = 'number' | 'dots'
const DisplayModeCtx = createContext<DisplayMode>('number')

// Helper: renderiza valor como bolinhas (◌/●) ou número
function ValueDisplay({ value, max, pend = 0 }: { value: number; max: number; pend?: number }) {
  const mode = useContext(DisplayModeCtx)
  if (mode === 'dots') {
    const filled = Math.min(value, max)
    const pendFilled = Math.min(value + pend, max)
    return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: 1, userSelect: 'none', lineHeight: 1 }}>
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} style={{ color: i < pendFilled ? (i >= filled ? 'var(--coral)' : 'var(--ink)') : 'var(--ink-mute)', fontSize: i < pendFilled ? 12 : 11 }}>
            {i < pendFilled ? '●' : '◌'}
          </span>
        ))}
      </span>
    )
  }
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, minWidth: 16, textAlign: 'right' }}>
      {value}
    </span>
  )
}

export type SheetSubject =
  | { kind: 'tamer';  id: string }
  | { kind: 'pair';   tamerId: string; digimonId: string; stage?: number }
  | { kind: 'wild' | 'digimon'; id: string }
  | { kind: 'bug';    id: string }
  | { kind: 'sign';   id: string }

// ── Parser de Tokens ────────────────────────────────────────────────
// Detecta padrões como [Puppet Token / Lv.3], [Silhouette Token], [Enhanced Puppet Token / Lv.4]
// Retorna null se o efeito não invocar token.
export interface TokenSpawn {
  name:    string   // ex: 'Puppet Token', 'Silhouette Token'
  level:   string   // ex: 'Lv.3', 'Lv.4', ou '' se não especificado
  qty:     number   // quantidade a invocar (padrão 1, detectado por "1 [X Token]" ou "3 Silhouette Tokens")
}

export function parseTokenSpawns(effect: string): TokenSpawn[] {
  const tokens: TokenSpawn[] = []
  // Padrão: [Nome Token / Lv.N] ou [Nome Token Lv.N] ou [Nome Token]
  // Captura: nome = tudo antes de " Token", level = Lv.N se existir
  const bracketRe = /\[([^\]]*Token[^\]]*)\]/gi
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = bracketRe.exec(effect)) !== null) {
    const raw = m[1].trim()
    // Ignorar "[Token]" genérico (referência, não invocação)
    if (raw === 'Token' || raw === 'Tokens') continue
    // Ignorar "[Silhouette Tokens]" quando é referência a todos (sem "Invoca" antes)
    // Detectar se há verbo de invocação na sentença que contém esse match
    const sentenceStart = Math.max(0, effect.lastIndexOf('.', m.index) + 1)
    const sentence = effect.slice(sentenceStart, effect.indexOf('.', m.index) === -1 ? undefined : effect.indexOf('.', m.index) + 1)
    const isSpawn = /invoca|invocar|ganha|cria|criar|adiciona/i.test(sentence)
    if (!isSpawn) continue

    // Extrair nível: "/ Lv.N" ou " Lv.N"
    const levelMatch = raw.match(/[/\s]+(Lv\.\d+)/i)
    const level = levelMatch ? levelMatch[1] : ''
    // Normalizar nome: remover "/ Lv.N" ou " Lv.N" do final
    const name = raw.replace(/\s*\/?\s*Lv\.\d+/i, '').trim()

    // Detectar quantidade: "1 [X Token]", "3 [X Token]"
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

// ── utilidades inline ──────────────────────────────────────────────
const inp = (val: string, set: (v: string) => void, ph = '', style?: React.CSSProperties) => (
  <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
    className={styles.formInput} style={style} />
)
const num = (val: number, set: (v: number) => void, min = 0, max = 10) => (
  <input type="number" min={min} max={max} value={val}
    onChange={e => set(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
    className={styles.numInput} />
)

// ── StatRow ────────────────────────────────────────────────────────
type StatEntry = [string, string|number] | [string, string|number, (v: number) => void]

function StatRow({ entries }: { entries: StatEntry[] }) {
  return (
    <div className={styles.statRow}>
      {(entries as StatEntry[]).map(([k, v, onEdit]) => (
        <div key={k} className={styles.statCell}>
          <span className={styles.statKey}>{k}</span>
          {onEdit ? (
            <div style={{ display:'flex', alignItems:'center', gap:3 }}>
              <button onClick={() => (onEdit as Function)(
                  parseInt(String(v).split('/')[0]) - 1
                )}
                style={{ background:'transparent', border:'none', cursor:'pointer',
                  fontFamily:'var(--font-mono)', fontSize:15, color:'var(--ink-mute)', padding:'0 1px', lineHeight:1 }}>−</button>
              <span className={styles.statVal}>{v}</span>
              <button onClick={() => (onEdit as Function)(
                  parseInt(String(v).split('/')[0]) + 1
                )}
                style={{ background:'transparent', border:'none', cursor:'pointer',
                  fontFamily:'var(--font-mono)', fontSize:15, color:'var(--ink-mute)', padding:'0 1px', lineHeight:1 }}>+</button>
            </div>
          ) : (
            <span className={styles.statVal}>{v}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── XP Staging (pendente + confirmar) ─────────────────────────────
// Retorna quantos pontos de XP custará a compra pendente
function pendingCost(pending: Record<string, number>, base: Attributes | Record<string, number>, isAttr: boolean) {
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

// ── AttributeGrid editável com staging ────────────────────────────
function AttributeGrid({ attrs, editable, pending, onPend, onUnpend, onFreeEdit, freeMode: freeModeExternal, onFreeModeChange }: {
  attrs: Attributes | Record<string, number>
  editable?: boolean
  pending?: Record<string, number>
  onPend?: (k: AttributeKey) => void
  onUnpend?: (k: AttributeKey) => void
  onFreeEdit?: (k: AttributeKey, delta: 1 | -1) => void
  freeMode?: boolean
  onFreeModeChange?: (v: boolean) => void
}) {
  const [freeModeInternal, setFreeModeInternal] = useState(false)
  const freeMode = freeModeExternal !== undefined ? freeModeExternal : freeModeInternal
  const setFreeMode = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(freeMode) : v
    setFreeModeInternal(next)
    onFreeModeChange?.(next)
  }
  return (
    <div>
      {editable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setFreeMode(p => !p)}
            className={freeMode ? styles.pendBtn : styles.pendBtnUndo}
            style={{ width: 'auto', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
            title="Editar atributos diretamente, sem custo de XP (para corrigir erros ou testes)">
            {freeMode ? '✓ Modo livre ativo' : 'Modo livre (sem XP)'}
          </button>
          {freeMode && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>edição direta · sem custo</span>}
        </div>
      )}
      <div className={styles.attrGrid}>
        {ATTRIBUTE_GROUPS.map(g => (
          <div key={g.label} className={styles.attrGroup}>
            <div className={styles.attrGroupLabel}>{g.label}</div>
            {g.keys.map(k => {
              const base = attrs[k] ?? 0
              const pend = pending?.[k] ?? 0
              const displayed = base + pend
              return (
                <div key={k} className={styles.attrRow}>
                  <span className={styles.attrName}>{k}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <ValueDisplay value={base} max={5} pend={pend} />
                    {useContext(DisplayModeCtx) === 'number' && pend > 0 && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', fontWeight: 700 }}>
                        +{pend}
                      </span>
                    )}
                    {editable && freeMode && (
                      <>
                        <button onClick={() => onFreeEdit?.(k, 1)} className={styles.attrFreeBtn} title={`${k} +1 (sem XP)`} disabled={base >= 5}>+</button>
                        <button onClick={() => onFreeEdit?.(k, -1)} className={styles.attrFreeBtn} title={`${k} -1 (sem XP)`} disabled={base <= 1}>−</button>
                      </>
                    )}
                    {editable && !freeMode && displayed < 5 && (
                      <button onClick={() => onPend?.(k)} className={styles.pendBtn}
                        title={`+1 ${k} (custa ${xpCostAttribute(displayed + 1)} XP)`}>+</button>
                    )}
                    {editable && !freeMode && pend > 0 && (
                      <button onClick={() => onUnpend?.(k)} className={styles.pendBtnUndo} title="Desfazer">−</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SkillGrid editável com staging ────────────────────────────────
function SkillGrid({ skills, editable, freeMode, pending, onPend, onUnpend, onFreeEdit }: {
  skills: SkillSet
  editable?: boolean
  freeMode?: boolean
  pending?: Record<string, number>
  onPend?: (cat: keyof SkillSet, name: string) => void
  onUnpend?: (cat: keyof SkillSet, name: string) => void
  onFreeEdit?: (cat: keyof SkillSet, name: string, delta: number) => void
}) {
  return (
    <div className={styles.skillsWrap}>
      {(Object.entries(skills) as [keyof SkillSet, Record<string, number>][]).map(([cat, sk]) => (
        <div key={cat} className={styles.skillBlock}>
          <h4 className={styles.skillCat}>{cat}</h4>
          <div className={styles.skillGrid}>
            {Object.entries(sk).map(([name, val]) => {
              const pend = pending?.[name] ?? 0
              const displayed = val + pend
              return (
                <div key={name} className={styles.skillRow}>
                  <span>{name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ValueDisplay value={val} max={5} pend={pend} />
                    {useContext(DisplayModeCtx) === 'number' && pend > 0 && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', fontWeight: 700 }}>+{pend}</span>
                    )}
                    {editable && freeMode && (
                      <>
                        <button onClick={() => onFreeEdit?.(cat, name, 1)} className={styles.attrFreeBtn} disabled={val >= 5}>+</button>
                        <button onClick={() => onFreeEdit?.(cat, name, -1)} className={styles.attrFreeBtn} disabled={val <= 0}>−</button>
                      </>
                    )}
                    {editable && !freeMode && displayed < 5 && (
                      <button onClick={() => onPend?.(cat, name)} className={styles.pendBtn}
                        title={`+1 ${name} (custa ${xpCostSkill(displayed + 1)} XP)`}>+</button>
                    )}
                    {editable && !freeMode && pend > 0 && (
                      <button onClick={() => onUnpend?.(cat, name)} className={styles.pendBtnUndo} title="Desfazer">−</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Weakness editable ─────────────────────────────────────────────
function WeaknessBox({ weakness, editable, onChange }: {
  weakness: Record<string, string>
  editable?: boolean
  onChange?: (w: Record<string, string>) => void
}) {
  const [addKey, setAddKey] = useState('')
  const [addVal, setAddVal] = useState('')
  if (!editable && !Object.keys(weakness).length) return null
  return (
    <div className={styles.weaknessBox}>
      {Object.entries(weakness).map(([k, v]) => (
        <div key={k} className={styles.weaknessRow}>
          {editable ? (
            <>
              <input value={k} readOnly className={styles.weaknessKeyInput} style={{ width: 140 }} />
              <input value={v}
                onChange={e => onChange?.({ ...weakness, [k]: e.target.value })}
                className={styles.weaknessValInput} />
              <button onClick={() => { const w = { ...weakness }; delete w[k]; onChange?.(w) }}
                className={styles.cardDel} style={{ position: 'static', opacity: 1, marginLeft: 4 }}>×</button>
            </>
          ) : (
            <>
              <span className={styles.weaknessKey}>{k}</span>
              <span className={styles.weaknessVal}>{v}</span>
            </>
          )}
        </div>
      ))}
      {editable && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={addKey} onChange={e => setAddKey(e.target.value)} placeholder="ex: Letal (+2)"
            className={styles.formInput} style={{ flex: '0 0 160px', fontSize: 12 }} />
          <input value={addVal} onChange={e => setAddVal(e.target.value)} placeholder="ex: Vacina"
            className={styles.formInput} style={{ flex: 1, fontSize: 12 }} />
          <button onClick={() => {
            if (!addKey.trim()) return
            onChange?.({ ...weakness, [addKey.trim()]: addVal.trim() })
            setAddKey(''); setAddVal('')
          }} className={styles.btnGhost} style={{ fontSize: 12, padding: '5px 10px' }}>+ Add</button>
        </div>
      )}
    </div>
  )
}

// ── Mapa de ícones de afinidade ──────────────────────────────────
const AFFINITY_ICONS: Record<string, string> = {
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

// ── AffinityGrid editable ─────────────────────────────────────────
function AffinityGrid({ affinity, editable, freeMode, onChange }: {
  affinity: Partial<Record<string, number>>
  editable?: boolean
  freeMode?: boolean
  onChange?: (a: Partial<Record<string, number>>) => void
}) {
  return (
    <div className={styles.affinityGrid}>
      {(() => {
        const mode = useContext(DisplayModeCtx)
        // Linha 1: 5 elementos | Linha 2: 5 elementos | Linha 3: 4 elementos (centralizados)
        const TOP    = AFFINITY_KEYS.slice(0, 10)   // Fogo→Trovão
        const BOTTOM = AFFINITY_KEYS.slice(10)       // Físico, Enfraquecer, Resistência, Cura

        const renderCell = (k: string) => (
          <div key={k} className={styles.affinityRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
              <span className={styles.affinityIcon}>
                {AFFINITY_ICONS[k]
                  ? <img src={AFFINITY_ICONS[k]} alt={k} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 1 }} />
                  : <span style={{ fontSize: 12 }}>{k}</span>
                }
                <span className={styles.affinityTooltip}>{k}</span>
              </span>
              {mode === 'number' && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <ValueDisplay value={affinity[k] ?? 0} max={10} />
              {(editable || freeMode) && (
                <>
                  <button onClick={() => onChange?.({ ...affinity, [k]: Math.min(10, (affinity[k] ?? 0) + 1) })}
                    className={freeMode ? styles.attrFreeBtn : styles.pendBtn}>+</button>
                  <button onClick={() => onChange?.({ ...affinity, [k]: Math.max(0, (affinity[k] ?? 0) - 1) })}
                    className={freeMode ? styles.attrFreeBtn : styles.pendBtnUndo}>−</button>
                </>
              )}
            </div>
          </div>
        )

        // Grid 4 colunas: 14 items + 2 células vazias na linha 3
        // Linha 1: Fogo Água Terra Vento
        // Linha 2: Trovão Gelo Metal Madeira
        // Linha 3: Luz Trevas [vazio] [vazio]
        // Linha 4: Físico Enfraquecer Resistência Cura
        const ALL = AFFINITY_KEYS
        const cells: (string | null)[] = [
          ...ALL.slice(0, 10),   // 10 elementos (linhas 1-3 parcial)
          null, null,             // 2 células vazias para completar linha 3
          ...ALL.slice(10),      // Físico Enfraquecer Resistência Cura
        ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 16px' }}>
            {cells.map((k, i) =>
              k ? renderCell(k) : <div key={`e-${i}`} />
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ── SkillCard editable inline ─────────────────────────────────────
// ── Dicionário de tooltips para keywords e condições ─────────────────────────
const KEYWORD_TIPS: Record<string, string> = {
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

// Tooltip posicionado via JS para nunca sair da tela
function KwTooltip({ label, tip }: { label: string; tip: string }) {
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)
  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tipW = 260
    const margin = 12
    let left = rect.left + rect.width / 2 - tipW / 2
    // Clamp para não sair da tela
    left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin))
    const top = rect.top - 8  // acima do elemento; o CSS vai subtrair a altura via translateY
    setPos({ top, left })
  }
  return (
    <span className="kwTip" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      <span className="kwTipLabel">{label}</span>
      {pos && (
        <span className="kwTipBox" style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          transform: 'translateY(-100%)',
        }}>{tip}</span>
      )}
    </span>
  )
}

// Parser que transforma [Keyword] em spans com tooltip
function EffectText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          const key = part.slice(1, -1)
          const tip = KEYWORD_TIPS[key]
          if (tip) return <KwTooltip key={i} label={part} tip={tip} />
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </>
  )
}

function SkillCard({ s, editable, onDelete, onChange, onToggle, toggleActive, toggleX, onSpawnToken }: {
  s: TamerSkill | DigimonSkill
  editable?: boolean
  onDelete?: () => void
  onChange?: (s: TamerSkill | DigimonSkill) => void
  onToggle?: (active: boolean, x?: number) => void
  toggleActive?: boolean
  toggleX?: number
  onSpawnToken?: (token: TokenSpawn) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s)
  const isPassive = s.type === 'passive'
  const isTamer = 'target' in s
  const hasToggle = isPassive && !!s.toggleBonus
  const ds = s as DigimonSkill
  const ts = s as TamerSkill

  if (editing) {
    const dd = draft as DigimonSkill
    const dt = draft as TamerSkill
    return (
      <div className={`${styles.skillCard} ${styles.editing}`}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value as any }))} className={styles.formInput} style={{ flex: '0 0 auto' }}>
            <option value="action">Ação</option>
            <option value="reaction">Reação</option>
            <option value="passive">Passiva</option>
          </select>
          <input value={draft.keyword} onChange={e => setDraft(d => ({ ...d, keyword: e.target.value }))} placeholder="Palavra-chave" className={styles.formInput} style={{ flex: 1 }} />
        </div>
        <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Nome *" className={styles.formInput} style={{ marginBottom: 6, width: '100%' }} />
        {isTamer ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <input value={dt.target ?? ''} onChange={e => setDraft(d => ({ ...d, target: e.target.value }))} placeholder="Alvo" className={styles.formInput} />
              <input value={dt.custo ?? ''} onChange={e => setDraft(d => ({ ...d, custo: e.target.value }))} placeholder="Custo (ex: -2 Memory, Cooldown 3)" className={styles.formInput} />
            </div>
            <input value={dt.dados ?? ''} onChange={e => setDraft(d => ({ ...d, dados: e.target.value }))} placeholder="Dados (ex: Int + Folclore)" className={styles.formInput} style={{ marginBottom: 6, width: '100%' }} />
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
            <input value={dd.alcance ?? ''} onChange={e => setDraft(d => ({ ...d, alcance: e.target.value }))} placeholder="Alcance" className={styles.formInput} />
            <input value={dd.custo ?? ''} onChange={e => setDraft(d => ({ ...d, custo: e.target.value }))} placeholder="Custo (ex: -2 Memory, Cooldown 3)" className={styles.formInput} />
            <input value={dd.dados ?? ''} onChange={e => setDraft(d => ({ ...d, dados: e.target.value }))} placeholder="Dados" className={styles.formInput} />
          </div>
        )}
        <textarea value={draft.effect} onChange={e => setDraft(d => ({ ...d, effect: e.target.value }))} placeholder="Efeito" className={styles.formInput} rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={styles.btnSolid} style={{ fontSize: 12 }} onClick={() => { onChange?.(draft); setEditing(false) }}>Salvar</button>
          <button className={styles.btnGhost} style={{ fontSize: 12 }} onClick={() => { setDraft(s); setEditing(false) }}>Cancelar</button>
        </div>
      </div>
    )
  }

  // Linha de rolagem
  const dadosLine = isTamer
    ? [ts.target && `Alvo: ${ts.target}`, ts.custo && `Custo: ${ts.custo}`, ts.dados && `Dados: ${ts.dados}`].filter(Boolean).join(' · ')
    : [ds.alcance, ds.custo !== undefined && ds.custo !== '' && `Custo: ${ds.custo}`, ds.dados && `Dados: ${ds.dados}`].filter(Boolean).join(' · ')

  const isActive = toggleActive ?? false
  const xVal    = toggleX ?? 0

  return (
    <div className={`${styles.skillCard} ${isPassive ? styles.passive : ''} ${isActive ? styles.passiveActive : ''}`}>
      {/* Botões de ação — topo direito, sem sobreposição */}
      {editable && (
        <div className={styles.cardActions}>
          {onChange && <button className={styles.cardEdit} onClick={() => setEditing(true)} title="Editar">✎</button>}
          {onDelete && <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', paddingRight: editable ? 80 : 0 }}>
        <span className={`${styles.cardTag} ${isPassive ? styles.tagPassive : s.type === 'reaction' ? styles.tagReaction : ''}`}>
          {isPassive ? 'Passiva' : s.type === 'reaction' ? 'Reação' : 'Ação'}
        </span>
        {s.keyword && <span className={styles.cardKeyword}>[{s.keyword}]</span>}
      </div>

      <h5 className={styles.cardTitle}>{s.title}</h5>

      {dadosLine && <div className={styles.cardDados}>{dadosLine}</div>}

      {s.effect && s.effect !== '—' && <p className={styles.cardEffect}><EffectText text={s.effect} /></p>}

      {/* Toggle de passiva com bônus */}
      {hasToggle && onToggle && (
        <div className={styles.passiveToggleRow}>
          <button
            className={`${styles.passiveToggleBtn} ${isActive ? styles.passiveToggleOn : ''}`}
            onClick={() => onToggle(!isActive, xVal)}
            title={isActive ? 'Desativar' : 'Ativar'}
          >
            {isActive ? '● Ativa' : '○ Inativa'}
          </button>
          {/* Selector de X para skills com bônus variável */}
          {isActive && s.toggleBonus?.xBonus && (
            <div className={styles.passiveXRow}>
              <span className={styles.passiveXLabel}>{s.toggleBonus.xBonus.label}:</span>
              {Array.from({ length: s.toggleBonus.xBonus.xMax + 1 }, (_, i) => i).map(i => (
                <button
                  key={i}
                  className={`${styles.passiveXBtn} ${xVal === i ? styles.passiveXBtnActive : ''}`}
                  onClick={() => onToggle(true, i)}
                >{i}</button>
              ))}
            </div>
          )}
          {/* Resumo dos bônus ativos */}
          {isActive && s.toggleBonus?.statusBonus && (
            <div className={styles.passiveBonusSummary}>
              {Object.entries(s.toggleBonus.statusBonus).map(([k, v]) => {
                const val = (s.toggleBonus?.xBonus ? xVal : 1) * (v ?? 0)
                return val !== 0 ? (
                  <span key={k} className={styles.passiveBonusChip}>
                    {k} {val > 0 ? `+${val}` : val}
                  </span>
                ) : null
              })}
            </div>
          )}
        </div>
      )}

      {/* Botões de invocar token no palco */}
      {onSpawnToken && s.effect && parseTokenSpawns(s.effect).map((tk, i) => (
        <button key={i} onClick={() => onSpawnToken(tk)}
          style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', background: 'transparent',
            border: '1px solid var(--teal)', borderRadius: 6,
            padding: '3px 10px', cursor: 'pointer', color: 'var(--teal)',
            transition: 'all 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal)'; e.currentTarget.style.color = '#f6f2e9' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--teal)' }}>
          ⊕ Invocar {tk.qty > 1 ? `${tk.qty}× ` : ''}{tk.name}{tk.level ? ` (${tk.level})` : ''} no Palco
        </button>
      ))}
    </div>
  )
}

// ── Add Skill Form ─────────────────────────────────────────────────
const PALCO_STATUS_KEYS = ['Defesa','Deslocamento','Iniciativa','Armadura','HP','SecurityAttack'] as const
const PALCO_COND_COLORS = ['coral','orange','blue','purple','teal','green','gold','indigo'] as const

function ConditionBuilder({ label, conditions, onChange }: {
  label: string
  conditions: import('../types').PalcoCondition[]
  onChange: (c: import('../types').PalcoCondition[]) => void
}) {
  const add = () => onChange([...conditions, { label: '', filled: 1, max: 3, color: 'coral' }])
  const remove = (i: number) => onChange(conditions.filter((_,j) => j !== i))
  const update = (i: number, patch: Partial<import('../types').PalcoCondition>) =>
    onChange(conditions.map((c,j) => j === i ? { ...c, ...patch } : c))

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
          textTransform:'uppercase', color:'var(--ink-mute)', flex:1 }}>{label}</span>
        <button type="button" onClick={add}
          style={{ fontFamily:'var(--font-mono)', fontSize:10, background:'transparent',
            border:'1px solid var(--line)', borderRadius:999, padding:'2px 8px',
            cursor:'pointer', color:'var(--ink-mute)' }}>+ condição</button>
      </div>
      {conditions.map((c, i) => (
        <div key={i} style={{ display:'flex', gap:6, marginBottom:4, flexWrap:'wrap', alignItems:'center' }}>
          <input value={c.label} onChange={e => update(i, { label: e.target.value })}
            placeholder="Blocker, Burn..." className={styles.formInput} style={{ flex:2, minWidth:80 }} />
          <input type="number" min={1} max={20} value={c.filled}
            onChange={e => update(i, { filled: parseInt(e.target.value)||1 })}
            className={styles.formInput} style={{ width:44 }} title="Cargas iniciais" />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)' }}>/</span>
          <input type="number" min={1} max={20} value={c.max}
            onChange={e => update(i, { max: parseInt(e.target.value)||3 })}
            className={styles.formInput} style={{ width:44 }} title="Máximo de cargas" />
          <select value={c.color} onChange={e => update(i, { color: e.target.value })}
            className={styles.formInput} style={{ flex:1, minWidth:70 }}>
            {PALCO_COND_COLORS.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
          <button type="button" onClick={() => remove(i)}
            style={{ background:'transparent', border:'none', cursor:'pointer',
              color:'var(--coral)', fontFamily:'var(--font-mono)', fontSize:14 }}>×</button>
        </div>
      ))}
    </div>
  )
}

function AddSkillForm({ isTamer, onAdd, onCancel }: {
  isTamer: boolean; onAdd: (s: TamerSkill | DigimonSkill) => void; onCancel: () => void
}) {
  const [type, setType]       = useState<'action' | 'reaction' | 'passive'>('action')
  const [keyword, setKeyword] = useState('')
  const [title, setTitle]     = useState('')
  const [target, setTarget]   = useState('')
  const [cost, setCost]       = useState('')
  const [dados, setDados]     = useState('')
  const [alcance, setAlcance] = useState('')
  const [effect, setEffect]   = useState('')

  // Toggle no Palco
  const [hasPalcoToggle, setHasPalcoToggle] = useState(false)
  const [palcoLabel, setPalcoLabel]         = useState('')
  const [durationRounds, setDurationRounds] = useState('')
  // statusBonus
  const [statusBonusKeys, setStatusBonusKeys] = useState<string[]>([])
  const [statusBonusVals, setStatusBonusVals] = useState<Record<string,string>>({})
  // xBonus
  const [hasXBonus, setHasXBonus]   = useState(false)
  const [xMax, setXMax]             = useState('3')
  const [xLabel, setXLabel]         = useState('X (Memory gasto)')
  // condições
  const [selfConds, setSelfConds]   = useState<import('../types').PalcoCondition[]>([])
  const [targetConds, setTargetConds] = useState<import('../types').PalcoCondition[]>([])
  // memória
  const [memoryDelta, setMemoryDelta] = useState('')

  const toggleStatusKey = (k: string) =>
    setStatusBonusKeys(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])

  const buildToggleBonus = (): import('../types').PassiveToggleBonus | undefined => {
    if (!hasPalcoToggle) return undefined
    const sb: Record<string,number> = {}
    statusBonusKeys.forEach(k => { const v = parseInt(statusBonusVals[k]); if (!isNaN(v) && v !== 0) sb[k] = v })
    return {
      ...(Object.keys(sb).length ? { statusBonus: sb as any } : {}),
      ...(hasXBonus ? { xBonus: { xMax: parseInt(xMax)||3, label: xLabel } } : {}),
      ...(selfConds.length   ? { selfConditions:   selfConds }   : {}),
      ...(targetConds.length ? { targetConditions: targetConds } : {}),
      ...(memoryDelta && !isNaN(parseInt(memoryDelta)) ? { memoryDelta: parseInt(memoryDelta) } : {}),
      ...(palcoLabel.trim() ? { palcoLabel: palcoLabel.trim() } : {}),
      ...(durationRounds && !isNaN(parseInt(durationRounds)) ? { durationRounds: parseInt(durationRounds) } : {}),
    }
  }

  const handleAdd = () => {
    if (!title.trim()) return
    const toggleBonus = buildToggleBonus()
    if (isTamer) onAdd({ type, keyword, title, target: target||undefined, custo: cost||undefined, dados: dados||undefined, effect, ...(toggleBonus ? { toggleBonus } : {}) } as TamerSkill)
    else         onAdd({ type, keyword, title, alcance: alcance||undefined, custo: cost||undefined, dados: dados||undefined, effect, ...(toggleBonus ? { toggleBonus } : {}) } as DigimonSkill)
  }

  return (
    <div className={styles.addSkillForm}>
      {/* Linha 1: tipo + keyword */}
      <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
        <select value={type} onChange={e => setType(e.target.value as any)} className={styles.formInput} style={{ flex:'0 0 auto' }}>
          <option value="action">Ação</option>
          <option value="reaction">Reação</option>
          <option value="passive">Passiva</option>
        </select>
        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Palavra-chave" className={styles.formInput} style={{ flex:1 }} />
      </div>

      {/* Nome */}
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome *" className={styles.formInput} style={{ marginBottom:6, width:'100%' }} />

      {/* Campos específicos por tipo de personagem */}
      {isTamer ? (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Alvo" className={styles.formInput} />
            <input value={cost} onChange={e => setCost(e.target.value)} placeholder="Custo (ex: -2 Memory)" className={styles.formInput} />
          </div>
          <input value={dados} onChange={e => setDados(e.target.value)} placeholder="Dados (ex: Int + Folclore)" className={styles.formInput} style={{ marginBottom:6, width:'100%' }} />
        </>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6 }}>
          <input value={alcance} onChange={e => setAlcance(e.target.value)} placeholder="Alcance" className={styles.formInput} />
          <input value={cost} onChange={e => setCost(e.target.value)} placeholder="Custo" className={styles.formInput} />
          <input value={dados} onChange={e => setDados(e.target.value)} placeholder="Dados" className={styles.formInput} />
        </div>
      )}

      {/* Efeito */}
      <textarea value={effect} onChange={e => setEffect(e.target.value)} placeholder="Efeito" className={styles.formInput} rows={3} style={{ width:'100%', resize:'vertical', marginBottom:8 }} />

      {/* ── Toggle no Palco ── */}
      <div style={{ border:'1px solid var(--line-soft)', borderRadius:10, overflow:'hidden', marginBottom:8 }}>
        <button type="button"
          onClick={() => setHasPalcoToggle(p => !p)}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
            background: hasPalcoToggle ? 'var(--paper-deep)' : 'transparent',
            border:'none', cursor:'pointer', fontFamily:'var(--font-mono)',
            fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase',
            color: hasPalcoToggle ? 'var(--ink)' : 'var(--ink-mute)', textAlign:'left' }}>
          <span style={{ width:16, height:16, borderRadius:4, border:'1.5px solid var(--line)',
            background: hasPalcoToggle ? 'var(--teal)' : 'transparent', flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#f6f2e9', fontSize:11 }}>
            {hasPalcoToggle ? '✓' : ''}
          </span>
          Ativável no Palco
          <span style={{ fontFamily:'var(--font-body)', fontWeight:400, fontSize:11,
            color:'var(--ink-mute)', textTransform:'none', letterSpacing:0 }}>
            — botão aparece no chip durante combate
          </span>
        </button>

        {hasPalcoToggle && (
          <div style={{ padding:'14px 16px', borderTop:'1px solid var(--line-soft)', display:'flex', flexDirection:'column', gap:12 }}>

            {/* Label e duração */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:8 }}>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                  textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:4 }}>
                  Label do botão (opcional)
                </div>
                <input value={palcoLabel} onChange={e => setPalcoLabel(e.target.value)}
                  placeholder={`⊕ ${title || 'Nome da skill'}`} className={styles.formInput} />
              </div>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                  textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:4 }}>
                  Duração (rounds)
                </div>
                <input type="number" min={0} value={durationRounds} onChange={e => setDurationRounds(e.target.value)}
                  placeholder="—" className={styles.formInput} />
              </div>
            </div>

            {/* Bônus de status */}
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:8 }}>
                Bônus de status (no ativador)
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {PALCO_STATUS_KEYS.map(k => (
                  <button key={k} type="button" onClick={() => toggleStatusKey(k)}
                    style={{ padding:'3px 10px', borderRadius:999, cursor:'pointer',
                      fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em',
                      border:`1px solid ${statusBonusKeys.includes(k) ? 'var(--teal)' : 'var(--line)'}`,
                      background: statusBonusKeys.includes(k) ? 'var(--teal)' : 'transparent',
                      color: statusBonusKeys.includes(k) ? '#f6f2e9' : 'var(--ink-mute)' }}>
                    {k}
                  </button>
                ))}
              </div>
              {statusBonusKeys.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {statusBonusKeys.map(k => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-soft)' }}>{k}</span>
                      <span style={{ color:'var(--ink-mute)' }}>+</span>
                      <input type="number" value={statusBonusVals[k] ?? '1'}
                        onChange={e => setStatusBonusVals(p => ({ ...p, [k]: e.target.value }))}
                        className={styles.formInput} style={{ width:52 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* xBonus */}
            <div>
              <button type="button" onClick={() => setHasXBonus(p => !p)}
                style={{ display:'flex', alignItems:'center', gap:8, background:'transparent',
                  border:'none', cursor:'pointer', fontFamily:'var(--font-mono)',
                  fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase',
                  color: hasXBonus ? 'var(--ink)' : 'var(--ink-mute)', padding:0, marginBottom: hasXBonus ? 8 : 0 }}>
                <span style={{ width:14, height:14, borderRadius:3, border:'1.5px solid var(--line)',
                  background: hasXBonus ? 'var(--teal)' : 'transparent', flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#f6f2e9', fontSize:10 }}>{hasXBonus ? '✓' : ''}</span>
                Valor variável (X)
              </button>
              {hasXBonus && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)', marginBottom:3 }}>X máximo</div>
                    <input type="number" min={1} max={10} value={xMax} onChange={e => setXMax(e.target.value)} className={styles.formInput} />
                  </div>
                  <div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)', marginBottom:3 }}>Label do X</div>
                    <input value={xLabel} onChange={e => setXLabel(e.target.value)} placeholder="X (Memory gasto)" className={styles.formInput} />
                  </div>
                </div>
              )}
            </div>

            {/* Memória */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                textTransform:'uppercase', color:'var(--ink-mute)', minWidth:80 }}>
                Memória
              </div>
              <input type="number" value={memoryDelta} onChange={e => setMemoryDelta(e.target.value)}
                placeholder="0" className={styles.formInput} style={{ width:64 }}
                title="Ajuste de Memory ao ativar (+N ou −N)" />
              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)' }}>
                {memoryDelta && parseInt(memoryDelta) !== 0
                  ? (parseInt(memoryDelta) > 0 ? `+${memoryDelta} Memory ao ativador` : `${memoryDelta} Memory ao ativador`)
                  : 'sem ajuste de Memory'}
              </span>
            </div>

            {/* Condições no ativador */}
            <ConditionBuilder
              label="Condições no ativador"
              conditions={selfConds}
              onChange={setSelfConds} />

            {/* Condições no alvo */}
            <ConditionBuilder
              label="Condições em alvo (pede seleção no palco)"
              conditions={targetConds}
              onChange={setTargetConds} />

            {/* Preview */}
            {(statusBonusKeys.length > 0 || selfConds.length > 0 || targetConds.length > 0 || memoryDelta) && (
              <div style={{ padding:'10px 12px', background:'rgba(74,155,155,0.08)',
                border:'1px solid rgba(74,155,155,0.3)', borderRadius:8,
                fontFamily:'var(--font-mono)', fontSize:11, color:'var(--teal)' }}>
                <div style={{ marginBottom:4, fontWeight:700 }}>Preview do botão:</div>
                <div>⊕ {palcoLabel || title || 'Nome da skill'}</div>
                {statusBonusKeys.length > 0 && (
                  <div style={{ marginTop:4, color:'var(--ink-soft)' }}>
                    {statusBonusKeys.map(k => `${k} +${statusBonusVals[k]??1}`).join(' · ')}
                    {hasXBonus ? ` × X (0–${xMax})` : ''}
                  </div>
                )}
                {selfConds.length > 0 && (
                  <div style={{ marginTop:2, color:'var(--ink-soft)' }}>
                    Condições: {selfConds.map(c => `${c.label} (${c.filled}/${c.max})`).join(', ')}
                  </div>
                )}
                {targetConds.length > 0 && (
                  <div style={{ marginTop:2, color:'var(--ink-soft)' }}>
                    No alvo: {targetConds.map(c => `${c.label} (${c.filled}/${c.max})`).join(', ')}
                  </div>
                )}
                {memoryDelta && parseInt(memoryDelta) !== 0 && (
                  <div style={{ marginTop:2, color:'var(--ink-soft)' }}>
                    Memory {parseInt(memoryDelta) > 0 ? `+${memoryDelta}` : memoryDelta}
                  </div>
                )}
                {durationRounds && parseInt(durationRounds) > 0 && (
                  <div style={{ marginTop:2, color:'var(--ink-soft)' }}>
                    Duração: {durationRounds} rounds
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button className={styles.btnSolid} onClick={handleAdd}>Adicionar</button>
        <button className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Add Evolution Form ─────────────────────────────────────────────
function AddEvolutionForm({ onAdd, onCancel }: { onAdd: (s: DigimonStage) => void; onCancel: () => void }) {
  const [stageName, setStageName] = useState('')
  const [level, setLevel]     = useState('Adult (Lvl 4)')
  const [type, setType]       = useState('')
  const [cost, setCost]       = useState('−2 Memory')
  const [portrait, setPortrait] = useState<DigimonStage['portrait']>('indigo')
  const [status, setStatus] = useState<DigimonStageStatus>({ HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 })
  const [attrs, setAttrs] = useState(makeDefaultAttributes())
  const handleAdd = () => {
    if (!stageName.trim()) return
    onAdd({ stageName, level, type, cost, portrait, size: 3, speed: 5, status, attributes: attrs, weakness: {}, affinity: {}, skills: [], locked: false })
  }
  return (
    <div className={styles.addSkillForm}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 }}>Registrar Nova Evolução</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {[['Nome *', stageName, setStageName, 'ex: Witchmon'], ['Nível', level, setLevel, 'ex: Adult (Lvl 4)'], ['Tipo', type, setType, 'ex: Demon Man'], ['Custo', cost, setCost, 'ex: −2 Memory']] .map(([lbl, val, setter, ph]: any) => (
          <div key={lbl}><label className={styles.formLabel}>{lbl}</label><input value={val} onChange={(e:any)=>setter(e.target.value)} className={styles.formInput} placeholder={ph}/></div>
        ))}
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className={styles.formLabel}>Cor do retrato</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {PORTRAIT_LIST.map(p => (
            <div key={p} onClick={() => setPortrait(p)} style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', position: 'relative', outline: portrait === p ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }}>
              <GrainFill color={p}/>
            </div>
          ))}
        </div>
      </div>
      <label className={styles.formLabel} style={{ display: 'block', marginBottom: 6 }}>Status</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
        {(['HP','Deslocamento','Iniciativa','Defesa','Armadura'] as (keyof DigimonStageStatus)[]).map(k => (
          <div key={k}><label className={styles.formLabel} style={{ fontSize: 9 }}>{k}</label>
            <input type="number" min={0} value={status[k]} onChange={e => setStatus(p => ({ ...p, [k]: parseInt(e.target.value)||0 }))} className={styles.formInput} /></div>
        ))}
      </div>
      <label className={styles.formLabel} style={{ display: 'block', marginBottom: 6 }}>Atributos</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 14 }}>
        {ATTRIBUTE_KEYS.map(k => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--paper)', border:'1px solid var(--line-soft)', borderRadius:6, padding:'4px 8px' }}>
            <span style={{ fontSize:11, color:'var(--ink-soft)' }}>{k.slice(0,4)}</span>
            <input type="number" min={1} max={10} value={attrs[k]} onChange={e => setAttrs(p => ({ ...p, [k]: parseInt(e.target.value)||1 }))} style={{ width:38, border:'none', fontFamily:'var(--font-mono)', fontSize:13, textAlign:'right', background:'transparent' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className={styles.btnSolid} onClick={handleAdd}>Registrar</button>
        <button className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Image upload zone ──────────────────────────────────────────────
function ImageUploadZone({ image, onUpload, size = 80 }: { image: string | null; onUpload: (d: string) => void; size?: number }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div style={{ width:size, height:size, borderRadius:14, overflow:'hidden', cursor:'pointer', position:'relative', flexShrink:0 }}
      onClick={() => ref.current?.click()} title="Trocar imagem">
      <GrainFill color="sage" image={image} />
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', opacity:0, transition:'opacity 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>
        <span style={{ background:'rgba(255,255,255,0.85)', borderRadius:6, padding:'3px 8px', fontSize:11, fontFamily:'var(--font-mono)', color:'var(--ink)' }}>trocar</span>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
        const f = e.target.files?.[0]; if (!f) return
        const r = new FileReader(); r.onload = ev => onUpload(ev.target?.result as string); r.readAsDataURL(f)
      }} />
    </div>
  )
}

// ── Section title ──────────────────────────────────────────────────
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={styles.sectionTitle}>
      <span>◼</span><span>{children}</span>
      {action && <span style={{ marginLeft:'auto' }}>{action}</span>}
      <span style={{ flex: action ? 0 : 1, height:1, background:'var(--line)', alignSelf:'center', marginLeft:8 }} />
    </div>
  )
}

// ── XP Confirmation Bar ────────────────────────────────────────────
function XpConfirmBar({ cost, xpAvail, onConfirm, onCancel }: {
  cost: number; xpAvail: number; onConfirm: () => void; onCancel: () => void
}) {
  const ok = cost <= xpAvail
  return (
    <div className={styles.xpConfirmBar}>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>
        {ok
          ? <>Custo: <b style={{ color:'var(--coral)' }}>{cost} XP</b> · Restará: <b>{xpAvail - cost} XP</b></>
          : <span style={{ color:'var(--coral)' }}>XP insuficiente ({cost} necessário, {xpAvail} disponível)</span>
        }
      </span>
      <div style={{ display:'flex', gap:8 }}>
        <button className={styles.btnSolid} style={{ fontSize:12 }} disabled={!ok} onClick={onConfirm}>✓ Confirmar</button>
        <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={onCancel}>Cancelar tudo</button>
      </div>
    </div>
  )
}

// ── Inline XP Award (inside sheet) ────────────────────────────────
function InlineXpAward({ tamerXp, tamerName, onAward }: {
  tamerXp: number; tamerName: string
  onAward: (tXp: number) => void
}) {
  const [amt, setAmt] = useState('')
  const [open, setOpen] = useState(false)
  if (!open) return (
    <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setOpen(true)}>+ Adicionar XP</button>
  )
  return (
    <div className={styles.xpAwardInline}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:10 }}>Adicionar XP</div>
      <div style={{ marginBottom:12 }}>
        <label className={styles.formLabel}>{tamerName} (atual: {tamerXp})</label>
        <input type="number" min={0} value={amt} onChange={e => setAmt(e.target.value)}
          placeholder="0" className={styles.formInput} />
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button className={styles.btnSolid} style={{ fontSize:12 }} onClick={() => {
          onAward(parseInt(amt)||0); setAmt(''); setOpen(false)
        }}>Confirmar</button>
        <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Tamer info editor ──────────────────────────────────────────────
function TamerInfoEditor({ tamer, onSave }: { tamer: Tamer; onSave: (t: Tamer) => void }) {
  const [d, setD] = useState(tamer)
  const f = (k: keyof Tamer) => (v: string) => setD(t => ({ ...t, [k]: v }))
  const fN = (k: keyof Tamer) => (v: number) => setD(t => ({ ...t, [k]: v }))
  const changed = JSON.stringify(d) !== JSON.stringify(tamer)
  return (
    <div className={styles.infoEditor}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div><label className={styles.formLabel}>Nome</label>{inp(d.name, f('name'))}</div>
        <div><label className={styles.formLabel}>Sobrenome</label>{inp(d.surname, f('surname'))}</div>
        <div><label className={styles.formLabel}>Tagline</label>{inp(d.tagline, f('tagline'))}</div>
        <div><label className={styles.formLabel}>Voz</label>{inp(d.voice, f('voice'))}</div>
        <div><label className={styles.formLabel}>Aniversário</label>{inp(d.birthday, f('birthday'))}</div>
        <div><label className={styles.formLabel}>Signo</label>{inp(d.sign, f('sign'))}</div>
        <div><label className={styles.formLabel}>Idade</label>
          <input type="number" min={0} value={d.age} onChange={e => setD(t => ({ ...t, age: parseInt(e.target.value)||0 }))} className={styles.formInput} />
        </div>
        <div><label className={styles.formLabel}>Altura (cm)</label>
          <input type="number" min={0} value={d.height} onChange={e => setD(t => ({ ...t, height: parseInt(e.target.value)||0 }))} className={styles.formInput} />
        </div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label className={styles.formLabel}>Cor do retrato</label>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
          {PORTRAIT_LIST.map(p => (
            <div key={p} onClick={() => setD(t => ({ ...t, portrait: p }))}
              style={{ width:26, height:26, borderRadius:6, overflow:'hidden', cursor:'pointer', position:'relative',
                outline: d.portrait === p ? '2px solid var(--ink)' : 'none', outlineOffset:2 }}>
              <GrainFill color={p}/>
            </div>
          ))}
        </div>
      </div>
      {changed && (
        <div style={{ display:'flex', gap:8 }}>
          <button className={styles.btnSolid} style={{ fontSize:12 }} onClick={() => onSave(d)}>Salvar info</button>
          <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={() => setD(tamer)}>Descartar</button>
        </div>
      )}
    </div>
  )
}

// ── Digimon info editor ────────────────────────────────────────────
function DigiInfoEditor({ line, stageIdx, onSaveLine }: {
  line: DigimonLine; stageIdx: number; onSaveLine: (l: DigimonLine) => void
}) {
  const stage = line.stages[stageIdx]
  const [d, setD] = useState(stage)
  const changed = JSON.stringify(d) !== JSON.stringify(stage)
  const save = () => onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? d : s) })
  const s = (k: keyof DigimonStage) => (v: string) => setD(st => ({ ...st, [k]: v }))
  return (
    <div className={styles.infoEditor}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
        <div><label className={styles.formLabel}>Nome</label><input value={d.stageName} onChange={e => setD(st=>({...st,stageName:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Nível</label><input value={d.level} onChange={e => setD(st=>({...st,level:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Tipo</label><input value={d.type} onChange={e => setD(st=>({...st,type:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Custo</label><input value={d.cost} onChange={e => setD(st=>({...st,cost:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Size</label><input type="number" min={1} max={10} value={d.size} onChange={e=>setD(st=>({...st,size:parseInt(e.target.value)||1}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Speed</label><input type="number" min={1} max={20} value={d.speed} onChange={e=>setD(st=>({...st,speed:parseInt(e.target.value)||1}))} className={styles.formInput}/></div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label className={styles.formLabel}>Cor do retrato</label>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
          {PORTRAIT_LIST.map(p => (
            <div key={p} onClick={() => setD(st=>({...st,portrait:p}))}
              style={{ width:26, height:26, borderRadius:6, overflow:'hidden', cursor:'pointer', position:'relative',
                outline: d.portrait === p ? '2px solid var(--ink)' : 'none', outlineOffset:2 }}>
              <GrainFill color={p}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label className={styles.formLabel}>Atributos diretos</label>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5, marginTop:4 }}>
          {ATTRIBUTE_KEYS.map(k => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--paper)', border:'1px solid var(--line-soft)', borderRadius:6, padding:'4px 8px' }}>
              <span style={{ fontSize:11, color:'var(--ink-soft)' }}>{k.slice(0,4)}</span>
              <input type="number" min={1} max={10} value={d.attributes[k]}
                onChange={e => setD(st => ({ ...st, attributes: { ...st.attributes, [k]: parseInt(e.target.value)||1 } }))}
                style={{ width:38, border:'none', fontFamily:'var(--font-mono)', fontSize:13, textAlign:'right', background:'transparent' }} />
            </div>
          ))}
        </div>
      </div>
      {changed && (
        <div style={{ display:'flex', gap:8 }}>
          <button className={styles.btnSolid} style={{ fontSize:12 }} onClick={save}>Salvar</button>
          <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={() => setD(stage)}>Descartar</button>
        </div>
      )}
    </div>
  )
}

// ── Bug info editor ────────────────────────────────────────────────
function BugInfoEditor({ bug, onSave }: { bug: Bug; onSave: (b: Bug) => void }) {
  const [d, setD] = useState(bug)
  const changed = JSON.stringify(d) !== JSON.stringify(bug)
  return (
    <div className={styles.infoEditor}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div><label className={styles.formLabel}>Nome</label><input value={d.name} onChange={e=>setD(b=>({...b,name:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Classe</label><input value={d.class} onChange={e=>setD(b=>({...b,class:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Cor</label>
          <select value={d.color} onChange={e=>setD(b=>({...b,color:e.target.value as Bug['color']}))} className={styles.formInput}>
            {BUG_COLORS.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className={styles.formLabel}>Lore</label><input value={d.lore} onChange={e=>setD(b=>({...b,lore:e.target.value}))} className={styles.formInput}/></div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label className={styles.formLabel}>Atributos</label>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5, marginTop:4 }}>
          {ATTRIBUTE_KEYS.map(k => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--paper)', border:'1px solid var(--line-soft)', borderRadius:6, padding:'4px 8px' }}>
              <span style={{ fontSize:11, color:'var(--ink-soft)' }}>{k.slice(0,4)}</span>
              <input type="number" min={1} max={10} value={d.attributes[k]}
                onChange={e => setD(b => ({ ...b, attributes: { ...b.attributes, [k]: parseInt(e.target.value)||1 } }))}
                style={{ width:38, border:'none', fontFamily:'var(--font-mono)', fontSize:13, textAlign:'right', background:'transparent' }} />
            </div>
          ))}
        </div>
      </div>
      {changed && (
        <div style={{ display:'flex', gap:8 }}>
          <button className={styles.btnSolid} style={{ fontSize:12 }} onClick={() => onSave(d)}>Salvar</button>
          <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={() => setD(bug)}>Descartar</button>
        </div>
      )}
    </div>
  )
}

// ── TamerSkillsWithDomainTabs ─────────────────────────────────────
// Agrupa tamerSkills em abas por Domain quando o tamer tem múltiplos Domains.
// Skills sem Domain (keyword genérico ou "Domain") ficam na aba "Geral".
function TamerSkillsWithDomainTabs({ tamer, editable, passiveToggles, setPassiveToggles, onSave, msg, onSpawnToken }: {
  tamer: Tamer; editable: boolean
  passiveToggles: Record<number, { active: boolean; x: number }>
  setPassiveToggles: React.Dispatch<React.SetStateAction<Record<number, { active: boolean; x: number }>>>
  onSave: (t: Tamer) => void
  msg: (m: string) => void
  onSpawnToken?: (token: TokenSpawn) => void
}) {
  // Identificar grupos de Domain únicos (keywords que contêm "Domain of")
  const domainGroups = Array.from(new Set(
    tamer.tamerSkills
      .map(s => s.keyword)
      .filter(k => k.includes('Domain of'))
  ))

  // Se só tem 1 grupo (ou nenhum), renderiza tudo flat (comportamento original)
  const hasMultipleDomains = domainGroups.length >= 2

  const [activeTab, setActiveTab] = useState<string>('geral')

  const renderSkills = (skills: { s: TamerSkill; origIdx: number }[]) =>
    [...skills]
      .sort((a, b) => (a.s.type === 'passive' ? 1 : 0) - (b.s.type === 'passive' ? 1 : 0))
      .map(({ s, origIdx }) => (
        <SkillCard key={origIdx} s={s} editable={editable}
          onChange={sk => onSave({ ...tamer, tamerSkills: tamer.tamerSkills.map((x, j) => j === origIdx ? sk as TamerSkill : x) })}
          onDelete={() => { onSave({ ...tamer, tamerSkills: tamer.tamerSkills.filter((_, j) => j !== origIdx) }); msg('Skill removida.') }}
          onToggle={s.toggleBonus ? (active, x) =>
            setPassiveToggles(p => ({ ...p, [origIdx]: { active, x: x ?? 0 } }))
          : undefined}
          toggleActive={passiveToggles[origIdx]?.active ?? false}
          toggleX={passiveToggles[origIdx]?.x ?? 0}
          onSpawnToken={onSpawnToken}
        />
      ))

  const indexed = tamer.tamerSkills.map((s, origIdx) => ({ s, origIdx }))

  if (!hasMultipleDomains) {
    return <>{renderSkills(indexed)}</>
  }

  // Montar grupos
  const groups: Record<string, { s: TamerSkill; origIdx: number }[]> = { 'Geral': [] }
  for (const g of domainGroups) groups[g] = []

  for (const item of indexed) {
    const k = item.s.keyword
    if (k.includes('Domain of') && groups[k]) {
      groups[k].push(item)
    } else {
      groups['Geral'].push(item)
    }
  }

  // Remover grupos vazios
  const tabKeys = Object.keys(groups).filter(k => groups[k].length > 0)
  const currentTab = tabKeys.includes(activeTab) ? activeTab : tabKeys[0]

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
        {tabKeys.map(k => (
          <button key={k}
            onClick={() => setActiveTab(k)}
            className={currentTab === k ? styles.pendBtn : styles.pendBtnUndo}
            style={{ width: 'auto', borderRadius: 999, padding: '4px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            {k}
          </button>
        ))}
      </div>
      {renderSkills(groups[currentTab] ?? [])}
    </div>
  )
}

// ── TamerView ──────────────────────────────────────────────────────
// ── SkillTreeSection ───────────────────────────────────────────────
// Mostra as fases de Skill Tree do tamer. GM pode adicionar e desbloquear fases;
// player pode comprar skills disponíveis (3 XP cada).
function SkillTreeSection({ tamer, state, onSave, onSaveState, msg }: {
  tamer: Tamer
  state?: AppState
  onSave: (t: Tamer) => void
  onSaveState?: (s: AppState) => void
  msg: (m: string) => void
}) {
  const [showAddPhase, setShowAddPhase]   = useState(false)
  const [newPhaseLabel, setNewPhaseLabel] = useState('')
  const [addingSkillTo, setAddingSkillTo] = useState<string | null>(null)  // phaseId

  if (!state) return null

  const phases = (state.skillTree ?? []).filter(p => p.tamerId === tamer.id)
  if (phases.length === 0 && !showAddPhase) return null

  const buySkill = (phaseId: string, skillIndex: number) => {
    const newState = buySkillTreeSkill(state, phaseId, skillIndex)
    if ('error' in newState) { msg((newState as { error: string }).error); return }
    onSaveState?.(newState as AppState)
    msg('Skill adquirida! (−3 XP)')
  }

  const addSkillToPhase = (phaseId: string, skill: TamerSkill) => {
    onSaveState?.({
      ...state,
      skillTree: state.skillTree.map(p =>
        p.id === phaseId
          ? { ...p, skillsAvailable: [...p.skillsAvailable, skill] }
          : p
      ),
    })
    setAddingSkillTo(null)
    msg('Skill adicionada à fase!')
  }

  const removeSkillFromPhase = (phaseId: string, skillIndex: number) => {
    onSaveState?.({
      ...state,
      skillTree: state.skillTree.map(p =>
        p.id === phaseId
          ? { ...p, skillsAvailable: p.skillsAvailable.filter((_, i) => i !== skillIndex) }
          : p
      ),
    })
  }

  const addPhase = () => {
    if (!newPhaseLabel.trim()) return
    const newPhaseNum = phases.length + 1
    const phase = {
      id: `stp-${tamer.id}-${newPhaseNum}-${Date.now().toString(36)}`,
      tamerId: tamer.id,
      phaseNum: newPhaseNum,
      label: newPhaseLabel.trim(),
      unlocked: false,
      skillsAvailable: [] as TamerSkill[],
      skillsAcquired: [] as TamerSkill[],
    }
    onSaveState?.({ ...state, skillTree: [...(state.skillTree ?? []), phase] })
    setNewPhaseLabel('')
    setShowAddPhase(false)
    msg('Fase adicionada!')
  }

  const toggleUnlock = (phaseId: string) => {
    onSaveState?.({
      ...state,
      skillTree: state.skillTree.map(p =>
        p.id === phaseId ? { ...p, unlocked: !p.unlocked } : p
      )
    })
  }

  const deletePhase = (phaseId: string) => {
    if (!confirm('Remover esta fase da Skill Tree?')) return
    onSaveState?.({ ...state, skillTree: state.skillTree.filter(p => p.id !== phaseId) })
  }

  return (
    <div style={{ marginTop: 24 }}>
      <SectionTitle>Skill Tree</SectionTitle>
      {phases.map(phase => (
        <div key={phase.id} style={{ border: '1px solid var(--line)', borderRadius: 10,
          marginBottom: 12, overflow: 'hidden', background: 'var(--paper)' }}>
          {/* Header da fase */}
          <div style={{ padding: '10px 16px', background: phase.unlocked ? 'var(--paper-deep)' : 'var(--paper)',
            borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase' }}>
                {phase.label}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginLeft: 10 }}>
                {phase.skillsAvailable.length} disponível{phase.skillsAvailable.length !== 1 ? 'is' : ''} ·{' '}
                {phase.skillsAcquired.length} adquirida{phase.skillsAcquired.length !== 1 ? 's' : ''}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999,
              background: phase.unlocked ? 'var(--teal)' : 'var(--line)',
              color: phase.unlocked ? '#f6f2e9' : 'var(--ink-mute)' }}>
              {phase.unlocked ? 'Desbloqueada' : 'Bloqueada'}
            </span>
            {/* Controles GM */}
            <button onClick={() => setAddingSkillTo(addingSkillTo === phase.id ? null : phase.id)}
              style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase',
                background: addingSkillTo === phase.id ? 'var(--ink)' : 'transparent',
                color: addingSkillTo === phase.id ? 'var(--paper)' : 'var(--ink-mute)',
                border:'1px solid var(--line)', borderRadius:999,
                padding:'2px 8px', cursor:'pointer' }}>
              + Skill
            </button>
            <button onClick={() => toggleUnlock(phase.id)}
              style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase',
                background:'transparent', border:'1px solid var(--line)', borderRadius:999,
                padding:'2px 8px', cursor:'pointer', color:'var(--ink-mute)' }}>
              {phase.unlocked ? 'Bloquear' : 'Desbloquear'}
            </button>
            <button onClick={() => deletePhase(phase.id)}
              style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase',
                background:'transparent', border:'1px solid var(--line)', borderRadius:999,
                padding:'2px 8px', cursor:'pointer', color:'var(--coral)' }}>
              ×
            </button>
          </div>

          {/* Formulário de adicionar skill à fase */}
          {addingSkillTo === phase.id && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)',
              background: 'var(--paper-deep)' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:8 }}>
                Adicionar skill à fase
              </div>
              <AddSkillForm isTamer
                onAdd={sk => addSkillToPhase(phase.id, sk as TamerSkill)}
                onCancel={() => setAddingSkillTo(null)} />
            </div>
          )}

          {/* Skills disponíveis */}
          {phase.skillsAvailable.length > 0 && (
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.12em',
                textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:10 }}>
                Skills disponíveis — 3 XP cada
              </div>
              {phase.skillsAvailable.map((sk, i) => (
                <div key={i} style={{ border:'1px solid var(--line-soft)', borderRadius:8,
                  padding:'10px 14px', marginBottom:8, background: phase.unlocked ? 'var(--paper-deep)' : 'var(--paper)',
                  display:'flex', alignItems:'flex-start', gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                      textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:3 }}>
                      {sk.keyword} · {sk.type}
                    </div>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:14, textTransform:'uppercase', marginBottom:4 }}>
                      {sk.title}
                    </div>
                    <div style={{ fontSize:13, color:'var(--ink-soft)', lineHeight:1.55 }}>{sk.effect}</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                    {phase.unlocked && (
                      <button
                        onClick={() => buySkill(phase.id, i)}
                        disabled={tamer.xp < 3}
                        style={{ padding:'6px 12px', borderRadius:999,
                          border:`1px solid ${tamer.xp >= 3 ? 'var(--teal)' : 'var(--line)'}`,
                          background: tamer.xp >= 3 ? 'var(--teal)' : 'transparent',
                          color: tamer.xp >= 3 ? '#f6f2e9' : 'var(--ink-mute)',
                          fontFamily:'var(--font-body)', fontWeight:600, fontSize:12,
                          cursor: tamer.xp >= 3 ? 'pointer' : 'not-allowed',
                          whiteSpace:'nowrap' }}>
                        Adquirir (3 XP)
                      </button>
                    )}
                    <button onClick={() => removeSkillFromPhase(phase.id, i)}
                      style={{ padding:'4px 10px', borderRadius:999,
                        border:'1px solid var(--line)', background:'transparent',
                        fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em',
                        textTransform:'uppercase', cursor:'pointer', color:'var(--coral)',
                        whiteSpace:'nowrap' }}>
                      remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fase sem skills ainda */}
          {phase.skillsAvailable.length === 0 && phase.skillsAcquired.length === 0 && (
            <div style={{ padding:'16px', fontFamily:'var(--font-serif)', fontStyle:'italic',
              fontSize:14, color:'var(--ink-mute)' }}>
              ~ Nenhuma skill adicionada a esta fase ainda. Use "+ Skill" para adicionar. ~
            </div>
          )}

          {/* Fase bloqueada com skills — aviso para o player */}
          {!phase.unlocked && phase.skillsAvailable.length > 0 && (
            <div style={{ padding:'12px 16px', fontFamily:'var(--font-serif)', fontStyle:'italic',
              fontSize:14, color:'var(--ink-mute)', borderTop:'1px solid var(--line-soft)' }}>
              ~ Esta fase ainda não foi desbloqueada pelo GM. ~
            </div>
          )}

          {/* Adquiridas (histórico) */}
          {phase.skillsAcquired.length > 0 && (
            <div style={{ padding:'8px 16px 12px', borderTop:'1px solid var(--line-soft)' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.12em',
                textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:6 }}>
                Adquiridas
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {phase.skillsAcquired.map((sk, i) => (
                  <span key={i} style={{ fontFamily:'var(--font-mono)', fontSize:10,
                    padding:'2px 8px', borderRadius:999,
                    background:'rgba(74,155,155,0.12)', color:'var(--teal)',
                    border:'1px solid rgba(74,155,155,0.3)' }}>
                    {sk.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Botão adicionar fase (GM) */}
      {!showAddPhase && (
        <button className={styles.btnGhost} style={{ fontSize:11, marginTop:4 }}
          onClick={() => setShowAddPhase(true)}>
          + Nova fase de Skill Tree
        </button>
      )}
      {showAddPhase && (
        <div style={{ background:'var(--paper-deep)', border:'1px solid var(--line)',
          borderRadius:10, padding:'14px 16px', marginTop:8 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
            textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:8 }}>
            Nova fase
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input value={newPhaseLabel}
              onChange={e => setNewPhaseLabel(e.target.value)}
              placeholder="ex: Fase 2 — Laços de Sangue"
              className={styles.formInput} style={{ flex:1 }}
              onKeyDown={e => e.key === 'Enter' && addPhase()} />
            <button className={styles.btnSolid} style={{ fontSize:12 }} onClick={addPhase}>Criar</button>
            <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={() => { setShowAddPhase(false); setNewPhaseLabel('') }}>×</button>
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)', marginTop:8 }}>
            Após criar a fase, adicione skills a ela editando a ficha do personagem.
          </div>
        </div>
      )}
    </div>
  )
}

const NPC_FECHADURA_IDS = new Set(['t-hare', 't-kanade', 't-shinra', 't-kumo', 't-hibito', 't-emi'])

function TamerView({ tamer, line, editable, onSave, onSaveLine, onSaveAll, state, onSaveState, onSpawnToken }: {
  tamer: Tamer; line?: DigimonLine; editable: boolean
  onSave: (t: Tamer) => void; onSaveLine?: (l: DigimonLine) => void
  onSaveAll?: (autoridade: number) => void
  state?: AppState; onSaveState?: (s: AppState) => void
  onSpawnToken?: (token: TokenSpawn) => void
}) {
  const [toast, setToast]    = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editInfo, setEditInfo] = useState(false)
  const [freeMode, setFreeMode] = useState(false)
  // Toggles de passivas do tamer
  const [passiveToggles, setPassiveToggles] = useState<Record<number, { active: boolean; x: number }>>({})
  // XP pending
  const [pendAttr, setPendAttr]   = useState<Record<string, number>>({})
  const [pendSkill, setPendSkill] = useState<Record<string, number>>({})
  const pendCost = useMemo(() => {
    const a = pendingCost(pendAttr, tamer.attributes, true)
    const s = pendingCost(pendSkill, tamer.skills.Mental, false) +
              pendingCost(pendSkill, tamer.skills.Físico, false) +
              pendingCost(pendSkill, tamer.skills.Social, false)
    return a + s
  }, [pendAttr, pendSkill, tamer])
  const hasPending = pendCost > 0

  const msg = useCallback((m: string) => setToast(m), [])

  const pendAttrUp   = (k: AttributeKey) => {
    const cur = tamer.attributes[k] + (pendAttr[k] ?? 0)
    if (cur >= 10) return
    setPendAttr(p => ({ ...p, [k]: (p[k] ?? 0) + 1 }))
  }
  const pendAttrDown = (k: AttributeKey) => {
    if ((pendAttr[k] ?? 0) <= 0) return
    setPendAttr(p => ({ ...p, [k]: p[k] - 1 }))
  }
  const pendSkillUp = (cat: keyof SkillSet, name: string) => {
    const cur = tamer.skills[cat][name] + (pendSkill[name] ?? 0)
    if (cur >= 5) return
    setPendSkill(p => ({ ...p, [name]: (p[name] ?? 0) + 1 }))
  }
  const pendSkillDown = (cat: keyof SkillSet, name: string) => {
    if ((pendSkill[name] ?? 0) <= 0) return
    setPendSkill(p => ({ ...p, [name]: p[name] - 1 }))
  }
  const confirmXp = () => {
    if (pendCost > tamer.xp) { msg('XP insuficiente!'); return }
    let t = { ...tamer, xp: tamer.xp - pendCost, xpSpent: tamer.xpSpent + pendCost }
    // apply attr
    for (const [k, delta] of Object.entries(pendAttr)) {
      if (delta > 0) t = { ...t, attributes: { ...t.attributes, [k as AttributeKey]: t.attributes[k as AttributeKey] + delta } }
    }
    // apply skills
    for (const cat of ['Mental','Físico','Social'] as (keyof SkillSet)[]) {
      for (const [name, delta] of Object.entries(pendSkill)) {
        if (delta > 0 && name in t.skills[cat]) {
          t = { ...t, skills: { ...t.skills, [cat]: { ...t.skills[cat], [name]: t.skills[cat][name] + delta } } }
        }
      }
    }
    onSave(t)
    setPendAttr({}); setPendSkill({})
    msg(`−${pendCost} XP confirmado!`)
  }
  const cancelXp = () => { setPendAttr({}); setPendSkill({}); msg('Compras canceladas.') }

  const derived = useMemo(() => calcTamerDerived(tamer.attributes), [tamer.attributes])

  // Bônus acumulados de passivas de tamer ativas (toggle)
  const tamerActiveBonus = tamer.tamerSkills.reduce((acc, sk, idx) => {
    if (!sk.toggleBonus?.statusBonus) return acc
    const t = passiveToggles[idx]
    if (!t?.active) return acc
    const multiplier = sk.toggleBonus.xBonus ? t.x : 1
    for (const [k, v] of Object.entries(sk.toggleBonus.statusBonus)) {
      acc[k] = (acc[k] ?? 0) + (v ?? 0) * multiplier
    }
    return acc
  }, {} as Record<string, number>)

  // alwaysOn: afinidades permanentes do tamer (ex: A Glimmer in the Ocean → Cura)
  const tamerAlwaysOnAffinity = tamer.tamerSkills.reduce((acc, sk) => {
    if (!sk.alwaysOn?.affinityBonus) return acc
    for (const [k, v] of Object.entries(sk.alwaysOn.affinityBonus)) acc[k] = (acc[k] ?? 0) + (v ?? 0)
    return acc
  }, {} as Record<string, number>)
  const hasTamerAffinity = Object.values(tamerAlwaysOnAffinity).some(v => v > 0)

  const maxHP       = derived.HP       + (tamer.status.hpMaxBonus       ?? 0) + (tamerActiveBonus['HP'] ?? 0)
  const maxDigisoul = derived.Digisoul + (tamer.status.digisoulMaxBonus  ?? 0)

  const statusEntries: StatEntry[] = [
    ['HP',
      `${tamer.status.HP.v}/${maxHP}`,
      (v: number) => onSave({ ...tamer, status: { ...tamer.status, HP: { ...tamer.status.HP, v: Math.max(0, Math.min(v, maxHP)) } } })
    ],
    ['Memory', `${tamer.status.Memory.v}/${tamer.status.Memory.max}`,
      (v: number) => onSave({ ...tamer, status: { ...tamer.status, Memory: { ...tamer.status.Memory, v: Math.max(0, Math.min(v, tamer.status.Memory.max)) } } })
    ],
    ['Digisoul',
      `${tamer.status.Digisoul.v}/${maxDigisoul}`,
      (v: number) => onSave({ ...tamer, status: { ...tamer.status, Digisoul: { ...tamer.status.Digisoul, v: Math.max(0, Math.min(v, maxDigisoul)) } } })
    ],
    ['Deslocamento', derived.Deslocamento + (tamerActiveBonus['Deslocamento'] ?? 0)],
    ['Iniciativa', derived.Iniciativa + (tamerActiveBonus['Iniciativa'] ?? 0)],
    ...(!NPC_FECHADURA_IDS.has(tamer.id) ? [['Autoridade',
      tamer.status.Autoridade,
      (v: number) => { onSaveAll?.(Math.max(0, v)) }
    ] as [string, number, (v: number) => void]] : []),
    ['XP livre', tamer.xp],
  ]

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {/* Adicionar XP individual ao tamer */}
      {editable && (
        <InlineXpAward
          tamerXp={tamer.xp}
          tamerName={tamer.name}
          onAward={(tXp) => {
            onSave({ ...tamer, xp: tamer.xp + tXp })
            msg(`+${tXp} XP adicionado a ${tamer.name}`)
          }}
        />
      )}

      <StatRow entries={statusEntries} />

      {editable && freeMode && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:12, padding:'8px 0 4px',
          fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)' }}>
          {([
            ['HP máx',      maxHP,      (d: number) => onSave({ ...tamer, status: { ...tamer.status, hpMaxBonus:      (tamer.status.hpMaxBonus       ?? 0) + d } })],
            ['DS máx',      maxDigisoul,(d: number) => onSave({ ...tamer, status: { ...tamer.status, digisoulMaxBonus: (tamer.status.digisoulMaxBonus  ?? 0) + d } })],
            ['Mem máx',     tamer.status.Memory.max,   (d: number) => onSave({ ...tamer, status: { ...tamer.status, Memory: { ...tamer.status.Memory, max: tamer.status.Memory.max + d } } })],
          ] as [string, number, (d: number) => void][]).map(([label, val, adj]) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span>{label}:</span>
              <button className={styles.attrFreeBtn} onClick={() => adj(-1)}>−</button>
              <span style={{ minWidth:24, textAlign:'center', color:'var(--ink)' }}>{val}</span>
              <button className={styles.attrFreeBtn} onClick={() => adj(+1)}>+</button>
            </div>
          ))}
        </div>
      )}

      {editable && editInfo && (
        <>
          <SectionTitle>Informações</SectionTitle>
          <TamerInfoEditor tamer={tamer} onSave={t => { onSave(t); msg('Info salva!') }} />
        </>
      )}
      {editable && (
        <div style={{ marginBottom:12 }}>
          <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setEditInfo(p => !p)}>
            {editInfo ? '✕ Fechar info' : '✎ Editar info'}
          </button>
        </div>
      )}

      <SectionTitle>Atributos</SectionTitle>
      <AttributeGrid attrs={tamer.attributes} editable={editable} pending={pendAttr} onPend={pendAttrUp} onUnpend={pendAttrDown}
        freeMode={freeMode} onFreeModeChange={setFreeMode}
        onFreeEdit={(k, delta) => { onSave({ ...tamer, attributes: { ...tamer.attributes, [k]: Math.max(1, Math.min(10, tamer.attributes[k] + delta)) } }) }} />

      <SectionTitle>Skills</SectionTitle>
      <SkillGrid skills={tamer.skills} editable={editable} freeMode={freeMode}
        pending={pendSkill} onPend={pendSkillUp} onUnpend={pendSkillDown}
        onFreeEdit={(cat, name, delta) => {
          const cur = tamer.skills[cat][name] ?? 0
          const nv  = Math.max(0, Math.min(5, cur + delta))
          onSave({ ...tamer, skills: { ...tamer.skills, [cat]: { ...tamer.skills[cat], [name]: nv } } })
        }} />

      {hasPending && (
        <XpConfirmBar cost={pendCost} xpAvail={tamer.xp} onConfirm={confirmXp} onCancel={cancelXp} />
      )}

      {hasTamerAffinity && (
        <>
          <SectionTitle>Afinidades</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', padding: '4px 0 12px' }}>
            {Object.entries(tamerAlwaysOnAffinity).filter(([, v]) => v > 0).map(([k, v]) => (
              <div key={k} className={styles.affinityRow} style={{ width: 'auto', minWidth: 90 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <span className={styles.affinityIcon}>
                    {AFFINITY_ICONS[k]
                      ? <img src={AFFINITY_ICONS[k]} alt={k} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 1 }} />
                      : <span style={{ fontSize: 12 }}>{k}</span>
                    }
                    <span className={styles.affinityTooltip}>{k}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)' }}>{k}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, marginLeft: 8 }}>{v}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle action={editable && !showAdd && (
        <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setShowAdd(true)}>+ Nova Skill</button>
      )}>Tamer Skills</SectionTitle>
      <TamerSkillsWithDomainTabs
        tamer={tamer} editable={editable}
        passiveToggles={passiveToggles} setPassiveToggles={setPassiveToggles}
        onSave={onSave} msg={msg} onSpawnToken={onSpawnToken}
      />
      {showAdd && <AddSkillForm isTamer onAdd={sk => { onSave({ ...tamer, tamerSkills: [...tamer.tamerSkills, sk as TamerSkill] }); setShowAdd(false); msg('Skill adicionada!') }} onCancel={() => setShowAdd(false)} />}

      {editable && !line && state && onSaveState && (
        <>
          <SectionTitle>Digimon Parceiro</SectionTitle>
          <div style={{ textAlign:'center', padding:'20px 24px', background:'var(--paper-deep)',
            border:'1px solid var(--line-soft)', borderRadius:8, marginBottom:16 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.1em',
              textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:12 }}>
              Sem parceiro vinculado
            </div>
            <button className={styles.btnGhost} onClick={() => {
              const newId = `d-${tamer.id}-partner`
              const newLine = makeSlimLine(newId, tamer.id, 'Novo Digimon', tamer.portrait, '???')
              const hiddenLine = { ...newLine, stages: newLine.stages.map(s => ({ ...s, hidden: true })) }
              onSaveState({
                ...state,
                bestiary: [...state.bestiary, hiddenLine],
                tamers: state.tamers.map(t => t.id === tamer.id ? { ...t, digimonId: newId } : t)
              })
            }}>+ Vincular Digimon Parceiro</button>
          </div>
        </>
      )}

      {/* Skill Tree — fases liberadas pelo GM */}
      <SkillTreeSection tamer={tamer} state={state} onSave={onSave} onSaveState={onSaveState} msg={msg} />
    </div>
  )
}

// ── DigimonStageView ───────────────────────────────────────────────
function DigimonStageView({ line, stageIdx, tamer, editable, isGM, onSaveLine, onSaveTamer }: {
  line: DigimonLine; stageIdx: number; tamer?: Tamer; editable: boolean; isGM?: boolean
  onSaveLine: (l: DigimonLine) => void; onSaveTamer?: (t: Tamer) => void
}) {
  const stage = line.stages[stageIdx]
  const [toast, setToast]    = useState<string|null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showEvo, setShowEvo] = useState(false)
  const [editInfo, setEditInfo] = useState(false)
  const [pendAttr, setPendAttr] = useState<Record<string, number>>({})
  // toggles das passivas: chave = índice da skill no array original, valor = { active, x }
  const [passiveToggles, setPassiveToggles] = useState<Record<number, { active: boolean; x: number }>>({})
  const [freeMode, setFreeMode] = useState(false)
  const pendCost = useMemo(() => pendingCost(pendAttr, stage?.attributes ?? {}, true), [pendAttr, stage])
  const hasPending = pendCost > 0
  const msg = (m: string) => setToast(m)

  if (!stage) return null
  if (stage.locked) return (
    <div style={{ textAlign:'center', padding:'48px 24px', color:'var(--ink-mute)' }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase' }}>Estágio bloqueado</div>
      <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:32, marginTop:8 }}>~ Ainda não revelado ~</div>
    </div>
  )

  const xpAvail = tamer?.xp ?? 0
  const evBonus = stageIdx > 1 ? stageIdx - 1 : 0

  // Para digimons parceiros: derivar HP a partir do tamer (regra do sistema)
  // Para selvagens e bugs: usar os valores absolutos do status — sem cálculo
  const isDerived = !!tamer
  const tamerHP = tamer ? tamer.status.HP.max : undefined
  const derived = isDerived
    ? calcDigimonDerived(stage.attributes, stage.size, stage.speed, evBonus, tamerHP, stage.level)
    : {
        HP:           stage.status.HP,
        Defesa:       stage.status.Defesa,
        Iniciativa:   stage.status.Iniciativa,
        Deslocamento: stage.status.Deslocamento,
      }

  // Calcular bônus acumulados de todas as passivas ativas (toggle)
  const activeStatusBonus = stage.skills.reduce((acc, sk, idx) => {
    if (!sk.toggleBonus?.statusBonus) return acc
    const t = passiveToggles[idx]
    if (!t?.active) return acc
    const multiplier = sk.toggleBonus.xBonus ? t.x : 1
    for (const [k, v] of Object.entries(sk.toggleBonus.statusBonus)) {
      acc[k] = (acc[k] ?? 0) + (v ?? 0) * multiplier
    }
    return acc
  }, {} as Record<string, number>)

  // alwaysOn: sempre ativo, sem toggle — inclui herança do Child para evoluções acima dele
  const childStageIdx = line.stages.findIndex(s => !s.locked && (s.level.includes('Lvl 3') || s.level.includes('Child')))
  const alwaysOnBonus = (() => {
    const acc: Record<string, number> = {}
    for (const sk of stage.skills) {
      if (!sk.alwaysOn?.statusBonus) continue
      for (const [k, v] of Object.entries(sk.alwaysOn.statusBonus)) acc[k] = (acc[k] ?? 0) + (v ?? 0)
    }
    if (childStageIdx >= 0 && stageIdx > childStageIdx) {
      for (const sk of line.stages[childStageIdx].skills) {
        if (!sk.alwaysOn?.statusBonus || !sk.alwaysOn.inheritable) continue
        for (const [k, v] of Object.entries(sk.alwaysOn.statusBonus)) acc[k] = (acc[k] ?? 0) + (v ?? 0)
      }
    }
    return acc
  })()

  const maxHPDigi = derived.HP + (stage.status.hpMaxBonus ?? 0) + (activeStatusBonus['HP'] ?? 0) + (alwaysOnBonus['HP'] ?? 0)
  const saveStageStatus = (patch: Partial<typeof stage.status>) => {
    const newStages = line.stages.map((s,i) => i===stageIdx ? { ...s, status: { ...s.status, ...patch } } : s)
    onSaveLine({ ...line, stages: newStages })
  }

  const statusEntries: StatEntry[] = [
    ['HP',
      `${stage.status.HP}/${maxHPDigi}`,
      (v: number) => saveStageStatus({ HP: Math.max(0, Math.min(v, maxHPDigi)) })
    ],
    ['Deslocamento', derived.Deslocamento + (activeStatusBonus['Deslocamento'] ?? 0) + (alwaysOnBonus['Deslocamento'] ?? 0)],
    ['Iniciativa',   derived.Iniciativa   + (activeStatusBonus['Iniciativa']   ?? 0) + (alwaysOnBonus['Iniciativa']   ?? 0)],
    ['Defesa',       derived.Defesa       + (activeStatusBonus['Defesa']       ?? 0) + (alwaysOnBonus['Defesa']       ?? 0)],
    ['Armadura',     stage.status.Armadura + (activeStatusBonus['Armadura']    ?? 0) + (alwaysOnBonus['Armadura']     ?? 0)],
    ...(activeStatusBonus['SecurityAttack'] ? [['Security Attack', `+${activeStatusBonus['SecurityAttack']}`] as [string,string]] : []),
    ...(tamer ? [['XP (tamer)', tamer.xp] as [string, number]] : []),
  ]

  const pendAttrUp = (k: AttributeKey) => {
    if ((stage.attributes[k] + (pendAttr[k]??0)) >= 10) return
    setPendAttr(p => ({ ...p, [k]: (p[k]??0)+1 }))
  }
  const pendAttrDown = (k: AttributeKey) => {
    if ((pendAttr[k]??0) <= 0) return
    setPendAttr(p => ({ ...p, [k]: p[k]-1 }))
  }
  const confirmXp = () => {
    if (!tamer || !onSaveTamer) { msg('Sem tamer vinculado.'); return }
    if (pendCost > tamer.xp) { msg('XP insuficiente!'); return }
    let attrs = { ...stage.attributes }
    for (const [k, d] of Object.entries(pendAttr)) if (d > 0) attrs[k as AttributeKey] += d
    onSaveTamer({ ...tamer, xp: tamer.xp - pendCost, xpSpent: tamer.xpSpent + pendCost })
    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, attributes: attrs } : s) })
    setPendAttr({}); msg(`−${pendCost} XP do tamer confirmado!`)
  }
  const cancelXp = () => { setPendAttr({}); msg('Cancelado.') }

  const onAddSkill = (sk: TamerSkill | DigimonSkill) => {
    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, skills:[...s.skills, sk as DigimonSkill] } : s) })
    setShowAdd(false); msg('Skill adicionada!')
  }
  const onDelSkill = (idx: number) => {
    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, skills:s.skills.filter((_,j)=>j!==idx) } : s) })
    msg('Skill removida.')
  }
  const onChangeSkill = (idx: number, sk: DigimonSkill) => {
    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, skills:s.skills.map((x,j)=>j===idx?sk:x) } : s) })
  }
  const onAddEvo = (evo: DigimonStage) => {
    const firstQ = line.stages.findIndex(s => s.stageName === '???' && !s.locked)
    if (firstQ === -1) { msg('Nenhum slot ??? disponível.'); return }
    onSaveLine({ ...line, stages: line.stages.map((s,i)=>i===firstQ?{...evo,locked:false}:s), line: line.line.replace('???', evo.stageName) })
    setShowEvo(false); msg(`${evo.stageName} registrado!`)
  }
  const onChangeWeakness = (w: Record<string,string>) =>
    onSaveLine({ ...line, stages: line.stages.map((s,i)=>i===stageIdx?{...s,weakness:w}:s) })
  const onChangeAffinity = (a: Partial<Record<string,number>>) =>
    onSaveLine({ ...line, stages: line.stages.map((s,i)=>i===stageIdx?{...s,affinity:a}:s) })

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      <div style={{ display:'flex', gap:20, alignItems:'flex-start', marginBottom:16 }}>
        <div style={{ position:'relative', width:96, height:96, flexShrink:0 }}>
          <div style={{ width:96, height:96, borderRadius:14, overflow:'hidden', position:'relative' }}>
            <GrainFill color={stage.portrait} />
            {(() => {
              // Prioridade: imagem do estágio > imagem default > imagem da line
              const imgKey = `${line.id}:${stageIdx}`
              const defaultImg = DIGIMON_DEFAULT_IMAGES[imgKey] ?? null
              const img: string | null = stage.image ?? defaultImg ?? line.image ?? null
              return img ? <img src={img} alt={stage.stageName} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} /> : null
            })()}
          </div>
          {editable && (
            <label style={{ position:'absolute', inset:0, borderRadius:14, background:'rgba(0,0,0,0.35)',
              display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
              opacity:0, transition:'opacity 0.15s', fontSize:10, letterSpacing:'0.1em',
              textTransform:'uppercase', color:'white', fontFamily:'var(--font-mono)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity='1')}
              onMouseLeave={e => (e.currentTarget.style.opacity='0')}>
              foto
              <input type="file" accept="image/*" style={{ display:'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader()
                  r.onload = ev => {
                    const dataUrl = ev.target?.result as string
                    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, image: dataUrl } : s) })
                  }
                  r.readAsDataURL(f)
                }} />
            </label>
          )}
        </div>
        {/* Aviso de migração: line tem imagem mas estágio não */}
        {editable && line.image && !stage.image && (
          <div style={{ alignSelf:'center' }}>
            <button onClick={() => onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, image: line.image } : s) })}
              style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase',
                background:'transparent', border:'1px dashed var(--line)', borderRadius:6,
                padding:'3px 8px', cursor:'pointer', color:'var(--ink-mute)', whiteSpace:'nowrap' }}>
              ↙ usar foto da line
            </button>
          </div>
        )}
        <div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-mute)' }}>{stage.level} · {stage.type}</div>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:30, margin:'4px 0', textTransform:'uppercase', letterSpacing:'-0.02em' }}>{stage.stageName}</h3>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)' }}>CUSTO: {stage.cost}</div>
        </div>
      </div>

      {editable && editInfo && (
        <>
          <SectionTitle>Editar estágio</SectionTitle>
          <DigiInfoEditor line={line} stageIdx={stageIdx} onSaveLine={l => { onSaveLine(l); msg('Salvo!') }} />
        </>
      )}
      {editable && (
        <button className={styles.btnGhost} style={{ fontSize:11, marginBottom:12 }} onClick={() => setEditInfo(p=>!p)}>
          {editInfo ? '✕ Fechar' : '✎ Editar info do estágio'}
        </button>
      )}
      {editable && isGM && (
        <button className={styles.btnGhost} style={{ fontSize:11, marginBottom:12, marginLeft:6 }}
          onClick={() => onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, hidden: !s.hidden } : s) })}>
          {stage.hidden ? '👁 Revelar para players' : '🔒 Ocultar de players'}
        </button>
      )}
      {isGM && stage.hidden && (
        <div style={{ marginBottom:10, display:'inline-flex', alignItems:'center', gap:4,
          padding:'3px 10px', background:'rgba(196,51,33,0.10)', borderRadius:6,
          fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.12em',
          textTransform:'uppercase', color:'var(--coral)' }}>
          🔒 Oculto dos players
        </div>
      )}

      <StatRow entries={statusEntries} />

      {editable && freeMode && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:12, padding:'8px 0 4px',
          fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span>HP máx:</span>
            <button className={styles.attrFreeBtn} onClick={() => saveStageStatus({ hpMaxBonus: (stage.status.hpMaxBonus ?? 0) - 1 })}>−</button>
            <span style={{ minWidth:24, textAlign:'center', color:'var(--ink)' }}>{maxHPDigi}</span>
            <button className={styles.attrFreeBtn} onClick={() => saveStageStatus({ hpMaxBonus: (stage.status.hpMaxBonus ?? 0) + 1 })}>+</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span>Armadura:</span>
            <button className={styles.attrFreeBtn} onClick={() => saveStageStatus({ Armadura: Math.max(0, stage.status.Armadura - 1) })}>−</button>
            <span style={{ minWidth:24, textAlign:'center', color:'var(--ink)' }}>{stage.status.Armadura}</span>
            <button className={styles.attrFreeBtn} onClick={() => saveStageStatus({ Armadura: stage.status.Armadura + 1 })}>+</button>
          </div>
        </div>
      )}

      <SectionTitle>Atributos</SectionTitle>
      <AttributeGrid attrs={stage.attributes} editable={editable} pending={pendAttr} onPend={pendAttrUp} onUnpend={pendAttrDown}
        freeMode={freeMode} onFreeModeChange={setFreeMode}
        onFreeEdit={(k, delta) => { onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, attributes: { ...s.attributes, [k]: Math.max(1, Math.min(10, s.attributes[k] + delta)) } } : s) }) }} />
      {hasPending && <XpConfirmBar cost={pendCost} xpAvail={xpAvail} onConfirm={confirmXp} onCancel={cancelXp} />}

      <SectionTitle>Weakness & Resistance</SectionTitle>
      <WeaknessBox weakness={stage.weakness} editable={editable} onChange={onChangeWeakness} />
      <SectionTitle>Affinity</SectionTitle>
      <AffinityGrid affinity={stage.affinity} editable={editable} onChange={onChangeAffinity} />

      <SectionTitle action={editable && !showAdd && (
        <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setShowAdd(true)}>+ Nova Skill</button>
      )}>Skills</SectionTitle>
      {[...stage.skills]
        .map((s, origIdx) => ({ s, origIdx }))
        .sort((a,b) => (a.s.type==="passive"?1:0)-(b.s.type==="passive"?1:0))
        .map(({ s, origIdx }) => (
          <SkillCard key={origIdx} s={s} editable={editable}
            onChange={sk => onChangeSkill(origIdx, sk as DigimonSkill)}
            onDelete={() => onDelSkill(origIdx)}
            onToggle={s.toggleBonus ? (active, x) =>
              setPassiveToggles(p => ({ ...p, [origIdx]: { active, x: x ?? 0 } }))
            : undefined}
            toggleActive={passiveToggles[origIdx]?.active ?? false}
            toggleX={passiveToggles[origIdx]?.x ?? 0}
          />
        ))
      }
      {showAdd && <AddSkillForm isTamer={false} onAdd={onAddSkill} onCancel={() => setShowAdd(false)} />}

      <SectionTitle>Digivolution Line</SectionTitle>
      <div style={{ padding:'14px 16px', background:'var(--paper-deep)', border:'1px solid var(--line-soft)', borderRadius:8, fontFamily:'var(--font-mono)', fontSize:13 }}>{line.line}</div>
      {editable && (
        <div style={{ marginTop:12 }}>
          {!showEvo
            ? <button className={styles.btnGhost} onClick={() => setShowEvo(true)}>+ Registrar nova evolução</button>
            : <AddEvolutionForm onAdd={onAddEvo} onCancel={() => setShowEvo(false)} />}
        </div>
      )}
    </div>
  )
}

// ── BugView ────────────────────────────────────────────────────────
function BugView({ bug: b, editable, onSave }: { bug: Bug; editable: boolean; onSave: (b: Bug) => void }) {
  const [toast, setToast]    = useState<string|null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editInfo, setEditInfo] = useState(false)
  const msg = (m: string) => setToast(m)
  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {editable && editInfo && (
        <>
          <SectionTitle>Editar BUG</SectionTitle>
          <BugInfoEditor bug={b} onSave={nb => { onSave(nb); msg('Salvo!') }} />
        </>
      )}
      {editable && (
        <button className={styles.btnGhost} style={{ fontSize:11, marginBottom:12 }} onClick={() => setEditInfo(p=>!p)}>
          {editInfo ? '✕ Fechar' : '✎ Editar info'}
        </button>
      )}
      <StatRow entries={[['HP',b.status.HP],['Deslocamento',b.status.Deslocamento],['Iniciativa',b.status.Iniciativa],['Defesa',b.status.Defesa],['Armadura',b.status.Armadura]]} />
      <SectionTitle>Atributos</SectionTitle>
      <div className={styles.attrGrid}>
        {ATTRIBUTE_GROUPS.map(g => (
          <div key={g.label} className={styles.attrGroup}>
            <div className={styles.attrGroupLabel}>{g.label}</div>
            {g.keys.map(k => (
              <div key={k} className={styles.attrRow}>
                <span className={styles.attrName}>{k}</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, minWidth: 16, textAlign: 'right' }}>{b.attributes[k]??0}</span>
                  {editable && (
                    <>
                      <button onClick={() => onSave({ ...b, attributes:{ ...b.attributes,[k]:Math.min(10,(b.attributes[k]??0)+1) } })} className={styles.pendBtn}>+</button>
                      <button onClick={() => onSave({ ...b, attributes:{ ...b.attributes,[k]:Math.max(1,(b.attributes[k]??0)-1) } })} className={styles.pendBtnUndo}>−</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <SectionTitle>Weakness & Resistance</SectionTitle>
      <WeaknessBox weakness={b.weakness} editable={editable} onChange={w => onSave({ ...b, weakness:w })} />
      <SectionTitle>Affinity</SectionTitle>
      <AffinityGrid affinity={b.affinity} editable={editable} onChange={a => onSave({ ...b, affinity:a })} />
      <SectionTitle action={editable && !showAdd && (
        <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setShowAdd(true)}>+ Nova Skill</button>
      )}>Skills</SectionTitle>
      {b.skills.map((s,i) => (
        <SkillCard key={i} s={s} editable={editable}
          onChange={sk => onSave({ ...b, skills:b.skills.map((x,j)=>j===i?sk as DigimonSkill:x) })}
          onDelete={() => { onSave({ ...b, skills:b.skills.filter((_,j)=>j!==i) }); msg('Skill removida.') }} />
      ))}
      {showAdd && <AddSkillForm isTamer={false} onAdd={sk => { onSave({ ...b, skills:[...b.skills, sk as DigimonSkill] }); setShowAdd(false); msg('Skill adicionada!') }} onCancel={() => setShowAdd(false)} />}
    </div>
  )
}

// ── SignView ───────────────────────────────────────────────────────
function SignView({ sign: sg, editable, onSave }: { sign: Sign; editable: boolean; onSave: (s: Sign) => void }) {
  const [toast, setToast]    = useState<string|null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const msg = (m: string) => setToast(m)
  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {editable && (
        <div className={styles.infoEditor} style={{ marginBottom:16 }}>
          <div className={styles.formRow}>
            <span className={styles.formLabel}>Código</span>
            {inp(sg.code, v => onSave({ ...sg, code: v }))}
          </div>
          <div className={styles.formRow}>
            <span className={styles.formLabel}>Nome</span>
            {inp(sg.name, v => onSave({ ...sg, name: v }))}
          </div>
          <div className={styles.formRow}>
            <span className={styles.formLabel}>Lore</span>
            <textarea value={sg.lore} onChange={e => onSave({ ...sg, lore: e.target.value })}
              className={styles.formInput} rows={2} style={{ resize:'vertical' }} />
          </div>
        </div>
      )}
      {!editable && sg.lore && (
        <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:15, color:'var(--ink-soft)', marginBottom:16 }}>
          ~ {sg.lore} ~
        </div>
      )}
      <StatRow entries={[['HP',sg.status.HP],['Deslocamento',sg.status.Deslocamento],['Iniciativa',sg.status.Iniciativa],['Defesa',sg.status.Defesa],['Armadura',sg.status.Armadura]]} />
      <SectionTitle>Atributos</SectionTitle>
      <div className={styles.attrGrid}>
        {ATTRIBUTE_GROUPS.map(g => (
          <div key={g.label} className={styles.attrGroup}>
            <div className={styles.attrGroupLabel}>{g.label}</div>
            {g.keys.map(k => (
              <div key={k} className={styles.attrRow}>
                <span className={styles.attrName}>{k}</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:15, minWidth:16, textAlign:'right' }}>{sg.attributes[k]??0}</span>
                  {editable && (
                    <>
                      <button onClick={() => onSave({ ...sg, attributes:{ ...sg.attributes,[k]:Math.min(10,(sg.attributes[k]??0)+1) } })} className={styles.pendBtn}>+</button>
                      <button onClick={() => onSave({ ...sg, attributes:{ ...sg.attributes,[k]:Math.max(0,(sg.attributes[k]??0)-1) } })} className={styles.pendBtnUndo}>−</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <SectionTitle>Weakness & Resistance</SectionTitle>
      <WeaknessBox weakness={sg.weakness} editable={editable} onChange={w => onSave({ ...sg, weakness:w })} />
      <SectionTitle>Affinity</SectionTitle>
      <AffinityGrid affinity={sg.affinity} editable={editable} onChange={a => onSave({ ...sg, affinity:a })} />
      <SectionTitle action={editable && !showAdd && (
        <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setShowAdd(true)}>+ Nova Skill</button>
      )}>Skills</SectionTitle>
      {sg.skills.map((s,i) => (
        <SkillCard key={i} s={s} editable={editable}
          onChange={sk => onSave({ ...sg, skills:sg.skills.map((x,j)=>j===i?sk as DigimonSkill:x) })}
          onDelete={() => { onSave({ ...sg, skills:sg.skills.filter((_,j)=>j!==i) }); msg('Skill removida.') }} />
      ))}
      {showAdd && <AddSkillForm isTamer={false} onAdd={sk => { onSave({ ...sg, skills:[...sg.skills, sk as DigimonSkill] }); setShowAdd(false); msg('Skill adicionada!') }} onCancel={() => setShowAdd(false)} />}
    </div>
  )
}

// ── FullSheet ──────────────────────────────────────────────────────
interface FullSheetProps { subject: SheetSubject; state: AppState; onSaveState?: (s: AppState) => void; editable?: boolean; isGM?: boolean; onSpawnToken?: (token: TokenSpawn) => void }

export function FullSheet({ subject, state, onSaveState, editable = false, isGM = false, onSpawnToken }: FullSheetProps) {
  const { kind } = subject
  let tamer: Tamer | undefined
  let line:  DigimonLine | undefined
  let bug:   Bug | undefined
  let sign:  Sign | undefined

  if (kind === 'tamer')  { tamer = findTamer(state, (subject as any).id); if (tamer?.digimonId) line = findDigimon(state, tamer.digimonId) }
  if (kind === 'pair')   { tamer = findTamer(state, (subject as any).tamerId); line = findDigimon(state, (subject as any).digimonId) }
  if (kind === 'wild' || kind === 'digimon') line = findDigimon(state, (subject as any).id)
  if (kind === 'bug')    bug  = findBug(state, (subject as any).id)
  if (kind === 'sign')   sign = (state.signs ?? []).find(sg => sg.id === (subject as any).id)

  const tabs: { id: string; label: string; locked?: boolean; hidden?: boolean }[] = []
  if (tamer) tabs.push({ id:'tamer', label: tamer.name })
  if (line)  line.stages.forEach((s,i) => {
    if (s.hidden && !isGM) return
    tabs.push({ id:`stage-${i}`, label: s.stageName, locked: s.locked, hidden: s.hidden })
  })
  if (bug)   tabs.push({ id:'bug', label: bug.name })
  if (sign)  tabs.push({ id:'sign', label: sign.code })

  const initial = (kind === 'pair' && (subject as any).stage != null) ? `stage-${(subject as any).stage}` : tabs[0]?.id ?? ''
  const [active, setActive] = useState(initial)
  const [displayMode, setDisplayMode] = useState<'number' | 'dots'>('number')

  if (!tabs.length) return <div style={{ padding:32, color:'var(--ink-mute)' }}>Ficha não encontrada.</div>

  const showTamer = active === 'tamer' && !!tamer
  const stageIdx  = active.startsWith('stage-') ? parseInt(active.slice(6)) : null
  const showBug   = active === 'bug' && !!bug

  let headPortrait = 'sage', headName = '—', headMeta = '—', headImage: string | null = null
  if (tamer) {
    headPortrait = tamer.portrait; headName = tamer.name; headImage = tamer.image
    headMeta = [tamer.surname, tamer.age && `${tamer.age} anos`, tamer.sign, tamer.height && `${tamer.height} cm`, tamer.voice].filter(Boolean).join(' · ')
  } else if (line) {
    const displayIdx = stageIdx ?? line.currentStage
    const curS = line.stages[displayIdx] ?? line.stages[1] ?? line.stages[0]
    headPortrait = curS?.portrait ?? 'sage'
    headName = line.name
    // Imagem: prefere a do estágio ativo, cai para a da line (uploads antigos)
    headImage = curS?.image ?? line.image ?? (DIGIMON_DEFAULT_IMAGES?.[`${line.id}:${displayIdx}`] ?? null)
    headMeta = line.lore || curS?.type || '—'
  } else if (bug) {
    headPortrait = `bug-${bug.color}`; headName = bug.name; headImage = bug.image
    headMeta = `${bug.class}.${bug.color} · Setor ${bug.sectors.join(', ')}`
  } else if (sign) {
    headPortrait = 'indigo'; headName = sign.name; headImage = sign.image
    headMeta = sign.code
  }

  const saveTamer = (t: Tamer) => onSaveState?.({ ...state, tamers: state.tamers.map(x => x.id===t.id?t:x) })
  const saveLine  = (l: DigimonLine) => onSaveState?.({ ...state, bestiary: state.bestiary.map(x => x.id===l.id?l:x) })
  const saveBug   = (b: Bug) => onSaveState?.({ ...state, bugs: state.bugs.map(x => x.id===b.id?b:x) })
  const saveSign  = (sg: Sign) => onSaveState?.({ ...state, signs: (state.signs ?? []).map(x => x.id===sg.id?sg:x) })
  const saveAllAutoridade = (autoridade: number) => onSaveState?.({
    ...state,
    tamers: state.tamers.map(x => ({ ...x, status: { ...x.status, Autoridade: autoridade } }))
  })
  const saveImage = (dataUrl: string) => {
    if (tamer) saveTamer({ ...tamer, image: dataUrl })
    else if (line) {
      // Salva a imagem no estágio ativo, não na line inteira
      const displayIdx = stageIdx ?? line.currentStage
      const newStages = line.stages.map((s, i) =>
        i === displayIdx ? { ...s, image: dataUrl } : s
      )
      saveLine({ ...line, stages: newStages })
    }
    else if (bug)  saveBug({ ...bug, image: dataUrl })
    else if (sign) saveSign({ ...sign, image: dataUrl })
  }

  return (
    <DisplayModeCtx.Provider value={displayMode}>
    <div className={styles.sheet}>
      <div className={styles.sheetHead}>
        {editable
          ? <ImageUploadZone image={headImage} onUpload={saveImage} size={80} />
          : <div className={styles.portrait} style={{ position:'relative' }}><GrainFill color={headPortrait} image={headImage} /></div>
        }
        <div style={{ flex:1, minWidth:0 }}>
          <h2 className={styles.headName}>{headName}</h2>
          <div className={styles.headMeta}>{headMeta}</div>
          {tamer?.tagline && <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:17, color:'var(--ink-soft)', marginTop:4 }}>~ {tamer.tagline} ~</div>}
          {bug?.lore && <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:15, color:'var(--ink-soft)', marginTop:4 }}>~ {bug.lore} ~</div>}
        </div>
      </div>

      <div className={styles.tabs}>
        {tabs.length > 1 && tabs.map(t => (
          <button key={t.id} className={`${styles.tab} ${active===t.id?styles.tabActive:''}`}
            onClick={() => setActive(t.id)}
            style={t.locked ? { fontStyle:'italic', opacity:0.5 } : t.hidden ? { fontStyle:'italic', opacity:0.7, color:'var(--coral)' } : undefined}>
            {t.label}{t.hidden ? ' 🔒' : ''}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, paddingRight:8, borderLeft: tabs.length > 1 ? '1px solid var(--line-soft)' : 'none', paddingLeft:8 }}>
          {editable && isGM && line && (
            <button
              onClick={() => {
                const newStage = { ...makeEmptyStage('???', '???', '—', false), hidden: true }
                const updated = { ...line, stages: [...line.stages, newStage] }
                saveLine(updated)
                setActive(`stage-${line.stages.length}`)
              }}
              title="Adicionar evolução oculta"
              style={{ background:'transparent', border:'1px solid var(--line)', borderRadius:6, cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.08em', color:'var(--ink-mute)', padding:'3px 8px', lineHeight:1, transition:'all 0.15s' }}>
              + Estágio
            </button>
          )}
          <button
            onClick={() => setDisplayMode(m => m === 'number' ? 'dots' : 'number')}
            title={displayMode === 'number' ? 'Mudar para bolinhas' : 'Mudar para números'}
            style={{ background:'transparent', border:'1px solid var(--line)', borderRadius:6, cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.08em', color:'var(--ink-mute)', padding:'3px 10px', lineHeight:1, transition:'all 0.15s' }}>
            {displayMode === 'number' ? '◌◌◌' : '1 2 3'}
          </button>
        </div>
      </div>

      <div className={styles.sheetBody}>
        {showTamer && <TamerView tamer={tamer!} line={line} editable={editable} onSave={saveTamer} onSaveLine={saveLine} onSaveAll={saveAllAutoridade} state={state} onSaveState={onSaveState} onSpawnToken={onSpawnToken} />}
        {stageIdx !== null && line && (
          <DigimonStageView line={line} stageIdx={stageIdx} tamer={tamer} editable={editable} isGM={isGM} onSaveLine={saveLine} onSaveTamer={tamer ? saveTamer : undefined} />
        )}
        {showBug && <BugView bug={bug!} editable={editable} onSave={saveBug} />}
        {active === 'sign' && sign && <SignView sign={sign} editable={editable} onSave={saveSign} />}
      </div>
    </div>
    </DisplayModeCtx.Provider>
  )
}

// ── Modal wrapper ──────────────────────────────────────────────────
export function SheetModal({ subject, state, onSaveState, onClose, editable, isGM, onSpawnToken }: {
  subject: SheetSubject | null; state: AppState; onSaveState?: (s: AppState) => void
  onClose: () => void; editable?: boolean; isGM?: boolean; onSpawnToken?: (token: TokenSpawn) => void
}) {
  if (!subject) return null
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">×</button>
        <FullSheet subject={subject} state={state} onSaveState={onSaveState} editable={editable} isGM={isGM} onSpawnToken={onSpawnToken} />
      </div>
    </div>
  )
}