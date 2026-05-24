import React, { useState, useCallback, useMemo } from 'react'
import type { AppState, Stage, ActorRef, TamerSkill } from '../types'
import { findTamer, findDigimon, findBug, makeStage, DIGIMON_DEFAULT_IMAGES } from '../data/store'
import { PageHead } from '../components/PageHead'
import { GrainFill } from '../components/GrainFill'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject, TokenSpawn } from '../components/Sheet'
import styles from './TeatroPage.module.css'

interface Props { state: AppState; onUpdate: (s: AppState) => void }

// ── Climas ────────────────────────────────────────────────────────────────────

interface Clima {
  id:      string
  name:    string
  type:    'Natural' | 'Especial'
  color:   string   // CSS var name
  icon:    string   // emoji
  effects: { tag: string; desc: string; color: string }[]
}

const CLIMAS: Clima[] = [
  {
    id: 'clear-skies', name: 'Clear Skies', type: 'Natural', color: 'gold', icon: '☀️',
    effects: [
      { tag: 'Neutro', desc: 'Sem efeitos adicionais.', color: 'ink-mute' },
    ],
  },
  {
    id: 'intense-sunlight', name: 'Intense Sunlight', type: 'Natural', color: 'orange', icon: '🌤',
    effects: [
      { tag: 'Fogo +2', desc: 'Ataques de Fogo causam +2 de dano.', color: 'coral' },
      { tag: 'Água −2', desc: 'Ataques de Água causam −2 de dano.', color: 'blue' },
      { tag: 'Burn +2', desc: 'Ações que aplicam Burn recebem +1 sucesso e aplicam +2 cargas extras.', color: 'orange' },
    ],
  },
  {
    id: 'dense-fog', name: 'Dense Fog', type: 'Natural', color: 'ink-mute', icon: '🌫',
    effects: [
      { tag: 'Enfraquecer +2', desc: 'Ações com Enfraquecer recebem +2 sucessos.', color: 'purple' },
      { tag: 'Físico −2', desc: 'Ataques Físicos têm −2 sucessos.', color: 'ink-mute' },
      { tag: 'Blind/Mist +1', desc: 'Ações que causam Blind ou Mist recebem +1 sucesso.', color: 'indigo' },
    ],
  },
  {
    id: 'heavy-rain', name: 'Heavy Rain', type: 'Natural', color: 'blue', icon: '🌧',
    effects: [
      { tag: 'Água +2', desc: 'Ataques de Água causam +2 de dano.', color: 'blue' },
      { tag: 'Fogo −2', desc: 'Ataques de Fogo causam −2 de dano.', color: 'coral' },
      { tag: 'Paralysis +2', desc: 'Ações de Trovão recebem +1 sucesso e ações com Paralysis aplicam +2 cargas extras.', color: 'teal' },
    ],
  },
]

// ── Tipos de estado em tempo real do palco ───────────────────────────────────

interface ActorState {
  hp:          number
  hp_max:      number
  defesa:      number
  defesa_base: number   // valor de base da Defesa — para onde volta no virar do round
  armadura:    number
  conditions:  ConditionBar[]
}

interface ConditionBar {
  id:     string
  label:  string   // ex: 'Burn', 'Poison', 'Paralysis'
  filled: number   // 0..max
  max:    number   // 10 para ferimentos, 3 ou 5 para acumulação
  color:  string   // 'coral' | 'orange' | 'blue' | 'purple' etc
}

interface Clock {
  id:        string
  name:      string   // ex: 'Relógio de Burn'
  actorKey:  string   // actor key do personagem dono
  filled:    number   // 0..10
  color:     string
}

// ── Stage expandido (campos extras além do Stage base) ───────────────────────

interface StageRuntime {
  roundCurrent: number
  actorStates:  Record<string, ActorState>
  clocks:       Clock[]
  clima:        string | null   // id do clima ativo (null = sem clima definido)
}

function getRuntime(stage: Stage): StageRuntime & { tokenMeta: Record<string, { name: string; level: string }> } {
  const s = stage as Stage & Partial<StageRuntime> & { tokenMeta?: Record<string, { name: string; level: string }> }
  return {
    roundCurrent: s.roundCurrent ?? 0,
    actorStates:  s.actorStates  ?? {},
    clocks:       s.clocks       ?? [],
    clima:        (s as any).clima ?? null,
    tokenMeta:    s.tokenMeta    ?? {},
  }
}

// ── Actor key único ──────────────────────────────────────────────────────────

function actorKey(a: ActorRef): string {
  if (a.kind === 'human') return `tamer:${a.id}`
  if (a.kind === 'pair')  return `digi:${a.digimonId}:${a.stage}`
  if (a.kind === 'wild')  return `wild:${a.id}`
  return `bug:${a.id}`
}

// ── Resolver ator para display ───────────────────────────────────────────────

function resolveActor(state: AppState, a: ActorRef, tokenMeta?: Record<string, { name: string; level: string }>): {
  title: string; type: string; portrait: string; image: string | null
  stats: [string, string|number][]; subject: SheetSubject
} {
  if (a.kind === 'human') {
    const t = findTamer(state, a.id)
    return {
      title: t?.name ?? '?', type: 'Tamer', portrait: t?.portrait ?? 'sage',
      image: t?.image ?? null,
      stats: [['HP', t?.status.HP.v ?? '?']],
      subject: { kind: 'tamer', id: a.id },
    }
  }
  if (a.kind === 'pair') {
    const d = findDigimon(state, a.digimonId)
    const stageIdx = a.stage ?? 0
    const s = d?.stages[stageIdx]
    const stageImgKey = `${a.digimonId}:${stageIdx}`
    const image = s?.image ?? DIGIMON_DEFAULT_IMAGES[stageImgKey] ?? d?.image ?? null
    return {
      title: s?.stageName ?? d?.name ?? '?',
      type: `${s?.level ?? '?'} · ${s?.type ?? '?'}`,
      portrait: s?.portrait ?? 'sage',
      image,
      stats: [['HP', s?.status.HP ?? '?'], ['DEF', s?.status.Defesa ?? '?'], ['ARM', s?.status.Armadura ?? 0]],
      subject: { kind: 'pair', tamerId: a.tamerId, digimonId: a.digimonId, stage: stageIdx },
    }
  }
  if (a.kind === 'wild') {
    const meta = tokenMeta?.[a.id]
    if (meta) {
      const label = meta.level ? `${meta.name} (${meta.level})` : meta.name
      return {
        title: label, type: 'Token', portrait: 'teal', image: null,
        stats: [['HP', 0]],
        subject: { kind: 'wild', id: a.id },
      }
    }
    const d = findDigimon(state, a.id); const s = d?.stages[0]
    const wildImg = s?.image ?? DIGIMON_DEFAULT_IMAGES[`${a.id}:0`] ?? d?.image ?? null
    return {
      title: d?.name ?? '?', type: s?.type ?? '?', portrait: s?.portrait ?? 'sage',
      image: wildImg,
      stats: [['HP', s?.status.HP ?? '?'], ['DEF', s?.status.Defesa ?? '?']],
      subject: { kind: 'wild', id: a.id },
    }
  }
  const b = findBug(state, a.id)
  return {
    title: b?.name ?? '?', type: `${b?.class ?? '?'}.${b?.color ?? '?'}`,
    portrait: `bug-${b?.color ?? 'red'}`, image: b?.image ?? null,
    stats: [['HP', b?.status.HP ?? '?'], ['DEF', b?.status.Defesa ?? '?']],
    subject: { kind: 'bug', id: a.id },
  }
}

// ── Painel de estado do ator (HP, Defesa, Armadura, Condições) ───────────────

