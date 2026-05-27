// src/pages/BackstagePage.tsx
// Painel exclusivo do GM: gerenciar usuários, vincular tamers, liberar Skill Tree.

import React, { useState, useEffect, useCallback } from 'react'
import { listProfiles, setUserRole } from '../lib/auth'
import type { UserProfile } from '../lib/auth'
import { useAuth } from '../components/AuthProvider'
import { useSettings } from '../lib/settings'
import type { AppState, SkillTreePhase, TamerSkill, ClimaEntry, KeywordEntry, ConditionEntry } from '../types'
import { saveStateToDB } from '../lib/db'
import { supabase } from '../lib/supabase'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import { BASE_CLIMAS, BASE_KEYWORDS, BASE_CONDITIONS, getEffectiveClimas, groupBy } from '../data/rulesData'

interface Props {
  state:    AppState
  onUpdate: (s: AppState) => void
}

// Tamers disponíveis para vincular
const TAMER_OPTIONS = [
  { id: 't-naoki',  name: 'Naoki'   },
  { id: 't-eisuke', name: 'Eisuke'  },
  { id: 't-miki',   name: 'Miki'    },
  { id: 't-yuri',   name: 'Yuri'    },
  { id: 't-sachi',  name: 'Sachi'   },
  { id: 't-mori',   name: 'Mori'    },
]

// ── Seção: Usuários ────────────────────────────────────────────────────────────

function UsersSection({ state, onUpdate }: { state: AppState; onUpdate: (s: AppState) => void }) {
  const [profiles, setProfiles]   = useState<UserProfile[]>([])
  const [loading,  setLoading]    = useState(true)
  const [saving,   setSaving]     = useState<string | null>(null)
  const [feedback, setFeedback]   = useState<Record<string, string>>({})

  useEffect(() => {
    listProfiles().then(p => { setProfiles(p); setLoading(false) })
  }, [])

  const save = async (
    profile: UserProfile,
    role: UserProfile['role'],
    tamerId: string | null,
    displayName: string,
  ) => {
    setSaving(profile.id)
    const { error } = await setUserRole(
      profile.id,
      role,
      tamerId ?? undefined,
    )
    // Atualizar display_name se mudou
    if (displayName !== profile.display_name) {
      await supabase?.from('profiles')
        .update({ display_name: displayName })
        .eq('id', profile.id)
    }
    setSaving(null)
    setFeedback(p => ({ ...p, [profile.id]: error ? `✗ ${error}` : '✓ Salvo' }))
    setTimeout(() => setFeedback(p => { const n = { ...p }; delete n[profile.id]; return n }), 2000)
    if (!error) setProfiles(prev => prev.map(p =>
      p.id === profile.id ? { ...p, role, tamer_id: tamerId, display_name: displayName } : p
    ))
  }

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)',
      padding: '24px 0' }}>Carregando usuários...</div>
  )

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 16 }}>
        {profiles.length} usuário{profiles.length !== 1 ? 's' : ''} cadastrado{profiles.length !== 1 ? 's' : ''}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {profiles.map(p => (
          <UserRow
            key={p.id}
            profile={p}
            saving={saving === p.id}
            feedback={feedback[p.id]}
            onSave={save}
          />
        ))}
      </div>

      <div style={{ marginTop: 20, padding: '14px 18px',
        background: 'var(--paper-deep)', border: '1px solid var(--line-soft)',
        borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--ink-mute)', lineHeight: 1.7 }}>
        Para criar novos usuários: Supabase Dashboard → Authentication → Users → Invite User.
        Após o usuário aceitar o convite, ele aparece aqui para configuração.
      </div>
    </div>
  )
}

