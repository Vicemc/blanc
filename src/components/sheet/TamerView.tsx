import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type {
  AppState, Tamer, DigimonLine, AttributeKey, SkillSet, TamerSkill,
} from '../../types'
import { PORTRAIT_LIST } from '../../types'
import { calcTamerDerived, makeSlimLine, buySkillTreeSkill } from '../../data/store'
import { GrainFill } from '../GrainFill'
import { Toast } from '../Toast'
import { supabase } from '../../lib/supabase'
import styles from '../Sheet.module.css'
import {
  StatRow, AttributeGrid, SkillGrid, SkillCard, AddSkillForm,
  SectionTitle, XpConfirmBar, inp,
} from './shared/components'
import { pendingCost, AFFINITY_ICONS } from './shared/utils'
import type { TokenSpawn, StatEntry } from './shared/types'

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
  const domainGroups = Array.from(new Set(
    tamer.tamerSkills
      .map(s => s.keyword)
      .filter(k => k.includes('Domain of'))
  ))

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

// ── SkillTreeSection ───────────────────────────────────────────────
// Mostra as fases de Skill Tree do tamer. GM pode adicionar e desbloquear fases;
// player pode comprar skills disponíveis (3 XP cada).
function SkillTreeSection({ tamer, state, onSave: _onSave, onSaveState, msg }: {
  tamer: Tamer
  state?: AppState
  onSave: (t: Tamer) => void
  onSaveState?: (s: AppState) => void
  msg: (m: string) => void
}) {
  const [showAddPhase, setShowAddPhase]   = useState(false)
  const [newPhaseLabel, setNewPhaseLabel] = useState('')
  const [addingSkillTo, setAddingSkillTo] = useState<string | null>(null)

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

// Histórico de compras/concessões de XP (colapsável).
function XpLogSection({ log }: { log: import('../../types').XpLogEntry[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ margin: '4px 0 12px' }}>
      <button className={styles.btnGhost} style={{ fontSize: 11 }} onClick={() => setOpen(o => !o)}>
        {open ? '✕ Ocultar histórico de XP' : `🕮 Histórico de XP (${log.length})`}
      </button>
      {open && (
        <div style={{ marginTop: 8, border: '1px solid var(--line-soft)', borderRadius: 8, overflow: 'hidden' }}>
          {log.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
              padding: '6px 12px', borderBottom: '1px solid var(--line-soft)',
              fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <span style={{ color: 'var(--ink-soft)' }}>{e.label}</span>
              <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                <span style={{ color: e.cost < 0 ? 'var(--coral)' : 'var(--green)', fontWeight: 700 }}>
                  {e.cost > 0 ? `+${e.cost}` : e.cost} XP
                </span>
                <span style={{ color: 'var(--ink-mute)' }}>{new Date(e.ts).toLocaleDateString('pt-BR')}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TamerView ──────────────────────────────────────────────────────
export function TamerView({ tamer, line, editable, isGM, onSave, onSaveLine: _onSaveLine, onSaveAll, state, onSaveState, onSpawnToken, wide = false }: {
  tamer: Tamer; line?: DigimonLine; editable: boolean; isGM?: boolean
  onSave: (t: Tamer) => void; onSaveLine?: (l: DigimonLine) => void
  onSaveAll?: (autoridade: number) => void
  state?: AppState; onSaveState?: (s: AppState) => void
  onSpawnToken?: (token: TokenSpawn) => void; wide?: boolean
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
    // Registra no histórico de XP
    const parts: string[] = []
    for (const [k, delta] of Object.entries(pendAttr)) if (delta > 0) parts.push(`${k} +${delta}`)
    for (const [name, delta] of Object.entries(pendSkill)) if (delta > 0) parts.push(`${name} +${delta}`)
    if (parts.length) {
      const entry = { id: `xp-${Date.now().toString(36)}`, ts: Date.now(), label: parts.join(', '), cost: -pendCost }
      t = { ...t, xpLog: [entry, ...(t.xpLog ?? [])].slice(0, 50) }
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

  {/* ── Coluna esquerda (status + atributos) ─── */}
  const leftCol = (
    <>
      <StatRow entries={statusEntries} />

      {editable && freeMode && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:12, padding:'8px 0 4px',
          fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)' }}>
          {([
            ['HP máx',  maxHP,      (d: number) => onSave({ ...tamer, status: { ...tamer.status, hpMaxBonus:      (tamer.status.hpMaxBonus       ?? 0) + d } })],
            ['DS máx',  maxDigisoul,(d: number) => onSave({ ...tamer, status: { ...tamer.status, digisoulMaxBonus: (tamer.status.digisoulMaxBonus  ?? 0) + d } })],
            ['Mem máx', tamer.status.Memory.max, (d: number) => onSave({ ...tamer, status: { ...tamer.status, Memory: { ...tamer.status.Memory, max: tamer.status.Memory.max + d } } })],
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

      {hasPending && (
        <XpConfirmBar cost={pendCost} xpAvail={tamer.xp} onConfirm={confirmXp} onCancel={cancelXp} />
      )}

      {editable && (tamer.xpLog?.length ?? 0) > 0 && <XpLogSection log={tamer.xpLog!} />}

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
    </>
  )

  const skillsSection = (
    <>
      <SectionTitle>Skills</SectionTitle>
      <SkillGrid skills={tamer.skills} editable={editable} freeMode={freeMode}
        pending={pendSkill} onPend={pendSkillUp} onUnpend={pendSkillDown}
        onFreeEdit={(cat, name, delta) => {
          const cur = tamer.skills[cat][name] ?? 0
          const nv  = Math.max(0, Math.min(5, cur + delta))
          onSave({ ...tamer, skills: { ...tamer.skills, [cat]: { ...tamer.skills[cat], [name]: nv } } })
        }} />
    </>
  )

  {/* ── Coluna direita (tamer skills + parceiro + skill tree) ─── */}
  const rightCol = (
    <>
      <SectionTitle action={editable && !showAdd && (
        <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setShowAdd(true)}>+ Nova Skill</button>
      )}>Tamer Skills</SectionTitle>
      <TamerSkillsWithDomainTabs
        tamer={tamer} editable={editable}
        passiveToggles={passiveToggles} setPassiveToggles={setPassiveToggles}
        onSave={onSave} msg={msg} onSpawnToken={onSpawnToken}
      />
      {showAdd && <AddSkillForm isTamer onAdd={sk => { onSave({ ...tamer, tamerSkills: [...tamer.tamerSkills, sk as TamerSkill] }); setShowAdd(false); msg('Skill adicionada!') }} onCancel={() => setShowAdd(false)} />}

      {editable && isGM && state && onSaveState && (
        <>
          <SectionTitle>Digimon Parceiro</SectionTitle>
          {!line ? (
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
          ) : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 16px', background:'var(--paper-deep)',
              border:'1px solid var(--line-soft)', borderRadius:8, marginBottom:16 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:13 }}>{line.name}</span>
              <button className={styles.btnGhost}
                style={{ color:'var(--coral)', borderColor:'var(--coral)', fontSize:11 }}
                onClick={() => {
                  if (!confirm(`Desvincular "${line.name}" de ${tamer.name} e apagar a linha do bestiário?`)) return
                  onSaveState({
                    ...state,
                    bestiary: state.bestiary.filter(l => l.id !== line.id),
                    tamers: state.tamers.map(t => t.id === tamer.id ? { ...t, digimonId: null } : t)
                  })
                }}>× Desvincular e apagar</button>
            </div>
          )}
        </>
      )}

      {/* Skill Tree — fases liberadas pelo GM */}
      <SkillTreeSection tamer={tamer} state={state} onSave={onSave} onSaveState={onSaveState} msg={msg} />
    </>
  )

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
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
      {wide ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 48px', alignItems:'start' }}>
          <div>{leftCol}{skillsSection}</div>
          <div>{rightCol}</div>
        </div>
      ) : (
        <>
          {leftCol}
          {skillsSection}
          {rightCol}
        </>
      )}
    </div>
  )
}

// ── Inventário do Digivice (aba da ficha) ──────────────────────────

interface DigiviceItem {
  id:          string
  name:        string
  type:        'item' | 'weapon' | 'accessory' | 'key'
  description: string
  quantity:    number
  effects:     string
  gm_only:     boolean
}

const TYPE_LABEL: Record<string, string> = {
  item: 'Item', weapon: 'Arma', accessory: 'Acessório', key: 'Chave',
}
const TYPE_COLOR_INV: Record<string, string> = {
  item: 'var(--ink-mute)', weapon: 'var(--coral)', accessory: 'var(--teal)', key: 'var(--gold)',
}

const ITEM_EMPTY: Omit<DigiviceItem,'id'> = { name:'', type:'item', description:'', quantity:1, effects:'', gm_only:false }

export function DigiviceInventoryTab({ tamerId, editable: _editable, isGM }: {
  tamerId: string; editable: boolean; isGM: boolean
}) {
  const [items,     setItems]     = useState<DigiviceItem[]>([])
  const [dvId,      setDvId]      = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [adding,    setAdding]    = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DigiviceItem | null>(null)
  const [draft,     setDraft]     = useState<Omit<DigiviceItem,'id'>>(ITEM_EMPTY)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.from('digivices').select('id, inventory').eq('character_id', tamerId).maybeSingle()
      .then(({ data }) => {
        if (data) { setDvId(data.id); setItems(data.inventory ?? []) }
        setLoading(false)
      })
  }, [tamerId])

  const persist = async (newItems: DigiviceItem[]) => {
    setItems(newItems)
    if (!supabase || !dvId) return
    await supabase.from('digivices').update({ inventory: newItems }).eq('id', dvId)
  }

  const addItem = () => {
    if (!draft.name.trim()) return
    persist([...items, { ...draft, id: `item-${Date.now().toString(36)}`, name: draft.name.trim() }])
    setDraft(ITEM_EMPTY); setAdding(false)
  }
  const removeItem  = (id: string) => persist(items.filter(i => i.id !== id))
  const updateQty   = (id: string, delta: number) =>
    persist(items.map(i => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
  const startEdit   = (item: DigiviceItem) => { setEditDraft({ ...item }); setEditingId(item.id); setAdding(false) }
  const confirmEdit = () => {
    if (!editDraft?.name.trim()) return
    persist(items.map(i => i.id === editingId ? editDraft : i))
    setEditingId(null); setEditDraft(null)
  }

  const visible = isGM ? items : items.filter(i => !i.gm_only)

  const invInputStyle: React.CSSProperties = {
    border:'1px solid var(--line)', borderRadius:8, padding:'7px 10px',
    fontFamily:'var(--font-body)', fontSize:13, background:'var(--paper)', color:'var(--ink)',
  }
  const invBtnStyle: React.CSSProperties = {
    display:'inline-flex', alignItems:'center', padding:'7px 16px', borderRadius:999,
    border:'1px solid var(--line)', background:'var(--paper)', color:'var(--ink-soft)',
    fontFamily:'var(--font-body)', fontSize:13, cursor:'pointer',
  }
  const miniBtn: React.CSSProperties = {
    width:26, height:26, borderRadius:'50%', border:'1px solid var(--line)',
    background:'transparent', cursor:'pointer', fontSize:14, fontFamily:'var(--font-mono)',
    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
    color:'var(--ink)',
  }

  if (loading) return <div style={{ padding:'24px 0', textAlign:'center', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)' }}>Carregando...</div>

  if (!dvId) return <div style={{ padding:'24px 0', textAlign:'center', fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:15, color:'var(--ink-mute)' }}>~ Digivice não encontrado ~</div>

  const formBlock = (d: Omit<DigiviceItem,'id'>, set: React.Dispatch<React.SetStateAction<any>>, onConfirm: () => void, onCancel: () => void) => (
    <div style={{ border:'1px solid var(--line)', borderRadius:10, padding:'16px', background:'var(--paper-deep)', marginBottom:8 }}>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 80px', gap:8, marginBottom:8 }}>
        <input value={d.name} onChange={e => set((p: any) => ({ ...p, name: e.target.value }))}
          placeholder="Nome do item *" style={{ ...invInputStyle, width:'100%' }} />
        <select value={d.type} onChange={e => set((p: any) => ({ ...p, type: e.target.value }))} style={{ ...invInputStyle, width:'100%' }}>
          <option value="item">Item</option>
          <option value="weapon">Arma</option>
          <option value="accessory">Acessório</option>
          <option value="key">Chave</option>
        </select>
        <input type="number" min={0} value={d.quantity}
          onChange={e => set((p: any) => ({ ...p, quantity: parseInt(e.target.value)||0 }))}
          style={{ ...invInputStyle, width:'100%' }} />
      </div>
      <input value={d.description} onChange={e => set((p: any) => ({ ...p, description: e.target.value }))}
        placeholder="Descrição" style={{ ...invInputStyle, width:'100%', marginBottom:8 }} />
      <input value={d.effects} onChange={e => set((p: any) => ({ ...p, effects: e.target.value }))}
        placeholder="Efeitos" style={{ ...invInputStyle, width:'100%', marginBottom:8 }} />
      <label style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)', letterSpacing:'0.08em', marginBottom:12, cursor:'pointer' }}>
        <input type="checkbox" checked={d.gm_only} onChange={e => set((p: any) => ({ ...p, gm_only: e.target.checked }))} />
        Visível apenas para o GM
      </label>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onConfirm} style={{ ...invBtnStyle, background:'var(--ink)', color:'var(--paper)', borderColor:'var(--ink)' }}>Salvar</button>
        <button onClick={onCancel} style={invBtnStyle}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div>
      {visible.length === 0 && !adding && (
        <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:15,
          color:'var(--ink-mute)', padding:'24px 0', textAlign:'center' }}>
          ~ inventário vazio ~
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
        {visible.map(item => {
          if (isGM && editingId === item.id && editDraft)
            return <div key={item.id}>{formBlock(editDraft, setEditDraft, confirmEdit, () => { setEditingId(null); setEditDraft(null) })}</div>

          return (
            <div key={item.id} style={{ display:'flex', gap:12, alignItems:'flex-start',
              padding:'12px 16px', background:'var(--paper)',
              border:`1px solid ${item.gm_only ? 'var(--coral)' : 'var(--line)'}`, borderRadius:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontFamily:'var(--font-display)', fontSize:15, textTransform:'uppercase' }}>{item.name}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase',
                    padding:'1px 7px', borderRadius:999, background:'var(--paper-deep)', color: TYPE_COLOR_INV[item.type] }}>
                    {TYPE_LABEL[item.type] ?? item.type}
                  </span>
                  {item.gm_only && isGM && (
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase',
                      padding:'1px 7px', borderRadius:999, background:'rgba(196,51,33,0.1)', color:'var(--coral)' }}>
                      GM only
                    </span>
                  )}
                </div>
                {item.description && <div style={{ fontSize:13, color:'var(--ink-soft)', marginBottom:4 }}>{item.description}</div>}
                {item.effects    && <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--teal)', letterSpacing:'0.04em' }}>{item.effects}</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                <button onClick={() => updateQty(item.id, -1)} style={miniBtn as React.CSSProperties}>−</button>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:14, fontWeight:700, minWidth:20, textAlign:'center' }}>{item.quantity}</span>
                <button onClick={() => updateQty(item.id, +1)} style={miniBtn as React.CSSProperties}>+</button>
                {isGM && (
                  <>
                    <button onClick={() => startEdit(item)} style={{ ...miniBtn as React.CSSProperties, marginLeft:4 }} title="Editar">✎</button>
                    <button onClick={() => removeItem(item.id)} style={{ ...miniBtn as React.CSSProperties, color:'var(--coral)', borderColor:'var(--coral)' }}>×</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isGM && !adding && !editingId && (
        <button onClick={() => setAdding(true)} style={invBtnStyle}>+ Adicionar item</button>
      )}
      {isGM && adding && formBlock(draft, setDraft, addItem, () => { setDraft(ITEM_EMPTY); setAdding(false) })}
    </div>
  )
}