function ActorStatePanel({ aKey, aState, onChange, isTamer = false }: {
  aKey: string
  aState: ActorState
  onChange: (s: ActorState) => void
  isTamer?: boolean
}) {
  const [showCond, setShowCond] = useState(false)
  const [newCond, setNewCond]   = useState({ label: '', max: 10, color: 'coral' })

  const addCondition = () => {
    if (!newCond.label.trim()) return
    const cond: ConditionBar = {
      id: `cond-${Date.now().toString(36)}`,
      label: newCond.label.trim(),
      filled: 0,
      max: newCond.max,
      color: newCond.color,
    }
    onChange({ ...aState, conditions: [...(aState.conditions ?? []), cond] })
    setNewCond({ label: '', max: 10, color: 'coral' })
  }

  const updateCond = (id: string, filled: number) => {
    onChange({ ...aState, conditions: aState.conditions.map(c => c.id === id ? { ...c, filled } : c) })
  }

  const removeCond = (id: string) => {
    onChange({ ...aState, conditions: aState.conditions.filter(c => c.id !== id) })
  }

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--paper-deep)', borderRadius: 8,
      border: '1px solid var(--line-soft)', fontSize: 12 }}>
      {/* HP */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', minWidth: 48 }}>HP</span>
        <button onClick={() => onChange({ ...aState, hp: Math.max(0, aState.hp - 1) })}
          style={btnStyle}>−</button>
        <input type="number" value={aState.hp}
          onChange={e => onChange({ ...aState, hp: Math.max(0, parseInt(e.target.value) || 0) })}
          style={{ width: 44, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 6,
            padding: '2px 4px', fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--paper)' }} />
        <span style={{ color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>/ {aState.hp_max}</span>
        <button onClick={() => onChange({ ...aState, hp: Math.min(aState.hp_max, aState.hp + 1) })}
          style={btnStyle}>+</button>
        <button onClick={() => onChange({ ...aState, hp: aState.hp_max })}
          style={{ ...btnStyle, fontSize: 10, padding: '2px 6px' }}>↺</button>
      </div>
      {/* Defesa / Memory — só para não-tamers, ou tamers com DEF ativa (Eisuke) */}
      {(!isTamer || aState.defesa > 0) && (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', minWidth: 48 }}>
          DEF
        </span>
        <button onClick={() => onChange({ ...aState, defesa: Math.max(0, aState.defesa - 1) })}
          style={btnStyle}>−</button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}>{aState.defesa}</span>
        <button onClick={() => onChange({ ...aState, defesa: aState.defesa + 1 })}
          style={btnStyle}>+</button>
      </div>
      )}
      {/* Armadura — só para não-tamers */}
      {!isTamer && (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', minWidth: 48 }}>ARM</span>
        <button onClick={() => onChange({ ...aState, armadura: Math.max(0, aState.armadura - 1) })}
          style={btnStyle}>−</button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}>{aState.armadura}</span>
        <button onClick={() => onChange({ ...aState, armadura: aState.armadura + 1 })}
          style={btnStyle}>+</button>
      </div>
      )}
      {/* Condições */}
      {(aState.conditions ?? []).map(c => (
        <div key={c.id} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', flex: 1 }}>{c.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: `var(--${c.color})` }}>
              {c.filled}/{c.max}
            </span>
            <button onClick={() => removeCond(c.id)}
              style={{ ...btnStyle, color: 'var(--coral)', borderColor: 'var(--coral)', fontSize: 10 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {Array.from({ length: c.max }).map((_, i) => (
              <div key={i}
                onClick={() => {
                  const newFilled = i < c.filled ? i : i + 1
                  if (newFilled === 0) {
                    // Remove a condição automaticamente quando chega a 0
                    onChange({ ...aState, conditions: aState.conditions.filter(x => x.id !== c.id) })
                  } else {
                    updateCond(c.id, newFilled)
                  }
                }}
                style={{ width: 14, height: 14, borderRadius: 3, cursor: 'pointer',
                  background: i < c.filled ? `var(--${c.color})` : 'var(--line-soft)',
                  border: `1px solid var(--${c.color})`, opacity: i < c.filled ? 1 : 0.4 }} />
            ))}
          </div>
        </div>
      ))}
      {/* Botão para adicionar condição */}
      <button onClick={() => setShowCond(p => !p)}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
          textTransform: 'uppercase', background: 'transparent', border: '1px dashed var(--line)',
          borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--ink-mute)', marginTop: 4 }}>
        {showCond ? '− condição' : '+ condição'}
      </button>
      {showCond && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input value={newCond.label} onChange={e => setNewCond(p => ({ ...p, label: e.target.value }))}
            placeholder="Burn, Poison..." style={{ flex: 1, minWidth: 80, border: '1px solid var(--line)',
              borderRadius: 6, padding: '4px 8px', fontFamily: 'var(--font-body)', fontSize: 12,
              background: 'var(--paper)' }} />
          <input type="number" min={1} max={20} value={newCond.max}
            onChange={e => setNewCond(p => ({ ...p, max: parseInt(e.target.value) || 10 }))}
            style={{ width: 44, border: '1px solid var(--line)', borderRadius: 6, padding: '4px 6px',
              fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--paper)', textAlign: 'center' }} />
          <select value={newCond.color} onChange={e => setNewCond(p => ({ ...p, color: e.target.value }))}
            style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: 12,
              background: 'var(--paper)', fontFamily: 'var(--font-body)' }}>
            {['coral','orange','blue','purple','green','teal','gold','indigo'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={addCondition}
            style={{ ...btnStyle, background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }}>
            +
          </button>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--line)',
  background: 'transparent', cursor: 'pointer', fontSize: 14, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  color: 'var(--ink-soft)', flexShrink: 0,
}

// ── GenericSkillToggles ───────────────────────────────────────────────────────
// Renderiza botões de palco para qualquer skill com toggleBonus não tratada especialmente.
// Suporta: statusBonus, xBonus, selfConditions, targetConditions, memoryDelta, palcoLabel.

function GenericSkillToggles({ skills, actorSt, onChange }: {
  skills: import('../types').TamerSkill[]
  actorSt: ActorState
  onChange: (s: ActorState) => void
}) {
  const [activeSkill, setActiveSkill]   = useState<string | null>(null)
  const [xValues, setXValues]           = useState<Record<string, number>>({})
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  // pendingTarget: título da skill aguardando seleção de alvo (future — no palco atual, simplificado)

  return (
    <>
      {skills.map(sk => {
        const tb = sk.toggleBonus!
        const isOpen = activeSkill === sk.title
        const x = xValues[sk.title] ?? 1
        const label = tb.palcoLabel || `⊕ ${sk.title}`
        const markerLabel = `__toggle__${sk.title}`
        const isOn = actorSt.conditions.some(c => c.label === markerLabel)

        const activate = () => {
          if (!tb) return
          let newSt = { ...actorSt }

          // statusBonus
          if (tb.statusBonus) {
            const mult = tb.xBonus ? x : 1
            Object.entries(tb.statusBonus).forEach(([k, v]) => {
              if (k === 'Defesa')       newSt = { ...newSt, defesa:   newSt.defesa   + (v ?? 0) * mult }
              if (k === 'Armadura')     newSt = { ...newSt, armadura: newSt.armadura + (v ?? 0) * mult }
              if (k === 'HP')           newSt = { ...newSt, hp:       newSt.hp       + (v ?? 0) * mult,
                                                             hp_max:   newSt.hp_max   + (v ?? 0) * mult }
            })
          }

          // selfConditions
          if (tb.selfConditions?.length) {
            const newConds = [...newSt.conditions]
            tb.selfConditions.forEach(pc => {
              const existing = newConds.find(c => c.label === pc.label)
              if (existing) {
                const idx = newConds.indexOf(existing)
                newConds[idx] = { ...existing, filled: Math.min(existing.max, existing.filled + pc.filled) }
              } else {
                newConds.push({ id: `cond-${pc.label}-${Date.now().toString(36)}`,
                  label: pc.label, filled: pc.filled, max: pc.max, color: pc.color })
              }
            })
            newSt = { ...newSt, conditions: newConds }
          }

          // Marcador de "está ativa" (para toggle off)
          if (!newSt.conditions.some(c => c.label === markerLabel)) {
            newSt = { ...newSt, conditions: [
              ...newSt.conditions,
              { id: `marker-${Date.now().toString(36)}`, label: markerLabel,
                filled: 1, max: 1, color: 'teal' },
            ]}
          }

          onChange(newSt)
          setActiveSkill(null)
        }

        const deactivate = () => {
          let newSt = { ...actorSt }
          // Reverter statusBonus
          if (tb.statusBonus) {
            const mult = tb.xBonus ? x : 1
            Object.entries(tb.statusBonus).forEach(([k, v]) => {
              if (k === 'Defesa')   newSt = { ...newSt, defesa:   Math.max(0, newSt.defesa   - (v ?? 0) * mult) }
              if (k === 'Armadura') newSt = { ...newSt, armadura: Math.max(0, newSt.armadura - (v ?? 0) * mult) }
              if (k === 'HP')       newSt = { ...newSt, hp:       Math.max(0, newSt.hp       - (v ?? 0) * mult),
                                                         hp_max:   Math.max(0, newSt.hp_max   - (v ?? 0) * mult) }
            })
          }
          // Remover marcador
          newSt = { ...newSt, conditions: newSt.conditions.filter(c => c.label !== markerLabel) }
          onChange(newSt)
        }

        return (
          <div key={sk.title} style={{ marginTop: 4 }}>
            <button
              onClick={() => isOn ? deactivate() : setActiveSkill(isOpen ? null : sk.title)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', width: '100%',
                background: isOn ? 'var(--teal)' : isOpen ? 'var(--paper-deep)' : 'transparent',
                border: `1px solid ${isOn ? 'var(--teal)' : 'var(--line)'}`,
                color: isOn ? '#f6f2e9' : 'var(--ink-mute)',
                borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
              {isOn ? `✓ ${sk.title}` : label}
            </button>

            {isOpen && !isOn && (
              <div style={{ marginTop: 4, padding: '8px 10px', background: 'var(--paper)',
                border: '1px solid var(--teal)', borderRadius: 8 }}>

                {/* xBonus selector */}
                {tb.xBonus && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                      textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 5 }}>
                      {tb.xBonus.label}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: tb.xBonus.xMax }, (_, i) => i + 1).map(v => (
                        <button key={v} onClick={() => setXValues(p => ({ ...p, [sk.title]: v }))}
                          style={{ flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                            border: `1.5px solid ${x === v ? 'var(--teal)' : 'var(--line)'}`,
                            background: x === v ? 'var(--teal)' : 'transparent',
                            color: x === v ? '#f6f2e9' : 'var(--ink-soft)' }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview do efeito */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)',
                  marginBottom: 8, lineHeight: 1.6 }}>
                  {tb.statusBonus && Object.entries(tb.statusBonus).map(([k,v]) =>
                    `${k} +${(v??0) * (tb.xBonus ? x : 1)}`
                  ).join(' · ')}
                  {tb.selfConditions?.length ? (tb.statusBonus ? ' · ' : '') +
                    tb.selfConditions.map(c => c.label).join(', ') : ''}
                  {tb.durationRounds ? ` · ${tb.durationRounds}R` : ''}
                </div>

                <button onClick={activate}
                  style={{ width: '100%', padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                    background: 'var(--teal)', color: '#f6f2e9', border: 'none',
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11 }}>
                  Ativar
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── ActorChip ─────────────────────────────────────────────────────────────────

function ActorChip({ actor, state, actorSt, onOpen, onRemove, onChange, onEvolve, tokenMeta, onSpawnToken }: {
  actor: ActorRef; state: AppState
  actorSt: ActorState | undefined
  onOpen: () => void; onRemove: () => void
  onChange: (s: ActorState) => void
  onEvolve?: (newStageIdx: number) => void
  tokenMeta?: Record<string, { name: string; level: string }>
  onSpawnToken?: (token: TokenSpawn) => void
}) {
  const [showState, setShowState] = useState(false)
  const [showEvo,   setShowEvo]   = useState(false)
  const r = resolveActor(state, actor, tokenMeta)

  const displayHp  = actorSt?.hp      ?? (r.stats.find(([k]) => k === 'HP')?.[1]  ?? '?')
  const displayDef = actorSt?.defesa   ?? (r.stats.find(([k]) => k === 'DEF')?.[1] ?? '?')
  const displayArm = actorSt?.armadura ?? 0
  const condCount  = (actorSt?.conditions ?? []).length

  const tamerName = actor.kind === 'pair'
    ? findTamer(state, actor.tamerId)?.name ?? null
    : null

  // ── Twilight Memories (passiva do Hibito — Silhouette Token como Ação Livre) ──
  const hasTwilightMemories = actor.kind === 'human' && (() => {
    const t = findTamer(state, actor.id)
    return t?.tamerSkills.some(sk => sk.title === 'Twilight Memories') ?? false
  })()

  // ── Before My Body Submits (passiva do Eisuke — DEF+1 enquanto tem Blocker) ──
  const hasBmbs = actor.kind === 'human' && (() => {
    const t = findTamer(state, actor.id)
    return t?.tamerSkills.some(sk => sk.keyword === 'Before My Body Submits') ?? false
  })()
  const bmbsActive = hasBmbs && (actorSt?.defesa ?? 0) > 0

  const toggleBmbs = () => {
    if (!actorSt) return
    // Se DEF atual já inclui o +1 da passiva (marcado via condição especial),
    // remover; caso contrário, adicionar.
    const alreadyOn = actorSt.conditions.some(c => c.label === 'Before My Body Submits')
    if (alreadyOn) {
      onChange({
        ...actorSt,
        defesa: Math.max(0, actorSt.defesa - 1),
        conditions: actorSt.conditions.filter(c => c.label !== 'Before My Body Submits'),
      })
    } else {
      onChange({
        ...actorSt,
        defesa: actorSt.defesa + 1,
        conditions: [
          ...actorSt.conditions,
          { id: `cond-bmbs-${Date.now().toString(36)}`, label: 'Before My Body Submits',
            filled: 1, max: 1, color: 'blue' },
        ],
      })
    }
  }

  const bmbsIsOn = actorSt?.conditions.some(c => c.label === 'Before My Body Submits') ?? false

  // ── My Body as a Shield ──────────────────────────────────────────
  const [showMbas, setShowMbas] = useState(false)
  const [mbasX,    setMbasX]    = useState(1)

  const hasMbas = actor.kind === 'human' && (() => {
    const t = findTamer(state, actor.id)
    return t?.tamerSkills.some(sk => sk.keyword === 'My Body as a Shield') ?? false
  })()

  const activateMbas = () => {
    if (!actorSt) return
    // Defesa +X
    const newDef = actorSt.defesa + mbasX
    // Condição Blocker (máx 1 carga, se já existir apenas incrementa)
    const existingBlocker = actorSt.conditions.find(c => c.label === 'Blocker')
    const newConditions = existingBlocker
      ? actorSt.conditions.map(c =>
          c.label === 'Blocker' ? { ...c, filled: Math.min(c.max, c.filled + 1) } : c
        )
      : [
          ...actorSt.conditions,
          { id: `cond-blocker-${Date.now().toString(36)}`, label: 'Blocker',
            filled: 1, max: 3, color: 'teal' },
        ]
    onChange({ ...actorSt, defesa: newDef, conditions: newConditions })
    setShowMbas(false)
  }
  const evoStages = actor.kind === 'pair'
    ? (() => {
        const d = findDigimon(state, actor.digimonId)
        if (!d) return []
        return d.stages
          .map((s, i) => ({ s, i }))
          .filter(({ s, i }) => i !== actor.stage && !s.locked && s.stageName !== '???')
      })()
    : []

  const handleEvolve = (newIdx: number) => {
    setShowEvo(false)
    onEvolve?.(newIdx)
  }

  return (
    <div className={styles.actor}>
      <button className={styles.actorRemove} onClick={e => { e.stopPropagation(); onRemove() }} title="Remover">×</button>
      <div className={`${styles.actorHead} fill-${r.portrait}`}
        style={{ position: 'relative', cursor: 'pointer', overflow: 'hidden' }}
        onClick={onOpen}>
        {r.image
          ? <img src={r.image} alt={r.title}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div className="grain" />}
      </div>
      <h5 className={styles.actorName} style={{ cursor: 'pointer' }} onClick={onOpen}>{r.title}</h5>
      <div className={styles.actorType}>
        {r.type}
        {tamerName && (
          <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9,
            letterSpacing: '0.08em', color: 'var(--ink-mute)', marginTop: 1 }}>
            ⟷ {tamerName}
          </span>
        )}
      </div>
      <div className={styles.actorStats}>
        <span>HP: {displayHp}</span>
        {actor.kind !== 'human' && <span>DEF: {displayDef}</span>}
        {displayArm > 0 && actor.kind !== 'human' && <span>ARM: {displayArm}</span>}
        {/* Eisuke: mostrar DEF apenas se > 0 (ativado via My Body as a Shield) */}
        {actor.kind === 'human' && displayDef > 0 && <span style={{ color: 'var(--blue)' }}>DEF: {displayDef}</span>}
        {condCount > 0 && <span style={{ color: 'var(--coral)' }}>{condCount} cond.</span>}
      </div>

      {/* Botão de evolução — só para Digimons parceiros com estágios disponíveis */}
      {evoStages.length > 0 && (
        <button onClick={() => setShowEvo(p => !p)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
            textTransform: 'uppercase', background: showEvo ? 'var(--teal)' : 'transparent',
            border: `1px solid ${showEvo ? 'var(--teal)' : 'var(--line)'}`,
            color: showEvo ? '#f6f2e9' : 'var(--teal)',
            borderRadius: 4, padding: '2px 6px', cursor: 'pointer', marginTop: 4, width: '100%' }}>
          ↑ Evoluir
        </button>
      )}

      {/* Mini-picker de estágios */}
      {showEvo && (
        <div style={{ marginTop: 6, background: 'var(--paper)', border: '1px solid var(--teal)',
          borderRadius: 8, overflow: 'hidden' }}>
          {evoStages.map(({ s, i }) => (
            <button key={i} onClick={() => handleEvolve(i)}
              style={{ display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 10px', border: 'none', borderBottom: '1px solid var(--line-soft)',
                background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-deep)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, textTransform: 'uppercase' }}>
                {s.stageName}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)',
                letterSpacing: '0.08em', marginTop: 1 }}>
                {s.level}
                {s.cost && s.cost !== '—' && s.cost !== '0'
                  ? ` · ${s.cost}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Twilight Memories — passiva do Hibito, invoca Silhouette Token */}
      {hasTwilightMemories && onSpawnToken && (
        <button onClick={() => onSpawnToken({ name: 'Silhouette Token', level: '', qty: 1 })}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
            textTransform: 'uppercase', background: 'transparent',
            border: '1px solid var(--purple)', borderRadius: 4,
            padding: '2px 6px', cursor: 'pointer', color: 'var(--purple)',
            marginTop: 4, width: '100%',
            transition: 'all 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--purple)'; e.currentTarget.style.color = '#f6f2e9' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--purple)' }}>
          ⊕ Silhouette Token (Twilight Memories)
        </button>
      )}

      {/* My Body as a Shield — só para Eisuke quando a skill está na ficha */}
      {hasMbas && (
        <>
          <button onClick={() => setShowMbas(p => !p)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
              textTransform: 'uppercase', width: '100%', marginTop: 4,
              background: showMbas ? 'var(--blue)' : 'transparent',
              border: `1px solid ${showMbas ? 'var(--blue)' : 'var(--line)'}`,
              color: showMbas ? '#f6f2e9' : 'var(--blue)',
              borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
            ⊕ My Body as a Shield
          </button>
          {showMbas && (
            <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--paper)',
              border: '1px solid var(--blue)', borderRadius: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 6 }}>
                Escolha X (Memory gasta)
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[1, 2, 3].map(v => (
                  <button key={v} onClick={() => setMbasX(v)}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                      border: `1.5px solid ${mbasX === v ? 'var(--blue)' : 'var(--line)'}`,
                      background: mbasX === v ? 'var(--blue)' : 'transparent',
                      color: mbasX === v ? '#f6f2e9' : 'var(--ink-soft)' }}>
                    {v}
                  </button>
                ))}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)',
                marginBottom: 8, lineHeight: 1.5 }}>
                DEF +{mbasX} · Blocker
              </div>
              <button onClick={activateMbas}
                style={{ width: '100%', padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                  background: 'var(--blue)', color: '#f6f2e9', border: 'none',
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11 }}>
                Ativar
              </button>
            </div>
          )}
        </>
      )}

      {/* Before My Body Submits — passiva do Eisuke, só visível se DEF > 0 */}
      {bmbsActive && (
        <button onClick={toggleBmbs}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
            textTransform: 'uppercase', width: '100%', marginTop: 4,
            background: bmbsIsOn ? 'var(--blue)' : 'transparent',
            border: `1px solid var(--blue)`,
            color: bmbsIsOn ? '#f6f2e9' : 'var(--blue)',
            borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
          {bmbsIsOn ? '✓ Before My Body Submits (DEF +1)' : '○ Before My Body Submits (DEF +1)'}
        </button>
      )}

      {/* ── Skills genéricas com toggleBonus no Palco ── */}
      {actor.kind === 'human' && actorSt && (() => {
        const t = findTamer(state, actor.id)
        if (!t) return null
        // Filtra skills com toggleBonus que não são tratadas especialmente acima
        const SPECIAL_KEYWORDS = ['My Body as a Shield', 'Before My Body Submits']
        const genericSkills = t.tamerSkills.filter(sk =>
          sk.toggleBonus && !SPECIAL_KEYWORDS.includes(sk.keyword)
        )
        if (genericSkills.length === 0) return null
        return <GenericSkillToggles skills={genericSkills} actorSt={actorSt} onChange={onChange} />
      })()}

      <button onClick={() => setShowState(p => !p)}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
          textTransform: 'uppercase', background: 'transparent', border: '1px dashed var(--line)',
          borderRadius: 4, padding: '2px 6px', cursor: 'pointer', color: 'var(--ink-mute)',
          marginTop: 4, width: '100%' }}>
        {showState ? 'fechar' : '⊙ estado'}
      </button>
      {showState && actorSt && (
        <ActorStatePanel aKey={actorKey(actor)} aState={actorSt} onChange={onChange}
          isTamer={actor.kind === 'human'} />
      )}
    </div>
  )
}

// ── Picker de atores ──────────────────────────────────────────────────────────

function Picker({ state, onPick, onClose }: { state: AppState; onPick: (a: ActorRef, qty?: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'pair'|'human'|'wild'|'bug'>('pair')
  const [qty, setQty] = useState(1)
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={styles.picker} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerHead}>
          <h3>Adicionar ator</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>Qtd:</span>
            <input type="number" min={1} max={20} value={qty}
              onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 48, border: '1px solid var(--line)', borderRadius: 6, padding: '3px 6px',
                fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--paper)', textAlign: 'center' }} />
            <button className={styles.btnGhost} onClick={onClose}>fechar</button>
          </div>
        </div>
        <div className={styles.pickerTabs}>
          {(['pair','human','wild','bug'] as const).map(t => (
            <button key={t} className={tab === t ? styles.pickerTabActive : styles.pickerTab} onClick={() => setTab(t)}>
              {{ pair:'Dupla', human:'Tamer Solo', wild:'Bestiário', bug:'BUG' }[t]}
            </button>
          ))}
        </div>
        {tab === 'pair' && (
          <div style={{ padding: '6px 16px', fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.08em', color: 'var(--ink-mute)', borderBottom: '1px solid var(--line-soft)',
            background: 'var(--paper-deep)' }}>
            Adiciona o Tamer e o Digimon como fichas separadas no palco.
          </div>
        )}
        <div className={styles.pickerBody}>
          {tab === 'human' && state.tamers.map(t => (
            <div key={t.id} className={styles.pickerEntry} onClick={() => onPick({ kind:'human', id:t.id }, qty)}>
              <div className={`${styles.pickerMini} fill-${t.portrait}`} style={{position:'relative',overflow:'hidden'}}>
                {t.image ? <img src={t.image} alt={t.name} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/> : <div className="grain"/>}
              </div>
              <div><h6 className={styles.pickerName}>{t.name}</h6><div className={styles.pickerMeta}>{t.age} anos · {t.sign}</div></div>
            </div>
          ))}
          {tab === 'pair' && state.tamers.filter(t => t.digimonId).map(t => {
            const d = findDigimon(state, t.digimonId!)
            if (!d) return null
            return d.stages.map((s, i) => {
              if (s.locked || s.stageName === '???') return null
              return (
                <div key={`${t.id}-${i}`} className={styles.pickerEntry}
                  onClick={() => onPick({ kind:'pair', tamerId:t.id, digimonId:d.id, stage:i }, qty)}>
                  <div className={`${styles.pickerMini} fill-${t.portrait}`} style={{position:'relative',overflow:'hidden'}}>
                    {t.image ? <img src={t.image} alt={t.name} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/> : <div className="grain"/>}
                  </div>
                  <div className={`${styles.pickerMini} fill-${s.portrait}`} style={{position:'relative',marginLeft:-12,overflow:'hidden'}}>
                    {d.image ? <img src={d.image} alt={s.stageName} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/> : <div className="grain"/>}
                  </div>
                  <div><h6 className={styles.pickerName}>{t.name} & {s.stageName}</h6><div className={styles.pickerMeta}>{s.level} · {s.type}</div></div>
                </div>
              )
            })
          })}
          {tab === 'wild' && state.bestiary.filter(d => !d.tamerId).map(d => {
            const s = d.stages[0]
            return (
              <div key={d.id} className={styles.pickerEntry} onClick={() => onPick({ kind:'wild', id:d.id }, qty)}>
                <div className={`${styles.pickerMini} fill-${s.portrait}`} style={{position:'relative',overflow:'hidden'}}>
                  {d.image ? <img src={d.image} alt={d.name} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/> : <div className="grain"/>}
                </div>
                <div><h6 className={styles.pickerName}>{d.name}</h6><div className={styles.pickerMeta}>{s.level} · {s.type}</div></div>
              </div>
            )
          })}
          {tab === 'bug' && state.bugs.map(b => (
            <div key={b.id} className={styles.pickerEntry} onClick={() => onPick({ kind:'bug', id:b.id }, qty)}>
              <div className={`${styles.pickerMini} fill-bug-${b.color}`} style={{position:'relative',overflow:'hidden'}}>
                {b.image ? <img src={b.image} alt={b.name} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/> : <div className="grain grain-invert"/>}
              </div>
              <div><h6 className={styles.pickerName}>{b.name}</h6><div className={styles.pickerMeta}>{b.class}.{b.color}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Domain Panel ──────────────────────────────────────────────────────────────
function getDomainTamers(stage: Stage, state: AppState) {
  const allActors = [...stage.sides.allies, ...stage.sides.enemies]
  const results: { tamerId: string; name: string; portrait: string; domainName: string; skills: TamerSkill[] }[] = []
  const seen = new Set<string>()
  for (const a of allActors) {
    const tid = a.kind === 'human' ? a.id : a.kind === 'pair' ? a.tamerId : null
    if (!tid || seen.has(tid)) continue
    seen.add(tid)
    const t = state.tamers.find(x => x.id === tid)
    if (!t) continue
    const domainSkill = t.tamerSkills.find(s => s.title.startsWith('Domain of') || s.keyword === 'Domain')
    if (!domainSkill) continue
    const domainName = domainSkill.title.startsWith('Domain of') ? domainSkill.title : t.tamerSkills.find(s=>s.title.startsWith('Domain'))?.title ?? 'Domain'
    results.push({ tamerId: tid, name: t.name, portrait: t.portrait, domainName, skills: t.tamerSkills })
  }
  return results
}

const JOGRESS_MEMORY_PASSIVES: { domain: string; tamerTitle: string; skills: TamerSkill[] }[] = [
  { domain: 'Domain of Sky', tamerTitle: 'Domain of Sky', skills: [
    { type: 'passive', keyword: 'Domain of Sky', title: 'Skygazing',
      effect: 'No início do Round, caso o clima seja [Clear Skies], Memory +1 para Hare e todos os aliados humanos dentro do Domain.' },
    { type: 'passive', keyword: 'Domain of Sky', title: 'Weather Forecast',
      effect: 'No início do Round, caso o clima tenha sido alterado no Round anterior, Memory +1 para Hare e todos os aliados humanos dentro do Domain.' },
  ]},
  { domain: 'Domain of Oblivion', tamerTitle: 'Domain of Oblivion', skills: [
    { type: 'passive', keyword: 'Domain of Oblivion', title: 'An Eye for an Eye',
      effect: 'No início do Round, se um inimigo sofreu dano no Round anterior por meio de um ataque, Memory +1 para Hibito e todos os aliados dentro do Domain.' },
    { type: 'passive', keyword: 'Domain of Oblivion', title: 'A Tooth for a Tooth',
      effect: 'No início do Round, se um Digimon aliado sofreu dano no Round anterior por meio de um ataque, Memory +1 para Hibito e todos os aliados dentro do Domain.' },
  ]},
]

const DOMAIN_OF_TIME_ALL_PASSIVES: TamerSkill[] = [
  { type: 'passive', keyword: 'Domain of Time', title: 'Sun-Viewing Recital',
    effect: 'Quando cargas de [Burn] forem aplicadas em personagens, Memory +1 para Hare, Hibito e todos os aliados dentro do [Domain of Time]. Máximo duas vezes por Round.' },
  { type: 'passive', keyword: 'Domain of Time', title: 'Faintly, like the Summer Wind',
    effect: 'Aumenta as rolagens de [Perseverança] de Hare em +2 dados enquanto equipada com [Matoi: Koyomi]. Sempre que usar uma Skill com apenas 1 aliado como alvo, o aliado recebe +2 dados em rolagens de [Perseverança] até o final do Round.' },
  { type: 'passive', keyword: 'Domain of Time', title: 'The Flame That Counts the Years',
    effect: 'Enquanto esse Domain estiver ativo, [Humanos] são imunes a ataques. No final do Round, 3 personagens aleatórios são afetados por 4 cargas de [Burn].' },
  { type: 'passive', keyword: 'Domain of Time', title: 'Twilight Memories',
    effect: 'Durante o seu turno, Hibito pode invocar 1 [Silhouette Token] adjacente a ele como Ação Livre. Se o clima for [Intense Sunlight], pode criar 1 Token extra. Máximo de 3 Silhouette Tokens em campo.' },
]

function DomainPanel({ domainTamers }: { domainTamers: ReturnType<typeof getDomainTamers> }) {
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null)
  const [jogress, setJogress] = useState(false)
  const [jogressPassives, setJogressPassives] = useState<string[]>([])

  const jogressMembers = domainTamers.filter(d => d.skills.some(s => s.title.startsWith('Jogress')))
  const hasJogress = jogressMembers.length >= 2

  React.useEffect(() => {
    if (!hasJogress) { setJogress(false); setJogressPassives([]) }
  }, [hasJogress])

  if (domainTamers.length === 0) return null

  const active = activeDomainId ? domainTamers.find(d => d.tamerId === activeDomainId) : domainTamers[0]
  const domainPassives = active
    ? active.skills.filter(s => s.type === 'passive' && s.keyword !== 'Domain of Time' && !s.title.startsWith('Domain of Time') && s.keyword !== 'Passiva')
    : []

  return (
    <div className={styles.domainPanel}>
      <div className={styles.domainTabs}>
        {domainTamers.map(d => (
          <button key={d.tamerId}
            className={`${styles.domainTab} fill-${d.portrait} ${(activeDomainId ?? domainTamers[0].tamerId) === d.tamerId ? styles.domainTabActive : ''}`}
            onClick={() => { setActiveDomainId(d.tamerId); setJogress(false) }}>
            {d.name}<span className={styles.domainTabSub}>{d.domainName}</span>
          </button>
        ))}
        {jogressMembers.length === 1 && (
          <div style={{ padding:'8px 14px', fontFamily:'var(--font-mono)', fontSize:10,
            letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-mute)',
            borderLeft:'2px solid var(--line)', marginLeft:4 }}>
            Jogress — aguardando {jogressMembers[0].name === 'HARE' ? 'Hibito' : 'Hare'}
          </div>
        )}
        {hasJogress && (() => {
          const jm = domainTamers.filter(d => d.skills.some(s => s.title.startsWith('Jogress')))
          const colorMap: Record<string,string> = { coral:'#e25845', orange:'#e87a2c', teal:'#4a9b9b', purple:'#8a6ea0', black:'#1a1814', green:'#6e9d70', blue:'#6e8bb5', pink:'#ec8aa1', rose:'#d99fae', gold:'#e7d4a3', indigo:'#3b3a5e', sage:'#9bb89c', wheat:'#d9b974', red:'#c43321' }
          const c1 = colorMap[jm[0]?.portrait ?? 'sage'] ?? '#9bb89c'
          const c2 = colorMap[jm[1]?.portrait ?? 'indigo'] ?? '#3b3a5e'
          return (
            <button className={`${styles.domainTab} ${jogress ? styles.domainTabActive : ''}`}
              style={{ background: `linear-gradient(to bottom, ${c1} 50%, ${c2} 50%)`, color: '#f6f2e9' }}
              onClick={() => setJogress(j => !j)}>
              Jogress<span className={styles.domainTabSub}>Domain of Time</span>
            </button>
          )
        })()}
      </div>
      {!jogress && active && (
        <div className={styles.domainPassives}>
          <div className={styles.domainLabel}>{active.domainName} — Passivas ativas</div>
          {domainPassives.length === 0
            ? <div className={styles.domainEmpty}>Nenhuma passiva de Memory neste domain.</div>
            : domainPassives.map((s, i) => (
                <div key={i} className={styles.domainSkill}>
                  <div className={styles.domainSkillTitle}>{s.title}</div>
                  <div className={styles.domainSkillEffect}>{s.effect}</div>
                </div>
              ))
          }
        </div>
      )}
      {jogress && (
        <div className={styles.domainPassives}>
          {jogressPassives.length < 2 ? (
            <>
              <div className={styles.domainLabel}>Escolha até 2 passivas de Memory dos Domains do Jogress</div>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
                Pode escolher qualquer combinação — 2 do mesmo domain também é válido.
              </div>
              {JOGRESS_MEMORY_PASSIVES.map(group => (
                <div key={group.domain} style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:6 }}>{group.domain}</div>
                  {group.skills.map((s, i) => {
                    const chosen = jogressPassives.includes(s.title)
                    const canSelect = chosen || jogressPassives.length < 2
                    return (
                      <div key={i} className={`${styles.domainSkill} ${chosen ? styles.domainSkillChosen : ''}`}
                        onClick={() => { if (!canSelect) return; setJogressPassives(p => p.includes(s.title) ? p.filter(x => x !== s.title) : [...p, s.title]) }}
                        style={{ cursor: canSelect ? 'pointer' : 'not-allowed', opacity: !canSelect ? 0.4 : 1 }}>
                        <div className={styles.domainSkillTitle}>{chosen ? '✓ ' : '○ '}{s.title}</div>
                        <div className={styles.domainSkillEffect}>{s.effect}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <div className={styles.domainLabel} style={{ margin:0 }}>Domain of Time — Passivas ativas</div>
                <button onClick={() => setJogressPassives([])}
                  style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', background:'transparent', border:'1px solid var(--line)', borderRadius:999, padding:'3px 10px', cursor:'pointer', color:'var(--ink-mute)' }}>
                  ↺ Refazer seleção
                </button>
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:8 }}>Passivas de memória herdadas</div>
              {jogressPassives.map(title => {
                const s = JOGRESS_MEMORY_PASSIVES.flatMap(g => g.skills).find(x => x.title === title)!
                return (
                  <div key={title} className={`${styles.domainSkill} ${styles.domainSkillChosen}`}>
                    <div className={styles.domainSkillTitle}>✓ {s.title}</div>
                    <div className={styles.domainSkillEffect}>{s.effect}</div>
                  </div>
                )
              })}
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-mute)', margin:'14px 0 8px' }}>Passivas próprias do Domain of Time</div>
              {DOMAIN_OF_TIME_ALL_PASSIVES.map((s, i) => (
                <div key={i} className={styles.domainSkill}>
                  <div className={styles.domainSkillTitle}>{s.title}</div>
                  <div className={styles.domainSkillEffect}>{s.effect}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Atalhos de Condição ───────────────────────────────────────────────────────

interface ConditionShortcut {
  label:   string
  max:     number
  color:   string
  type:    'ferimento' | 'acumulacao' | 'reacao'
  default: number   // cargas padrão ao aplicar
}

const CONDITION_SHORTCUTS: ConditionShortcut[] = [
  // Ferimentos (relógio até 10)
  { label: 'Burn',       max: 10, color: 'coral',   type: 'ferimento', default: 2 },
  { label: 'Poison',     max: 10, color: 'green',   type: 'ferimento', default: 2 },
  { label: 'Bleed',      max: 10, color: 'red',     type: 'ferimento', default: 2 },
  { label: 'Curse',      max: 10, color: 'purple',  type: 'ferimento', default: 2 },
  // Acumulação
  { label: 'Sleep',      max:  3, color: 'blue',    type: 'acumulacao', default: 1 },
  { label: 'Charm',      max:  3, color: 'pink',    type: 'acumulacao', default: 1 },
  { label: 'Bind',       max:  5, color: 'orange',  type: 'acumulacao', default: 1 },
  { label: 'Paralysis',  max:  5, color: 'teal',    type: 'acumulacao', default: 1 },
  { label: 'Mist',       max: 10, color: 'indigo',  type: 'acumulacao', default: 2 },
  { label: 'De-Digivolve', max: 3, color: 'coral',  type: 'acumulacao', default: 1 },
  { label: 'Decoy',      max:  3, color: 'gold',    type: 'acumulacao', default: 2 },
  // Reações / estados
  { label: 'Blocker',    max:  1, color: 'teal',    type: 'reacao', default: 1 },
  { label: 'Flight',     max:  3, color: 'blue',    type: 'reacao', default: 1 },
  { label: 'Blind',      max:  3, color: 'indigo',  type: 'reacao', default: 1 },
  { label: 'Phantasm',   max:  3, color: 'purple',  type: 'reacao', default: 1 },
]

// ── ConditionShortcutsPanel ───────────────────────────────────────────────────

function ConditionShortcutsPanel({ actors, actorStates, onChange }: {
  actors:      { key: string; title: string }[]
  actorStates: Record<string, ActorState>
  onChange:    (key: string, s: ActorState) => void
}) {
  const [open,       setOpen]       = useState(false)
  const [selected,   setSelected]   = useState<string | null>(null)
  const [targetKey,  setTargetKey]  = useState<string>('')
  const [amount,     setAmount]     = useState(1)
  const [filterType, setFilterType] = useState<'all' | 'ferimento' | 'acumulacao' | 'reacao'>('all')

  const cond = CONDITION_SHORTCUTS.find(c => c.label === selected)

  const applyCondition = (key: string) => {
    if (!cond) return
    const aState = actorStates[key]
    if (!aState) return
    const existing = aState.conditions.find(c => c.label === cond.label)
    const newConditions = existing
      ? aState.conditions.map(c =>
          c.label === cond.label
            ? { ...c, filled: Math.min(c.max, c.filled + amount) }
            : c
        )
      : [...aState.conditions, {
          id: `cond-${cond.label.toLowerCase()}-${Date.now().toString(36)}-${key}`,
          label: cond.label, filled: Math.min(cond.max, amount),
          max: cond.max, color: cond.color,
        }]
    onChange(key, { ...aState, conditions: newConditions })
  }

  const TYPE_LABELS = { ferimento: 'Ferimento', acumulacao: 'Acumulação', reacao: 'Reação' }
  const filtered = filterType === 'all' ? CONDITION_SHORTCUTS : CONDITION_SHORTCUTS.filter(c => c.type === filterType)

  return (
    <div style={{ margin: '12px 0', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      overflow: 'hidden', background: 'var(--paper)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        background: 'var(--paper-deep)', cursor: 'pointer',
        borderBottom: open ? '1px solid var(--line-soft)' : 'none' }}
        onClick={() => setOpen(p => !p)}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>⚡</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase',
          letterSpacing: '-0.01em', flex: 1 }}>Atalhos de Condição</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
          {CONDITION_SHORTCUTS.length} condições
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink-mute)',
          transition: 'transform 0.2s', display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>

      {open && (
        <div style={{ padding: '14px 16px' }}>

          {/* Filtro por tipo */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            {(['all', 'ferimento', 'acumulacao', 'reacao'] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                style={{ padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  border: `1px solid ${filterType === t ? 'var(--ink)' : 'var(--line)'}`,
                  background: filterType === t ? 'var(--ink)' : 'transparent',
                  color: filterType === t ? 'var(--paper)' : 'var(--ink-mute)' }}>
                {t === 'all' ? 'Todas' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Grid de condições */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {filtered.map(c => (
              <button key={c.label}
                onClick={() => {
                  setSelected(c.label === selected ? null : c.label)
                  setAmount(c.default)
                  setTargetKey(actors[0]?.key ?? '')
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', fontWeight: 700,
                  border: `1.5px solid ${selected === c.label ? `var(--${c.color})` : 'var(--line)'}`,
                  background: selected === c.label ? `var(--${c.color})` : 'transparent',
                  color: selected === c.label ? '#f6f2e9' : 'var(--ink-soft)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: selected === c.label ? '#f6f2e9' : `var(--${c.color})` }} />
                {c.label}
                <span style={{ opacity: 0.6, fontSize: 9 }}>/{c.max}</span>
              </button>
            ))}
          </div>

          {/* Configuração da aplicação */}
          {selected && cond && (
            <div style={{ padding: '12px 14px', background: 'var(--paper-deep)',
              border: `1px solid var(--${cond.color})`, borderRadius: 10 }}>

              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, textTransform: 'uppercase',
                marginBottom: 12, color: `var(--${cond.color})` }}>
                {cond.label}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, marginLeft: 8,
                  color: 'var(--ink-mute)', textTransform: 'none', letterSpacing: '0.06em' }}>
                  {TYPE_LABELS[cond.type]} · máx {cond.max}
                </span>
              </div>

              {/* Cargas */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--ink-mute)', minWidth: 56 }}>Cargas</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {Array.from({ length: cond.max }, (_, i) => i + 1).map(v => (
                    <button key={v} onClick={() => setAmount(v)}
                      style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${amount === v ? `var(--${cond.color})` : 'var(--line)'}`,
                        background: amount === v ? `var(--${cond.color})` : 'transparent',
                        color: amount === v ? '#f6f2e9' : 'var(--ink-soft)' }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alvo + ações */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={targetKey} onChange={e => setTargetKey(e.target.value)}
                  style={{ flex: 1, minWidth: 120, border: '1px solid var(--line)', borderRadius: 8,
                    padding: '6px 10px', fontFamily: 'var(--font-body)', fontSize: 13,
                    background: 'var(--paper)', color: 'var(--ink)' }}>
                  {actors.map(a => (
                    <option key={a.key} value={a.key}>{a.title}</option>
                  ))}
                </select>
                <button onClick={() => { applyCondition(targetKey); setSelected(null) }}
                  style={{ padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                    background: `var(--${cond.color})`, color: '#f6f2e9', border: 'none',
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                  Aplicar
                </button>
                {actors.length > 1 && (
                  <button onClick={() => { actors.forEach(a => applyCondition(a.key)); setSelected(null) }}
                    style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                      background: 'transparent', border: `1px solid var(--${cond.color})`,
                      color: `var(--${cond.color})`,
                      fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                    Todos
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ClimaPanel({ climaId, onChange }: {
  climaId: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const active = CLIMAS.find(c => c.id === climaId) ?? null

  return (
    <div style={{ margin: '12px 0', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      overflow: 'hidden', background: 'var(--paper)' }}>

      {/* Header — clima ativo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        background: 'var(--paper-deep)', cursor: 'pointer',
        borderBottom: open ? '1px solid var(--line-soft)' : 'none' }}
        onClick={() => setOpen(p => !p)}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
          {active?.icon ?? '—'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase',
            letterSpacing: '-0.01em' }}>
            {active?.name ?? 'Sem clima definido'}
          </span>
          {active && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--ink-mute)', marginLeft: 10 }}>
              {active.type}
            </span>
          )}
        </div>

        {/* Tags resumidas quando fechado */}
        {active && !open && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
            {active.effects.filter(e => e.tag !== 'Neutro').map((e, i) => (
              <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '1px 7px', borderRadius: 999,
                background: 'var(--paper)', color: `var(--${e.color})`,
                border: `1px solid var(--${e.color})` }}>
                {e.tag}
              </span>
            ))}
          </div>
        )}

        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink-mute)',
          transition: 'transform 0.2s', display: 'inline-block', flexShrink: 0,
          transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>

      {/* Efeitos detalhados */}
      {open && active && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-soft)',
          display: 'flex', flexDirection: 'column', gap: 8 }}>
          {active.effects.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: `var(--${e.color})`, flexShrink: 0, minWidth: 110 }}>
                {e.tag}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                {e.desc}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Seletor */}
      {open && (
        <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button onClick={() => { onChange(null); setOpen(false) }}
            style={{ padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              border: `1.5px solid ${climaId === null ? 'var(--ink)' : 'var(--line)'}`,
              background: climaId === null ? 'var(--ink)' : 'transparent',
              color: climaId === null ? 'var(--paper)' : 'var(--ink-mute)' }}>
            — Sem clima
          </button>
          {CLIMAS.map(c => (
            <button key={c.id} onClick={() => { onChange(c.id); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                border: `1.5px solid ${climaId === c.id ? `var(--${c.color})` : 'var(--line)'}`,
                background: climaId === c.id ? `var(--${c.color})` : 'transparent',
                color: climaId === c.id ? '#f6f2e9' : 'var(--ink-soft)' }}>
              <span style={{ fontSize: 14 }}>{c.icon}</span>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Painel de Relógios ────────────────────────────────────────────────────────

function ClocksPanel({ clocks, actors, onChange }: {
  clocks: Clock[]
  actors: { key: string; title: string }[]
  onChange: (clocks: Clock[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', actorKey: actors[0]?.key ?? '', color: 'coral' })

  const addClock = () => {
    if (!form.name.trim()) return
    const c: Clock = {
      id: `clk-${Date.now().toString(36)}`,
      name: form.name.trim(),
      actorKey: form.actorKey,
      filled: 0,
      color: form.color,
    }
    onChange([...clocks, c])
    setForm({ name: '', actorKey: actors[0]?.key ?? '', color: 'coral' })
    setShowAdd(false)
  }

  const updateFilled = (id: string, filled: number) =>
    onChange(clocks.map(c => c.id === id ? { ...c, filled } : c))
  const removeClock = (id: string) =>
    onChange(clocks.filter(c => c.id !== id))

  if (clocks.length === 0 && !showAdd) {
    return (
      <div style={{ marginTop: 12 }}>
        <button onClick={() => setShowAdd(true)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
            textTransform: 'uppercase', background: 'transparent', border: '1px dashed var(--line)',
            borderRadius: 8, padding: '8px 16px', cursor: 'pointer', color: 'var(--ink-mute)', width: '100%' }}>
          + Novo Relógio
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--paper-deep)',
      border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
          Relógios ({clocks.length})
        </span>
        <button onClick={() => setShowAdd(p => !p)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--line)',
            borderRadius: 999, padding: '3px 10px', cursor: 'pointer', color: 'var(--ink-mute)' }}>
          {showAdd ? '− fechar' : '+ novo relógio'}
        </button>
      </div>

      {showAdd && (
        <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--paper)',
          border: '1px solid var(--line)', borderRadius: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 120 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', marginBottom: 3 }}>Nome</div>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Relógio de Burn" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 6,
                padding: '5px 8px', fontFamily: 'var(--font-body)', fontSize: 12, background: 'var(--paper)' }} />
          </div>
          <div style={{ flex: 2, minWidth: 120 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', marginBottom: 3 }}>Personagem</div>
            <select value={form.actorKey} onChange={e => setForm(p => ({ ...p, actorKey: e.target.value }))}
              style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 8px',
                fontFamily: 'var(--font-body)', fontSize: 12, background: 'var(--paper)' }}>
              <option value="">— geral —</option>
              {actors.map(a => <option key={a.key} value={a.key}>{a.title}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', marginBottom: 3 }}>Cor</div>
            <select value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
              style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'var(--paper)' }}>
              {['coral','orange','blue','purple','green','teal','gold','indigo'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button onClick={addClock}
            style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid var(--ink)',
              background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-body)',
              fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            Criar
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {clocks.map(c => {
          const owner = actors.find(a => a.key === c.actorKey)
          return (
            <div key={c.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, textTransform: 'uppercase', flex: 1 }}>{c.name}</span>
                {owner && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)' }}>{owner.title}</span>}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: `var(--${c.color})` }}>
                  {c.filled}/10
                </span>
                <button onClick={() => removeClock(c.id)}
                  style={{ ...btnStyle, color: 'var(--coral)', borderColor: 'var(--coral)', fontSize: 12 }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i}
                    onClick={() => updateFilled(c.id, i < c.filled ? i : i + 1)}
                    style={{ flex: 1, height: 18, borderRadius: 4, cursor: 'pointer',
                      background: i < c.filled
                        ? (c.filled >= 10 ? 'var(--coral)' : `var(--${c.color})`)
                        : 'var(--line-soft)',
                      border: `1px solid ${c.filled >= 10 ? 'var(--coral)' : `var(--${c.color})`}`,
                      opacity: i < c.filled ? 1 : 0.35, transition: 'background 0.1s' }} />
                ))}
              </div>
              {c.filled >= 10 && (
                <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 9,
                  letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
                  color: 'var(--coral)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--coral)', animation: 'none' }} />
                  Estourou — efeitos ativos por 3 rounds
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PalcoView ─────────────────────────────────────────────────────────────────

function PalcoView({ stage, state, onUpdate, onBack }: {
  stage: Stage; state: AppState; onUpdate: (s: AppState) => void; onBack: () => void
}) {
  const [open, setOpen]             = useState<SheetSubject | null>(null)
  const [openSide, setOpenSide]     = useState<'allies'|'enemies'>('allies')
  const [pickerSide, setPickerSide] = useState<'allies'|'enemies'|null>(null)

  // Quando o usuário abre uma ficha, guarda de qual lado o ator está
  const openSheet = (subject: SheetSubject, side: 'allies'|'enemies') => {
    setOpen(subject)
    setOpenSide(side)
  }

  const rt = getRuntime(stage)

  const mutateStage = useCallback((fn: (s: Stage) => Stage) => {
    onUpdate({ ...state, stages: state.stages.map(s => s.id === stage.id ? fn(s) : s) })
  }, [state, stage.id, onUpdate])

  // Invoca um token no palco, no mesmo lado do tamer que usou a skill
  const spawnToken = useCallback((token: TokenSpawn) => {
    const tokenId = `token-${token.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`
    mutateStage(s => {
      const newRefs: ActorRef[] = Array.from({ length: token.qty }, (_, i) => ({
        kind: 'wild' as const,
        id: i === 0 ? tokenId : `${tokenId}-${i}`,
      }))
      const tokenState: ActorState = { hp: 0, hp_max: 0, defesa: 0, defesa_base: 0, armadura: 0, conditions: [] }
      const newStates: Record<string, ActorState> = {}
      newRefs.forEach(r => { newStates[actorKey(r)] = { ...tokenState } })
      return {
        ...s,
        sides: { ...s.sides, [openSide]: [...s.sides[openSide], ...newRefs] },
        actorStates: { ...(s as any).actorStates, ...newStates },
        tokenMeta: {
          ...(s as any).tokenMeta ?? {},
          ...Object.fromEntries(newRefs.map(r => [r.id, { name: token.name, level: token.level }])),
        },
      } as Stage
    })
    setOpen(null)
  }, [mutateStage, openSide])

  // Garante que todo ator tenha um ActorState inicializado
  const ensureActorState = useCallback((actors: ActorRef[], stateObj: typeof rt) => {
    let changed = false
    const newActorStates = { ...stateObj.actorStates }
    for (const a of actors) {
      const k = actorKey(a)
      if (!newActorStates[k]) {
        changed = true
        let hp = 0, def = 0, arm = 0
        if (a.kind === 'human') {
          const t = findTamer(state, a.id)
          hp  = t?.status.HP.max ?? t?.status.HP.v ?? 0
          def = 0   // tamers não têm defesa de base; Eisuke ganha via skill
        } else if (a.kind === 'pair') {
          const d = findDigimon(state, a.digimonId)
          const s = d?.stages[a.stage ?? 0]
          hp  = s?.status.HP      ?? 0
          def = s?.status.Defesa  ?? 0
          arm = s?.status.Armadura ?? 0
        } else if (a.kind === 'wild') {
          const d = findDigimon(state, a.id)
          const s = d?.stages[0]
          hp  = s?.status.HP      ?? 0
          def = s?.status.Defesa  ?? 0
          arm = s?.status.Armadura ?? 0
        } else if (a.kind === 'bug') {
          const b = findBug(state, a.id)
          hp  = b?.status.HP      ?? 0
          def = b?.status.Defesa  ?? 0
          arm = b?.status.Armadura ?? 0
        }
        newActorStates[k] = { hp, hp_max: hp, defesa: def, defesa_base: def, armadura: arm, conditions: [] }
      }
    }
    return changed ? { ...stateObj, actorStates: newActorStates } : stateObj
  }, [state])

  const allActors = [...stage.sides.allies, ...stage.sides.enemies]

  // Inicializa novos atores quando são adicionados
  React.useEffect(() => {
    const newRt = ensureActorState(allActors, rt)
    if (newRt !== rt) {
      mutateStage(s => ({ ...s, ...newRt } as Stage))
    }
  }, [allActors.length]) // eslint-disable-line

  const updateActorState = (key: string, newState: ActorState) => {
    mutateStage(s => ({
      ...s,
      actorStates: { ...(s as any).actorStates, [key]: newState },
    } as Stage))
  }

  // Evolui um Digimon no palco: troca stage no ActorRef e reinicia ActorState
  const evolveActor = (side: 'allies'|'enemies', idx: number, newStageIdx: number) => {
    const actor = stage.sides[side][idx]
    if (actor.kind !== 'pair') return
    const d = findDigimon(state, actor.digimonId)
    const newS = d?.stages[newStageIdx]
    if (!newS) return

    const oldKey = actorKey(actor)
    const newActor: ActorRef = { ...actor, stage: newStageIdx }
    const newKey  = actorKey(newActor)

    // Inicializa ActorState do novo estágio com HP/DEF/ARM corretos
    const newActorState: ActorState = {
      hp:          newS.status.HP,
      hp_max:      newS.status.HP,
      defesa:      newS.status.Defesa,
      defesa_base: newS.status.Defesa,
      armadura:    newS.status.Armadura,
      conditions:  [],
    }

    mutateStage(s => {
      const newSides = {
        ...s.sides,
        [side]: s.sides[side].map((a, i) => i === idx ? newActor : a),
      }
      const prevStates = (s as any).actorStates ?? {}
      // Remove o estado antigo, insere o novo
      const { [oldKey]: _removed, ...rest } = prevStates
      const newActorStates = { ...rest, [newKey]: newActorState }
      return { ...s, sides: newSides, actorStates: newActorStates } as Stage
    })
  }

  const addActor = (side: 'allies'|'enemies', a: ActorRef, qty = 1) => {
    // Pair = tamer + digimon separados. Para qty > 1 de um pair, só o digimon se multiplica.
    if (a.kind === 'pair') {
      const tamerRef: ActorRef = { kind: 'human', id: a.tamerId }
      // Só adiciona o tamer se ainda não estiver na cena neste lado
      const alreadyHasTamer = stage.sides[side].some(
        x => x.kind === 'human' && x.id === a.tamerId
      )
      const digiRefs: ActorRef[] = Array.from({ length: qty }, () => ({ ...a }))
      mutateStage(s => ({
        ...s,
        sides: {
          ...s.sides,
          [side]: [
            ...s.sides[side],
            ...(alreadyHasTamer ? [] : [tamerRef]),
            ...digiRefs,
          ],
        },
      }))
    } else {
      const toAdd: ActorRef[] = Array.from({ length: qty }, () => ({ ...a }))
      mutateStage(s => ({ ...s, sides: { ...s.sides, [side]: [...s.sides[side], ...toAdd] } }))
    }
    setPickerSide(null)
  }

  const removeActor = (side: 'allies'|'enemies', idx: number) =>
    mutateStage(s => ({ ...s, sides: { ...s.sides, [side]: s.sides[side].filter((_,i)=>i!==idx) } }))

  const addAllPCs = () => {
    const PC_IDS = ['t-naoki', 't-eisuke', 't-miki', 't-yuri', 't-sachi', 't-mori']
    const alreadyTamers = new Set(
      stage.sides.allies
        .filter(a => a.kind === 'human')
        .map(a => (a as any).id)
    )
    const alreadyDigis = new Set(
      stage.sides.allies
        .filter(a => a.kind === 'pair')
        .map(a => (a as any).digimonId)
    )
    const toAdd: ActorRef[] = []
    for (const tid of PC_IDS) {
      const t = state.tamers.find(x => x.id === tid)
      if (!t) continue
      if (!alreadyTamers.has(tid)) toAdd.push({ kind: 'human', id: tid })
      if (t.digimonId) {
        const d = state.bestiary.find(x => x.id === t.digimonId)
        if (d && !alreadyDigis.has(d.id)) {
          toAdd.push({ kind: 'pair', tamerId: tid, digimonId: d.id, stage: d.currentStage })
        }
      }
    }
    if (toAdd.length === 0) return
    mutateStage(s => ({ ...s, sides: { ...s.sides, allies: [...s.sides.allies, ...toAdd] } }))
  }

  const domainTamers = useMemo(() => getDomainTamers(stage, state), [stage, state])

  const actorList = useMemo(() =>
    allActors.map(a => {
      const r = resolveActor(state, a, rt.tokenMeta)
      const tamerName = a.kind === 'pair'
        ? findTamer(state, a.tamerId)?.name
        : null
      const label = tamerName ? `${r.title} (${tamerName})` : r.title
      return { key: actorKey(a), title: label }
    }),
    [allActors, state]
  )

  const exportStage = () => {
    const blob = new Blob([JSON.stringify(stage, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `palco-${stage.title.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]/g,'')}-${new Date().toISOString().slice(0,10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const importStage = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const imported = JSON.parse(e.target?.result as string) as Stage
          mutateStage(() => ({ ...imported, id: stage.id }))
        } catch { alert('Arquivo inválido.') }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className={styles.palco}>
      <button className={styles.backLink} onClick={onBack}>← voltar aos palcos</button>

      <div className={styles.palcoHead}>
        <div style={{ flex:1 }}>
          <h2 className={styles.palcoTitle}>
            <input className={styles.editInput} value={stage.title} onChange={e => mutateStage(s=>({...s,title:e.target.value}))} />
          </h2>
          <div className={styles.palcoSub}>
            ~ <input className={styles.editInput} style={{fontStyle:'italic',maxWidth:480}} value={stage.subtitle ?? ''}
                placeholder="adicione uma deixa..." onChange={e => mutateStage(s=>({...s,subtitle:e.target.value}))} /> ~
          </div>
        </div>
        {/* Contador de Round */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0,
          padding:'8px 16px', background:'var(--paper-deep)', border:'1px solid var(--line)',
          borderRadius:'var(--radius)', fontFamily:'var(--font-mono)' }}>
          <button onClick={() => mutateStage(s => ({ ...s, roundCurrent: Math.max(0, (rt.roundCurrent) - 1) } as Stage))}
            style={btnStyle}>−</button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--ink-mute)' }}>Round</div>
            <div style={{ fontSize:22, fontWeight:700, lineHeight:1 }}>{rt.roundCurrent}</div>
          </div>
          <button onClick={() => mutateStage(s => {
            // Avança round e restaura Defesa de todos os atores para o valor base
            const states = (s as any).actorStates ?? {}
            const newActorStates: Record<string, ActorState> = {}
            Object.entries(states).forEach(([k, v]) => {
              const a = v as ActorState
              newActorStates[k] = { ...a, defesa: a.defesa_base ?? 0 }
            })
            return { ...s, roundCurrent: ((s as any).roundCurrent ?? 0) + 1, actorStates: newActorStates } as Stage
          })}
            style={{ ...btnStyle, borderColor:'var(--ink)', color:'var(--ink)' }}>+</button>
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
          <button className={styles.btnGhost} onClick={addAllPCs}>+ Adicionar PCs</button>
          <button className={styles.btnGhost} onClick={exportStage}>↓ Exportar</button>
          <button className={styles.btnGhost} onClick={importStage}>↑ Importar</button>
        </div>
      </div>

      <DomainPanel domainTamers={domainTamers} />

      <ClimaPanel
        climaId={rt.clima}
        onChange={id => mutateStage(s => ({ ...s, clima: id } as Stage))}
      />

      <ConditionShortcutsPanel
        actors={actorList}
        actorStates={rt.actorStates}
        onChange={(key, newSt) => updateActorState(key, newSt)}
      />

      <div className={styles.board}>
        {(['allies','enemies'] as const).map(side => (
          <div key={side} className={`${styles.side} ${side==='allies'?styles.allies:styles.enemies}`}>
            <h3 className={styles.sideTitle}>
              {side==='allies'?'Aliados':'Inimigos'}
              <small>{stage.sides[side].length} em cena</small>
            </h3>
            <div className={styles.actorsGrid}>
              {stage.sides[side].map((a,i) => (
                <ActorChip key={`${actorKey(a)}-${i}`} actor={a} state={state}
                  actorSt={rt.actorStates[actorKey(a)]}
                  tokenMeta={rt.tokenMeta}
                  onOpen={() => { openSheet(resolveActor(state,a,rt.tokenMeta).subject, side) }}
                  onRemove={() => removeActor(side,i)}
                  onChange={newSt => updateActorState(actorKey(a), newSt)}
                  onEvolve={a.kind === 'pair' ? (newIdx) => evolveActor(side, i, newIdx) : undefined}
                  onSpawnToken={spawnToken} />
              ))}
              <div className={styles.addActor} onClick={() => setPickerSide(side)}>+ adicionar ator</div>
            </div>
          </div>
        ))}
      </div>

      {/* Relógios */}
      <ClocksPanel
        clocks={rt.clocks}
        actors={actorList}
        onChange={clocks => mutateStage(s => ({ ...s, clocks } as Stage))} />

      <div className={styles.notes}>
        <label className={styles.notesLabel}>Notas do palco</label>
        <textarea className={styles.notesArea} value={stage.notes ?? ''} placeholder="Domínios ativos, modificadores de terreno..."
          onChange={e => mutateStage(s=>({...s,notes:e.target.value}))} />
      </div>

      {pickerSide && <Picker state={state} onPick={(a, qty) => addActor(pickerSide, a, qty)} onClose={() => setPickerSide(null)} />}
      {open && <SheetModal subject={open} state={state} onSaveState={onUpdate} onClose={() => setOpen(null)} onSpawnToken={spawnToken} />}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TeatroPage({ state, onUpdate }: Props) {
  const [openStage, setOpenStage] = useState<string|null>(null)
  const stage = openStage ? state.stages.find(s => s.id === openStage) ?? null : null

  const newStage = () => {
    const s = makeStage(`stage-${Date.now().toString(36)}`)
    onUpdate({ ...state, stages: [...state.stages, s] })
    setOpenStage(s.id)
  }
  const deleteStage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Apagar este palco?')) return
    onUpdate({ ...state, stages: state.stages.filter(s => s.id !== id) })
  }

  if (stage) return <PalcoView stage={stage} state={state} onUpdate={onUpdate} onBack={() => setOpenStage(null)} />

  return (
    <div>
      <PageHead title="Teatro" tag="crie o palco, chame os atores" />
      <div className={styles.index}>
        <div className={`${styles.stageCard} ${styles.newCard}`} onClick={newStage}>
          <span className={styles.plus}>Abrir novo palco</span>
        </div>
        {[...state.stages].reverse().map(s => {
          const rt = getRuntime(s)
          return (
            <div key={s.id} className={styles.stageCard} onClick={() => setOpenStage(s.id)}>
              <button className={styles.delCard} onClick={e => deleteStage(s.id,e)}>×</button>
              <h3 className={styles.stageTitle}>{s.title}</h3>
              <div className={styles.stageSub}>~ {s.subtitle || 'sem subtítulo'} ~</div>
              <div className={styles.stageCounts}>
                <span>Aliados: {s.sides.allies.length}</span>
                <span>Inimigos: {s.sides.enemies.length}</span>
                {rt.roundCurrent > 0 && <span>Round {rt.roundCurrent}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}