function UserRow({ profile, saving, feedback, onSave }: {
  profile:  UserProfile
  saving:   boolean
  feedback: string | undefined
  onSave:   (p: UserProfile, role: UserProfile['role'], tamerId: string | null, name: string) => void
}) {
  const [role,    setRole]    = useState<UserProfile['role']>(profile.role)
  const [tamerId, setTamerId] = useState<string>(profile.tamer_id ?? '')
  const [name,    setName]    = useState(profile.display_name)

  const dirty = role !== profile.role
    || (tamerId || null) !== profile.tamer_id
    || name !== profile.display_name

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 160px auto',
      gap: 10, alignItems: 'center', padding: '12px 16px',
      background: 'var(--paper)', border: '1px solid var(--line)',
      borderRadius: 10 }}>
      {/* Nome */}
      <div>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ width: '100%', border: '1px solid var(--line-soft)', borderRadius: 6,
            padding: '5px 10px', fontFamily: 'var(--font-body)', fontSize: 14,
            background: 'var(--paper)', color: 'var(--ink)' }} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)',
          marginTop: 3, letterSpacing: '0.06em' }}>
          {profile.id.slice(0, 8)}...
        </div>
      </div>

      {/* Role */}
      <select value={role} onChange={e => setRole(e.target.value as UserProfile['role'])}
        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px',
          fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--paper)',
          color: role === 'gm' ? 'var(--ink)' : 'var(--ink-soft)',
          fontWeight: role === 'gm' ? 700 : 400 }}>
        <option value="player">Player</option>
        <option value="gm">GM</option>
      </select>

      {/* Tamer vinculado */}
      <select value={tamerId} onChange={e => setTamerId(e.target.value)}
        disabled={role === 'gm'}
        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px',
          fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)',
          color: 'var(--ink)', opacity: role === 'gm' ? 0.4 : 1 }}>
        <option value="">— sem vínculo —</option>
        {TAMER_OPTIONS.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {/* Salvar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onSave(profile, role, tamerId || null, name)}
          disabled={!dirty || saving}
          style={{ padding: '6px 14px', borderRadius: 999, cursor: dirty ? 'pointer' : 'default',
            border: `1px solid ${dirty ? 'var(--ink)' : 'var(--line)'}`,
            background: dirty ? 'var(--ink)' : 'transparent',
            color: dirty ? 'var(--paper)' : 'var(--ink-mute)',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12,
            whiteSpace: 'nowrap' }}>
          {saving ? '...' : 'Salvar'}
        </button>
        {feedback && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
            color: feedback.startsWith('✓') ? 'var(--green)' : 'var(--coral)' }}>
            {feedback}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Seção: Fichas ──────────────────────────────────────────────────────────────

function SheetSection({ state, onUpdate }: Props) {
  const [open, setOpen] = useState<SheetSubject | null>(null)

  const allTamers    = state.tamers
  const allDigis     = state.bestiary.filter(d => d.tamerId)
  const allSurvivors = state.survivors ?? []

  const sheetBtn = (label: string, sub: string, subject: SheetSubject, color = 'var(--ink)') => (
    <button key={(subject as any).id} onClick={() => setOpen(subject)}
      style={{ padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10,
        background: 'var(--paper)', cursor: 'pointer', textAlign: 'left',
        fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase',
        letterSpacing: '-0.01em', transition: 'all 0.12s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
      {label}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)',
        marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {sub}
      </div>
    </button>
  )

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 16 }}>
        Clique para abrir qualquer ficha em modo de edição completa
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))',
        gap: 10, marginBottom: 20 }}>
        {allTamers.map(t    => sheetBtn(t.name, 'Tamer', { kind: 'tamer', id: t.id }))}
        {allDigis.map(d     => sheetBtn(d.name.replace(' Line', ''), 'Digimon', { kind: 'digimon', id: d.id }, 'var(--teal)'))}
        {allSurvivors.map(sv => sheetBtn(sv.name, 'Survivor', { kind: 'survivor', id: sv.id }, 'var(--rose, var(--coral))'))}
      </div>

      {open && (
        <SheetModal
          subject={open}
          state={state}
          onSaveState={onUpdate}
          onClose={() => setOpen(null)}
          editable
          isGM
        />
      )}
    </div>
  )
}

// ── Seção: Skill Tree ─────────────────────────────────────────────────────────

function SkillTreeSection({ state, onUpdate }: Props) {
  const [selectedTamer, setSelectedTamer] = useState<string>(state.tamers[0]?.id ?? '')
  const [newPhaseLabel, setNewPhaseLabel] = useState('')
  const [adding, setAdding] = useState(false)

  const tamer = state.tamers.find(t => t.id === selectedTamer)
  const phases = (state.skillTree ?? []).filter(p => p.tamerId === selectedTamer)

  const addPhase = () => {
    if (!newPhaseLabel.trim()) return
    const phase: SkillTreePhase = {
      id:              `stp-${selectedTamer}-${phases.length + 1}-${Date.now().toString(36)}`,
      tamerId:         selectedTamer,
      phaseNum:        phases.length + 1,
      label:           newPhaseLabel.trim(),
      unlocked:        false,
      skillsAvailable: [],
      skillsAcquired:  [],
    }
    const newState = { ...state, skillTree: [...(state.skillTree ?? []), phase] }
    onUpdate(newState)
    setNewPhaseLabel('')
    setAdding(false)
  }

  const toggleUnlock = (phaseId: string) => {
    onUpdate({
      ...state,
      skillTree: state.skillTree.map(p =>
        p.id === phaseId ? { ...p, unlocked: !p.unlocked } : p
      ),
    })
  }

  const deletePhase = (phaseId: string) => {
    if (!confirm('Remover esta fase?')) return
    onUpdate({ ...state, skillTree: state.skillTree.filter(p => p.id !== phaseId) })
  }

  return (
    <div>
      {/* Seletor de tamer */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {state.tamers.map(t => (
          <button key={t.id} onClick={() => setSelectedTamer(t.id)}
            style={{ padding: '5px 14px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 12, textTransform: 'uppercase',
              border: `1.5px solid ${selectedTamer === t.id ? 'var(--ink)' : 'var(--line)'}`,
              background: selectedTamer === t.id ? 'var(--ink)' : 'transparent',
              color: selectedTamer === t.id ? 'var(--paper)' : 'var(--ink-soft)' }}>
            {t.name}
          </button>
        ))}
      </div>

      {/* Fases existentes */}
      {phases.length === 0 && (
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15,
          color: 'var(--ink-mute)', padding: '16px 0' }}>
          ~ Nenhuma fase criada para {tamer?.name ?? 'este tamer'} ~
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {phases.map(phase => (
          <div key={phase.id} style={{ border: '1px solid var(--line)', borderRadius: 10,
            padding: '12px 16px', background: 'var(--paper)',
            display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14,
                textTransform: 'uppercase' }}>
                {phase.label}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                marginTop: 3, letterSpacing: '0.08em' }}>
                {phase.skillsAvailable.length} disponível{phase.skillsAvailable.length !== 1 ? 'is' : ''} ·{' '}
                {phase.skillsAcquired.length} adquirida{phase.skillsAcquired.length !== 1 ? 's' : ''}
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 999,
              background: phase.unlocked ? 'var(--teal)' : 'var(--paper-deep)',
              color: phase.unlocked ? '#f6f2e9' : 'var(--ink-mute)',
              border: '1px solid var(--line)' }}>
              {phase.unlocked ? 'Desbloqueada' : 'Bloqueada'}
            </span>
            <button onClick={() => toggleUnlock(phase.id)}
              style={{ padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                border: '1px solid var(--line)', background: 'transparent',
                color: 'var(--ink-mute)' }}>
              {phase.unlocked ? 'Bloquear' : 'Liberar'}
            </button>
            <button onClick={() => deletePhase(phase.id)}
              style={{ padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                border: '1px solid var(--line)', background: 'transparent',
                color: 'var(--coral)' }}>×</button>
          </div>
        ))}
      </div>

      {/* Adicionar fase */}
      {!adding ? (
        <button onClick={() => setAdding(true)}
          style={{ padding: '8px 18px', borderRadius: 999, cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
            border: '1px solid var(--line)', background: 'transparent',
            color: 'var(--ink-soft)' }}>
          + Nova fase para {tamer?.name}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={newPhaseLabel} onChange={e => setNewPhaseLabel(e.target.value)}
            placeholder="ex: Fase 2 — Laços de Sangue"
            onKeyDown={e => e.key === 'Enter' && addPhase()}
            style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8,
              padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 14,
              background: 'var(--paper)', color: 'var(--ink)' }} />
          <button onClick={addPhase}
            style={{ padding: '8px 18px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid var(--ink)', background: 'var(--ink)',
              color: 'var(--paper)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13 }}>
            Criar
          </button>
          <button onClick={() => { setAdding(false); setNewPhaseLabel('') }}
            style={{ padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid var(--line)', background: 'transparent',
              color: 'var(--ink-mute)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// ── Seção: Regras (Climas / Keywords / Condições) ────────────────────────────

const fld: React.CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 8, padding: '7px 12px',
  fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)',
  width: '100%',
}
const fldSm: React.CSSProperties = { ...fld, width: 'auto' }

type RulesTab = 'climas' | 'keywords' | 'condicoes'

const KW_TYPES = ['neutral','reaction','wound','stack','positive','neg'] as const
type KwType = typeof KW_TYPES[number]
const KW_TYPE_LABELS: Record<KwType, string> = {
  neutral:'Neutro', reaction:'Reação', wound:'Ferimento', stack:'Acumulação', positive:'Positiva', neg:'Negativa',
}

// ── Clima CRUD ─────────────────────────────────────────────────────────────────
function ClimaCrud({ state, onUpdate }: Props) {
  const effective = getEffectiveClimas(state.customClimas ?? [])
  const isCustomized = (state.customClimas ?? []).length > 0

  const [editId, setEditId]   = useState<string | null>(null)
  const [editDraft, setED]    = useState<ClimaEntry | null>(null)
  const [adding, setAdding]   = useState(false)
  const [addDraft, setAD]     = useState({ name:'', type:'Natural' as 'Natural'|'Especial', color:'teal', icon:'🌀', effectsRaw:'' })

  function parseEffects(raw: string): ClimaEntry['effects'] {
    return raw.trim()
      ? raw.split('\n').filter(Boolean).map(l => {
          const [tag, ...rest] = l.split(':')
          return { tag: tag.trim(), desc: rest.join(':').trim(), color: 'ink-soft' }
        })
      : [{ tag: 'Neutro', desc: 'Sem efeitos adicionais.', color: 'ink-mute' }]
  }

  function effectsToRaw(effects: ClimaEntry['effects']): string {
    return effects.map(e => `${e.tag}: ${e.desc}`).join('\n')
  }

  function startEdit(c: ClimaEntry) {
    setEditId(c.id); setED({ ...c })
    setAdding(false)
  }

  function saveEdit() {
    if (!editDraft) return
    onUpdate({ ...state, customClimas: effective.map(c => c.id === editDraft.id ? editDraft : c) })
    setEditId(null); setED(null)
  }

  function deleteEntry(id: string) {
    if (!confirm('Remover este clima?')) return
    onUpdate({ ...state, customClimas: effective.filter(c => c.id !== id) })
  }

  function addEntry() {
    if (!addDraft.name.trim()) return
    const entry: ClimaEntry = {
      id: `clima-${Date.now().toString(36)}`,
      name: addDraft.name.trim(), type: addDraft.type,
      color: addDraft.color, icon: addDraft.icon,
      effects: parseEffects(addDraft.effectsRaw), gm_only: false,
    }
    onUpdate({ ...state, customClimas: [...effective, entry] })
    setAdding(false); setAD({ name:'', type:'Natural', color:'teal', icon:'🌀', effectsRaw:'' })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {!isCustomized && (
        <div style={{ padding:'10px 14px', borderRadius:8, background:'var(--paper-deep)',
          fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)', marginBottom:4 }}>
          Exibindo padrões. Ao editar ou adicionar, a lista completa será salva e personalizável.
        </div>
      )}

      {effective.map(c => (
        <div key={c.id}>
          {editId === c.id && editDraft ? (
            <div style={{ padding:'14px', border:'1px solid var(--teal)', borderRadius:10, background:'var(--paper-deep)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 60px 100px', gap:6, marginBottom:6 }}>
                <input value={editDraft.name} onChange={e => setED(p => p && ({ ...p, name: e.target.value }))}
                  placeholder="Nome" style={fld} />
                <select value={editDraft.type} onChange={e => setED(p => p && ({ ...p, type: e.target.value as any }))} style={fld}>
                  <option value="Natural">Natural</option><option value="Especial">Especial</option>
                </select>
                <input value={editDraft.icon} onChange={e => setED(p => p && ({ ...p, icon: e.target.value }))}
                  placeholder="🌀" style={fld} />
                <input value={editDraft.color} onChange={e => setED(p => p && ({ ...p, color: e.target.value }))}
                  placeholder="teal" style={fld} />
              </div>
              <textarea value={effectsToRaw(editDraft.effects)}
                onChange={e => setED(p => p && ({ ...p, effects: parseEffects(e.target.value) }))}
                placeholder="tag: descrição (uma por linha)" rows={3}
                style={{ ...fld, resize:'vertical', marginBottom:6 }} />
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={saveEdit} style={{ padding:'5px 14px', borderRadius:999, cursor:'pointer',
                  border:'1px solid var(--teal)', background:'var(--teal)', color:'#f6f2e9',
                  fontFamily:'var(--font-body)', fontWeight:600, fontSize:12 }}>Salvar</button>
                <button onClick={() => { setEditId(null); setED(null) }}
                  style={{ padding:'5px 12px', borderRadius:999, cursor:'pointer',
                    border:'1px solid var(--line)', background:'transparent',
                    fontFamily:'var(--font-body)', fontSize:12, color:'var(--ink-mute)' }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
              border:'1px solid var(--line)', borderRadius:10, background:'var(--paper)' }}>
              <span style={{ fontSize:20, minWidth:28 }}>{c.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <span style={{ fontFamily:'var(--font-display)', fontSize:13, textTransform:'uppercase' }}>{c.name}</span>
                <span style={{ marginLeft:8, fontFamily:'var(--font-mono)', fontSize:9,
                  padding:'1px 6px', borderRadius:999, background:'var(--paper-deep)',
                  border:'1px solid var(--line)', color:'var(--ink-mute)' }}>{c.type}</span>
                <span style={{ marginLeft:6, fontFamily:'var(--font-mono)', fontSize:9,
                  color:'var(--ink-mute)' }}>· {c.color}</span>
              </div>
              <button onClick={() => startEdit(c)}
                style={{ padding:'3px 10px', borderRadius:999, cursor:'pointer',
                  fontFamily:'var(--font-mono)', fontSize:9, border:'1px solid var(--line)',
                  background:'transparent', color:'var(--ink-mute)' }}>✎ Editar</button>
              <button onClick={() => deleteEntry(c.id)}
                style={{ padding:'3px 8px', borderRadius:999, cursor:'pointer',
                  fontFamily:'var(--font-mono)', fontSize:10, border:'1px solid var(--line)',
                  background:'transparent', color:'var(--coral)' }}>×</button>
            </div>
          )}
        </div>
      ))}

      {/* Restaurar / Adicionar */}
      <div style={{ display:'flex', gap:8, marginTop:4 }}>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditId(null) }}
            style={{ padding:'6px 16px', borderRadius:999, cursor:'pointer',
              border:'1px solid var(--line)', background:'transparent',
              fontFamily:'var(--font-body)', fontWeight:600, fontSize:12, color:'var(--ink-soft)' }}>
            + Adicionar Clima
          </button>
        )}
        {isCustomized && (
          <button onClick={() => { if (confirm('Restaurar climas padrão? Alterações serão perdidas.')) onUpdate({ ...state, customClimas: [] }) }}
            style={{ padding:'6px 16px', borderRadius:999, cursor:'pointer',
              border:'1px solid var(--line)', background:'transparent',
              fontFamily:'var(--font-body)', fontSize:12, color:'var(--ink-mute)' }}>
            ↺ Restaurar padrões
          </button>
        )}
      </div>

      {adding && (
        <div style={{ padding:'14px', border:'1px solid var(--line)', borderRadius:10, background:'var(--paper-deep)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 60px 100px', gap:6, marginBottom:6 }}>
            <input value={addDraft.name} onChange={e => setAD(p=>({...p,name:e.target.value}))}
              placeholder="Nome *" style={fld} />
            <select value={addDraft.type} onChange={e => setAD(p=>({...p,type:e.target.value as any}))} style={fld}>
              <option value="Natural">Natural</option><option value="Especial">Especial</option>
            </select>
            <input value={addDraft.icon} onChange={e => setAD(p=>({...p,icon:e.target.value}))} placeholder="🌀" style={fld} />
            <input value={addDraft.color} onChange={e => setAD(p=>({...p,color:e.target.value}))} placeholder="teal" style={fld} />
          </div>
          <textarea value={addDraft.effectsRaw} onChange={e => setAD(p=>({...p,effectsRaw:e.target.value}))}
            placeholder="tag: descrição (uma por linha)" rows={2}
            style={{ ...fld, resize:'vertical', marginBottom:6 }} />
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={addEntry} style={{ padding:'5px 14px', borderRadius:999, cursor:'pointer',
              border:'1px solid var(--ink)', background:'var(--ink)', color:'var(--paper)',
              fontFamily:'var(--font-body)', fontWeight:600, fontSize:12 }}>Adicionar</button>
            <button onClick={() => setAdding(false)} style={{ padding:'5px 12px', borderRadius:999,
              cursor:'pointer', border:'1px solid var(--line)', background:'transparent',
              fontFamily:'var(--font-body)', fontSize:12, color:'var(--ink-mute)' }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Keyword CRUD ───────────────────────────────────────────────────────────────
function KeywordCrud({ state, onUpdate }: Props) {
  const effective = (state.customKeywords ?? []).length > 0 ? state.customKeywords : BASE_KEYWORDS
  const isCustomized = (state.customKeywords ?? []).length > 0

  const [editId, setEditId]   = useState<string | null>(null)
  const [editDraft, setED]    = useState<KeywordEntry | null>(null)
  const [adding, setAdding]   = useState(false)
  const [addDraft, setAD]     = useState<Omit<KeywordEntry,'id'>>({ keyword:'', category:'Ação', type:'neutral', desc:'', resist:'' })

  const groups = groupBy(effective, k => k.category ?? 'Outros')

  function startEdit(k: KeywordEntry) { setEditId(k.id); setED({...k}); setAdding(false) }

  function saveEdit() {
    if (!editDraft) return
    onUpdate({ ...state, customKeywords: effective.map(k => k.id === editDraft.id ? editDraft : k) })
    setEditId(null); setED(null)
  }

  function deleteEntry(id: string) {
    if (!confirm('Remover esta keyword?')) return
    onUpdate({ ...state, customKeywords: effective.filter(k => k.id !== id) })
  }

  function addEntry() {
    if (!addDraft.keyword.trim()) return
    const entry: KeywordEntry = { id: `kw-${Date.now().toString(36)}`, ...addDraft,
      keyword: addDraft.keyword.trim(), desc: addDraft.desc.trim(),
      resist: addDraft.resist?.trim() || undefined }
    onUpdate({ ...state, customKeywords: [...effective, entry] })
    setAdding(false); setAD({ keyword:'', category:'Ação', type:'neutral', desc:'', resist:'' })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {!isCustomized && (
        <div style={{ padding:'10px 14px', borderRadius:8, background:'var(--paper-deep)',
          fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)' }}>
          Exibindo padrões. Ao editar ou adicionar, a lista completa será salva e personalizável.
        </div>
      )}

      {groups.map(([cat, entries]) => (
        <div key={cat}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.12em',
            textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:6 }}>{cat}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {entries.map(kw => (
              <div key={kw.id}>
                {editId === kw.id && editDraft ? (
                  <KwCondForm<KeywordEntry>
                    draft={editDraft} setDraft={setED as any}
                    nameField="keyword" namePlaceholder="Keyword"
                    onSave={saveEdit} onCancel={() => { setEditId(null); setED(null) }}
                  />
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto auto',
                    gap:8, alignItems:'start', padding:'10px 14px',
                    border:'1px solid var(--line)', borderRadius:10, background:'var(--paper)' }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:9, padding:'2px 6px',
                      borderRadius:999, background:'var(--paper-deep)', border:'1px solid var(--line)',
                      color:'var(--ink-mute)', whiteSpace:'nowrap' }}>{kw.type}</span>
                    <div>
                      <b style={{ fontFamily:'var(--font-display)', fontSize:12, textTransform:'uppercase' }}>{kw.keyword}</b>
                      <p style={{ margin:'3px 0 0', fontFamily:'var(--font-body)', fontSize:12,
                        color:'var(--ink-soft)', lineHeight:1.4 }}>{kw.desc}</p>
                      {kw.resist && <div style={{ fontFamily:'var(--font-mono)', fontSize:9,
                        color:'var(--ink-mute)', marginTop:3 }}>Resistir: {kw.resist}</div>}
                    </div>
                    <button onClick={() => startEdit(kw)}
                      style={{ padding:'3px 10px', borderRadius:999, cursor:'pointer',
                        fontFamily:'var(--font-mono)', fontSize:9, border:'1px solid var(--line)',
                        background:'transparent', color:'var(--ink-mute)', whiteSpace:'nowrap' }}>✎ Editar</button>
                    <button onClick={() => deleteEntry(kw.id)}
                      style={{ padding:'3px 8px', borderRadius:999, cursor:'pointer',
                        fontFamily:'var(--font-mono)', fontSize:10, border:'1px solid var(--line)',
                        background:'transparent', color:'var(--coral)' }}>×</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display:'flex', gap:8, marginTop:4 }}>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditId(null) }}
            style={{ padding:'6px 16px', borderRadius:999, cursor:'pointer',
              border:'1px solid var(--line)', background:'transparent',
              fontFamily:'var(--font-body)', fontWeight:600, fontSize:12, color:'var(--ink-soft)' }}>
            + Adicionar Keyword
          </button>
        )}
        {isCustomized && (
          <button onClick={() => { if (confirm('Restaurar keywords padrão?')) onUpdate({ ...state, customKeywords: [] }) }}
            style={{ padding:'6px 16px', borderRadius:999, cursor:'pointer',
              border:'1px solid var(--line)', background:'transparent',
              fontFamily:'var(--font-body)', fontSize:12, color:'var(--ink-mute)' }}>
            ↺ Restaurar padrões
          </button>
        )}
      </div>

      {adding && (
        <KwCondForm<Omit<KeywordEntry,'id'>>
          draft={addDraft} setDraft={setAD as any}
          nameField="keyword" namePlaceholder="Keyword"
          onSave={addEntry} onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
}

// ── Condition CRUD ─────────────────────────────────────────────────────────────
function ConditionCrud({ state, onUpdate }: Props) {
  const effective = (state.customConditions ?? []).length > 0 ? state.customConditions : BASE_CONDITIONS
  const isCustomized = (state.customConditions ?? []).length > 0

  const [editId, setEditId]   = useState<string | null>(null)
  const [editDraft, setED]    = useState<ConditionEntry | null>(null)
  const [adding, setAdding]   = useState(false)
  const [addDraft, setAD]     = useState<Omit<ConditionEntry,'id'>>({ name:'', category:'Ferimento', type:'wound', desc:'', resist:'' })

  const groups = groupBy(effective, c => c.category)

  function startEdit(c: ConditionEntry) { setEditId(c.id); setED({...c}); setAdding(false) }

  function saveEdit() {
    if (!editDraft) return
    onUpdate({ ...state, customConditions: effective.map(c => c.id === editDraft.id ? editDraft : c) })
    setEditId(null); setED(null)
  }

  function deleteEntry(id: string) {
    if (!confirm('Remover esta condição?')) return
    onUpdate({ ...state, customConditions: effective.filter(c => c.id !== id) })
  }

  function addEntry() {
    if (!addDraft.name.trim()) return
    const entry: ConditionEntry = { id: `cond-${Date.now().toString(36)}`, ...addDraft,
      name: addDraft.name.trim(), desc: addDraft.desc.trim(),
      resist: addDraft.resist?.trim() || undefined }
    onUpdate({ ...state, customConditions: [...effective, entry] })
    setAdding(false); setAD({ name:'', category:'Ferimento', type:'wound', desc:'', resist:'' })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {!isCustomized && (
        <div style={{ padding:'10px 14px', borderRadius:8, background:'var(--paper-deep)',
          fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)' }}>
          Exibindo padrões. Ao editar ou adicionar, a lista completa será salva e personalizável.
        </div>
      )}

      {groups.map(([cat, entries]) => (
        <div key={cat}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.12em',
            textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:6 }}>{cat}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {entries.map(cond => (
              <div key={cond.id}>
                {editId === cond.id && editDraft ? (
                  <KwCondForm<ConditionEntry>
                    draft={editDraft} setDraft={setED as any}
                    nameField="name" namePlaceholder="Nome da Condição"
                    onSave={saveEdit} onCancel={() => { setEditId(null); setED(null) }}
                  />
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto auto',
                    gap:8, alignItems:'start', padding:'10px 14px',
                    border:'1px solid var(--line)', borderRadius:10, background:'var(--paper)' }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:9, padding:'2px 6px',
                      borderRadius:999, background:'var(--paper-deep)', border:'1px solid var(--line)',
                      color:'var(--ink-mute)', whiteSpace:'nowrap' }}>{cond.type}</span>
                    <div>
                      <b style={{ fontFamily:'var(--font-display)', fontSize:12, textTransform:'uppercase' }}>{cond.name}</b>
                      <p style={{ margin:'3px 0 0', fontFamily:'var(--font-body)', fontSize:12,
                        color:'var(--ink-soft)', lineHeight:1.4 }}>{cond.desc}</p>
                      {cond.resist && <div style={{ fontFamily:'var(--font-mono)', fontSize:9,
                        color:'var(--ink-mute)', marginTop:3 }}>Resistir: {cond.resist}</div>}
                    </div>
                    <button onClick={() => startEdit(cond)}
                      style={{ padding:'3px 10px', borderRadius:999, cursor:'pointer',
                        fontFamily:'var(--font-mono)', fontSize:9, border:'1px solid var(--line)',
                        background:'transparent', color:'var(--ink-mute)', whiteSpace:'nowrap' }}>✎ Editar</button>
                    <button onClick={() => deleteEntry(cond.id)}
                      style={{ padding:'3px 8px', borderRadius:999, cursor:'pointer',
                        fontFamily:'var(--font-mono)', fontSize:10, border:'1px solid var(--line)',
                        background:'transparent', color:'var(--coral)' }}>×</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display:'flex', gap:8, marginTop:4 }}>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditId(null) }}
            style={{ padding:'6px 16px', borderRadius:999, cursor:'pointer',
              border:'1px solid var(--line)', background:'transparent',
              fontFamily:'var(--font-body)', fontWeight:600, fontSize:12, color:'var(--ink-soft)' }}>
            + Adicionar Condição
          </button>
        )}
        {isCustomized && (
          <button onClick={() => { if (confirm('Restaurar condições padrão?')) onUpdate({ ...state, customConditions: [] }) }}
            style={{ padding:'6px 16px', borderRadius:999, cursor:'pointer',
              border:'1px solid var(--line)', background:'transparent',
              fontFamily:'var(--font-body)', fontSize:12, color:'var(--ink-mute)' }}>
            ↺ Restaurar padrões
          </button>
        )}
      </div>

      {adding && (
        <KwCondForm<Omit<ConditionEntry,'id'>>
          draft={addDraft} setDraft={setAD as any}
          nameField="name" namePlaceholder="Nome da Condição"
          onSave={addEntry} onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
}

// ── Shared form for Keyword / Condition ────────────────────────────────────────
function KwCondForm<T extends { category?: string; type: KwType; desc: string; resist?: string }>({
  draft, setDraft, nameField, namePlaceholder, onSave, onCancel,
}: {
  draft: T
  setDraft: (v: T) => void
  nameField: 'keyword' | 'name'
  namePlaceholder: string
  onSave: () => void
  onCancel: () => void
}) {
  const nameVal = (draft as any)[nameField] as string ?? ''
  return (
    <div style={{ padding:'14px', border:'1px solid var(--teal)', borderRadius:10, background:'var(--paper-deep)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6 }}>
        <input value={nameVal}
          onChange={e => setDraft({ ...draft, [nameField]: e.target.value })}
          placeholder={namePlaceholder} style={fld} />
        <input value={draft.category ?? ''}
          onChange={e => setDraft({ ...draft, category: e.target.value })}
          placeholder="Categoria (ex: Ação, Ferimento)" style={fld} />
        <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as KwType })} style={fld}>
          {KW_TYPES.map(t => <option key={t} value={t}>{KW_TYPE_LABELS[t]}</option>)}
        </select>
      </div>
      <textarea value={draft.desc}
        onChange={e => setDraft({ ...draft, desc: e.target.value })}
        placeholder="Descrição (use **negrito** para destaque)" rows={2}
        style={{ ...fld, resize:'vertical', marginBottom:6 }} />
      <input value={draft.resist ?? ''}
        onChange={e => setDraft({ ...draft, resist: e.target.value })}
        placeholder="Resistir (opcional, ex: Vigor + Resistência)" style={{ ...fld, marginBottom:8 }} />
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={onSave} style={{ padding:'5px 14px', borderRadius:999, cursor:'pointer',
          border:'1px solid var(--teal)', background:'var(--teal)', color:'#f6f2e9',
          fontFamily:'var(--font-body)', fontWeight:600, fontSize:12 }}>Salvar</button>
        <button onClick={onCancel} style={{ padding:'5px 12px', borderRadius:999, cursor:'pointer',
          border:'1px solid var(--line)', background:'transparent',
          fontFamily:'var(--font-body)', fontSize:12, color:'var(--ink-mute)' }}>Cancelar</button>
      </div>
    </div>
  )
}

// ── RulesSection ───────────────────────────────────────────────────────────────
function RulesSection({ state, onUpdate }: Props) {
  const [tab, setTab] = useState<RulesTab>('climas')

  const RULES_TABS: { id: RulesTab; label: string }[] = [
    { id: 'climas',    label: 'Climas'   },
    { id: 'keywords',  label: 'Keywords' },
    { id: 'condicoes', label: 'Condições'},
  ]

  return (
    <div>
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'1px solid var(--line-soft)' }}>
        {RULES_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'8px 18px', border:'none', background:'transparent', cursor:'pointer',
              fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.12em',
              textTransform:'uppercase',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-mute)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--teal)' : 'transparent'}`,
              transition:'color 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'climas'    && <ClimaCrud    state={state} onUpdate={onUpdate} />}
      {tab === 'keywords'  && <KeywordCrud  state={state} onUpdate={onUpdate} />}
      {tab === 'condicoes' && <ConditionCrud state={state} onUpdate={onUpdate} />}
    </div>
  )
}

// ── BackstagePage ─────────────────────────────────────────────────────────────

type Tab = 'usuarios' | 'fichas' | 'skilltree' | 'regras'

export default function BackstagePage({ state, onUpdate }: Props) {
  const { isGM } = useAuth()
  const { isTaglineHidden } = useSettings()
  const [tab, setTab] = useState<Tab>('usuarios')

  if (!isGM) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center',
        fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20,
        color: 'var(--ink-mute)' }}>
        ~ Acesso restrito ao GM ~
      </div>
    )
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'usuarios',  label: 'Usuários'   },
    { id: 'fichas',    label: 'Fichas'     },
    { id: 'skilltree', label: 'Skill Tree' },
    { id: 'regras',    label: 'Regras'     },
  ]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '28px 56px 0' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42,
          textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Backstage
        </h1>
        {!isTaglineHidden('backstage') && (
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
            fontSize: 18, color: 'var(--ink-soft)', marginBottom: 24 }}>
            ~ painel exclusivo do GM ~
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)',
        padding: '0 56px', marginBottom: 32 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '12px 22px', border: 'none', background: 'transparent',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em',
              textTransform: 'uppercase', cursor: 'pointer',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-mute)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--coral)' : 'transparent'}`,
              transition: 'color 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ padding: '0 56px' }}>
        {tab === 'usuarios'  && <UsersSection    state={state} onUpdate={onUpdate} />}
        {tab === 'fichas'    && <SheetSection    state={state} onUpdate={onUpdate} />}
        {tab === 'skilltree' && <SkillTreeSection state={state} onUpdate={onUpdate} />}
        {tab === 'regras'    && <RulesSection    state={state} onUpdate={onUpdate} />}
      </div>
    </div>
  )
}