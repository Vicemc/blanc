// src/pages/BackstagePage.tsx
// Painel exclusivo do GM: gerenciar usuários, vincular tamers, liberar Skill Tree.

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { listProfiles, setUserRole } from '../lib/auth'
import type { UserProfile } from '../lib/auth'
import { useAuth } from '../components/AuthProvider'
import { useSettings } from '../lib/settings'
import type { AppState, ActorRef, SkillTreePhase, TamerSkill, ClimaEntry, KeywordEntry, ConditionEntry, JogressConfig, JogressGroup, JogressSkill, VisibilityLevel } from '../types'
import { listNotes, saveNote, deleteNote, listItems, saveItem, deleteItem, revealItem,
  listSnapshots, createSnapshot, loadSnapshot, deleteSnapshot, labelSnapshot } from '../lib/db'
import type { GMNote, GMItem, SnapshotRow } from '../lib/db'
import { supabase } from '../lib/supabase'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import { BASE_KEYWORDS, BASE_CONDITIONS, getEffectiveClimas, groupBy } from '../data/rulesData'
import { findTamer, findDigimon, findBug, DIGIMON_DEFAULT_IMAGES, getVisLevel, setVisibility } from '../data/store'
import { findSurvivor } from '../data/domain'
import WikiSection from '../components/wiki/WikiSection'
import { useCampaignFlags } from '../lib/campaignFlags'
import type { CampaignFlags } from '../lib/campaignFlags'
import { WIKI_CATEGORIES, SPOILER_CATEGORIES } from '../types/wiki'

interface Props {
  state:    AppState
  onUpdate: (s: AppState) => void
}

// Tamers disponíveis para vincular
const TAMER_OPTIONS = [
  { id: 't-naoki',  name: 'Naoki'   },
  { id: 't-eisuke', name: 'Eisuke'  },
  { id: 't-miki',   name: 'Miki'    },
  { id: 't-yuri',   name: 'Yurieta' },
  { id: 't-sachi',  name: 'Sachi'   },
  { id: 't-mori',   name: 'Mori'    },
]

// ── Seção: Usuários ────────────────────────────────────────────────────────────

function UsersSection({ state: _state, onUpdate: _onUpdate }: { state: AppState; onUpdate: (s: AppState) => void }) {
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

type RulesTab = 'climas' | 'keywords' | 'condicoes' | 'jogress'

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
  const [addDraft, setAD]     = useState({ name:'', type:'Natural' as 'Natural'|'Não Natural', color:'teal', icon:'🌀', effectsRaw:'' })

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
                  <option value="Natural">Natural</option><option value="Não Natural">Não Natural</option>
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
              <option value="Natural">Natural</option><option value="Não Natural">Não Natural</option>
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
  const [addDraft, setAD]     = useState<Omit<KeywordEntry,'id'>>({ keyword:'', category:'Neutro', type:'neutral', desc:'', resist:'' })

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
                    isKeyword
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
          isKeyword
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

const KW_CATEGORIES = ['Neutro', 'Ataque / Efeito', 'Reação'] as const
type KwCategory = typeof KW_CATEGORIES[number]

// Maps keyword category → type
function kwCategoryToType(cat: KwCategory): KwType {
  if (cat === 'Reação') return 'reaction'
  return 'neutral'
}

// ── Shared form for Keyword / Condition ────────────────────────────────────────
function KwCondForm<T extends { category?: string; type: KwType; desc: string; resist?: string }>({
  draft, setDraft, nameField, namePlaceholder, onSave, onCancel, isKeyword,
}: {
  draft: T
  setDraft: (v: T) => void
  nameField: 'keyword' | 'name'
  namePlaceholder: string
  onSave: () => void
  onCancel: () => void
  isKeyword?: boolean
}) {
  const nameVal = (draft as any)[nameField] as string ?? ''
  return (
    <div style={{ padding:'14px', border:'1px solid var(--teal)', borderRadius:10, background:'var(--paper-deep)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:6, marginBottom:6 }}>
        <input value={nameVal}
          onChange={e => setDraft({ ...draft, [nameField]: e.target.value })}
          placeholder={namePlaceholder} style={fld} />
        {isKeyword ? (
          <select value={draft.category ?? 'Neutro'}
            onChange={e => {
              const cat = e.target.value as KwCategory
              setDraft({ ...draft, category: cat, type: kwCategoryToType(cat) })
            }} style={fld}>
            {KW_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input value={draft.category ?? ''}
            onChange={e => setDraft({ ...draft, category: e.target.value })}
            placeholder="Categoria (ex: Ferimento)" style={fld} />
        )}
        {!isKeyword && (
          <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as KwType })} style={fld}>
            {KW_TYPES.map(t => <option key={t} value={t}>{KW_TYPE_LABELS[t]}</option>)}
          </select>
        )}
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

// ── JogressCrud ───────────────────────────────────────────────────────────────


const JOGRESS_PW_KEY = 'gm_jogress_verified'

function JogressCrud({ state, onUpdate }: Props) {
  const configs: JogressConfig[] = state.jogressConfigs ?? []
  const pcIds = new Set(TAMER_OPTIONS.map(t => t.id))
  const lockOptions = state.tamers
    .filter(t => !pcIds.has(t.id))
    .map(t => ({ id: t.id, name: t.name }))

  // Password gate
  const [pwOk,       setPwOk]       = useState(() => !!localStorage.getItem(JOGRESS_PW_KEY))
  const [pwInput,    setPwInput]     = useState('')
  const [pwError,    setPwError]     = useState(false)
  const [settingPw,  setSettingPw]   = useState(false)
  const [newPwInput, setNewPwInput]  = useState('')

  // Form
  const [editId, setEditId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const emptyConfig = (): Omit<JogressConfig, 'id'> => ({
    name: '', lock1Id: '', lock2Id: '',
    lock1Skills: [], lock2Skills: [],
    memoryGroups: [], ownPassives: [], visible: false,
  })
  const [draft, setDraft] = useState<Omit<JogressConfig, 'id'>>(emptyConfig())

  const verifyPw = () => {
    const stored = state.jogressPassword ?? ''
    if (!stored) { setPwOk(true); localStorage.setItem(JOGRESS_PW_KEY, '1'); return }
    if (pwInput === stored) {
      setPwOk(true); setPwError(false)
      localStorage.setItem(JOGRESS_PW_KEY, '1')
    } else {
      setPwError(true)
    }
  }

  const savePw = () => {
    if (!newPwInput.trim()) return
    onUpdate({ ...state, jogressPassword: newPwInput.trim() })
    setSettingPw(false); setNewPwInput('')
  }

  const save = (cfg: JogressConfig) => {
    let workingCfg = cfg
    let tamers = state.tamers

    // Auto-fill (apenas na criação) seguindo as regras do Domain of Time:
    //   memoryGroups = passivas de cada lock cujo keyword == Domain do próprio lock
    //   ownPassives  = passivas dos locks cujo keyword == nome do Domain fusionado
    if (!editId) {
      const lock1 = cfg.lock1Id ? state.tamers.find(t => t.id === cfg.lock1Id) : null
      const lock2 = cfg.lock2Id ? state.tamers.find(t => t.id === cfg.lock2Id) : null

      const getDomainTitle = (t: typeof lock1): string => {
        if (!t) return '?'
        const skill = t.tamerSkills.find(s => s.title.startsWith('Domain of') || s.keyword === 'Domain')
        return skill?.title?.trim() ?? '?'
      }
      const shortOf = (title: string) => title.replace(/^Domain\s+of\s+/i, '').trim() || '?'

      const lock1Domain = getDomainTitle(lock1)
      const lock2Domain = getDomainTitle(lock2)
      const lock1Short = shortOf(lock1Domain)
      const lock2Short = shortOf(lock2Domain)

      const seed = Date.now().toString(36)
      const toJogressSkill = (s: TamerSkill, prefix: string, i: number): JogressSkill => ({
        id: `${prefix}-${seed}-${i}`,
        title: s.title,
        effect: s.effect,
      })

      // Memory groups: passivas dos próprios locks tagueadas com o seu Domain
      const memoryGroups: JogressGroup[] = []
      const lock1Mem = (lock1?.tamerSkills ?? []).filter(s => s.type === 'passive' && s.keyword === lock1Domain)
      const lock2Mem = (lock2?.tamerSkills ?? []).filter(s => s.type === 'passive' && s.keyword === lock2Domain)
      if (lock1Mem.length > 0) memoryGroups.push({
        id: `jg-1-${seed}`, domain: lock1Domain,
        skills: lock1Mem.map((s, i) => toJogressSkill(s, 'jms1', i)),
      })
      if (lock2Mem.length > 0) memoryGroups.push({
        id: `jg-2-${seed}`, domain: lock2Domain,
        skills: lock2Mem.map((s, i) => toJogressSkill(s, 'jms2', i)),
      })

      // Own passives: passivas dos locks tagueadas com o nome do Domain fusionado
      const fusedPool = [
        ...(lock1?.tamerSkills ?? []).filter(s => s.type === 'passive' && s.keyword === cfg.name),
        ...(lock2?.tamerSkills ?? []).filter(s => s.type === 'passive' && s.keyword === cfg.name),
      ]
      const seen = new Set<string>()
      const ownPassives: JogressSkill[] = []
      fusedPool.forEach((s, i) => {
        if (seen.has(s.title)) return
        seen.add(s.title)
        ownPassives.push(toJogressSkill(s, 'jop', i))
      })

      // Respeita o que o GM já tiver preenchido manualmente no form
      workingCfg = {
        ...cfg,
        memoryGroups: cfg.memoryGroups.length > 0 ? cfg.memoryGroups : memoryGroups,
        ownPassives:  cfg.ownPassives.length  > 0 ? cfg.ownPassives  : ownPassives,
      }

      // Auto-add Jogress TamerSkill aos dois locks
      const jogressSkill: TamerSkill = {
        type: 'action',
        keyword: 'Jogress',
        title: `Jogress: ${lock1Short} & ${lock2Short}`,
        custo: 'Nenhum',
        effect: `Requerimento: [${lock1Domain}] + [${lock2Domain}]. Ambos Domadores Fechadura podem ativar essa Skill. Escolha uma Skill Passiva que recupere Memory de cada Domain. As Skills escolhidas são herdadas pelo [${cfg.name}]. Em seguida, ative o [${cfg.name}].`,
      }
      tamers = tamers.map(t => {
        if (t.id !== cfg.lock1Id && t.id !== cfg.lock2Id) return t
        if (t.tamerSkills.some(s => s.title === jogressSkill.title)) return t
        return { ...t, tamerSkills: [...t.tamerSkills, jogressSkill] }
      })
    }

    const next = editId
      ? configs.map(c => c.id === editId ? workingCfg : c)
      : [...configs, workingCfg]

    onUpdate({ ...state, jogressConfigs: next, tamers })
    setEditId(null); setAdding(false); setDraft(emptyConfig())
  }

  const del = (id: string) => {
    if (!confirm('Remover este Domain Jogress?')) return
    onUpdate({ ...state, jogressConfigs: configs.filter(c => c.id !== id) })
  }

  const startEdit = (cfg: JogressConfig) => {
    setEditId(cfg.id)
    setDraft({
      name: cfg.name, lock1Id: cfg.lock1Id ?? '', lock2Id: cfg.lock2Id ?? '',
      lock1Skills: cfg.lock1Skills ?? [], lock2Skills: cfg.lock2Skills ?? [],
      memoryGroups: cfg.memoryGroups, ownPassives: cfg.ownPassives,
      visible: cfg.visible ?? false,
    })
    setAdding(true)
  }

  const toggleVisible = (id: string) => {
    onUpdate({
      ...state,
      jogressConfigs: configs.map(c =>
        c.id === id ? { ...c, visible: !c.visible } : c
      ),
    })
  }

  // ── Simple passiva editor ──────────────────────────────────────────────────
  function PassivaEditor({ skills, onChange, label }: {
    skills: JogressSkill[]; onChange: (s: JogressSkill[]) => void; label: string
  }) {
    const [title,  setTitle]  = useState('')
    const [effect, setEffect] = useState('')
    const add = () => {
      if (!title.trim()) return
      onChange([...skills, { id: `js-${Date.now().toString(36)}`, title: title.trim(), effect: effect.trim() }])
      setTitle(''); setEffect('')
    }
    return (
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', marginBottom: 6 }}>{label}</div>
        {skills.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '6px 10px',
            borderRadius: 6, border: '1px solid var(--line-soft)', background: 'var(--paper)', marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>{s.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>{s.effect}</div>
            </div>
            <button onClick={() => onChange(skills.filter((_, j) => j !== i))}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-mute)', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título *" style={{ ...fldSm, flex: 1 }} />
          <input value={effect} onChange={e => setEffect(e.target.value)} placeholder="Efeito" style={{ ...fldSm, flex: 2 }} />
          <button onClick={add} style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid var(--teal)',
            background: 'var(--teal)', color: 'var(--paper)', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>+ Add</button>
        </div>
      </div>
    )
  }

  // ── Memory group editor ────────────────────────────────────────────────────
  function GroupListEditor({ groups, onChange }: { groups: JogressGroup[]; onChange: (g: JogressGroup[]) => void }) {
    const [newDomain, setNewDomain] = useState('')
    const addGroup = () => {
      if (!newDomain.trim()) return
      onChange([...groups, { id: `jg-${Date.now().toString(36)}`, domain: newDomain.trim(), skills: [] }])
      setNewDomain('')
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map((g, gi) => (
          <div key={g.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--paper-deep)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, flex: 1 }}>{g.domain}</span>
              <button onClick={() => onChange(groups.filter((_, j) => j !== gi))}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-mute)', fontSize: 14 }}>×</button>
            </div>
            <PassivaEditor label="Passivas deste group" skills={g.skills}
              onChange={skills => onChange(groups.map((x, j) => j === gi ? { ...x, skills } : x))} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="Nome do Domain (ex: Domain of Sky)" style={fld} />
          <button onClick={addGroup} style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid var(--line)',
            background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, whiteSpace: 'nowrap' }}>+ Grupo</button>
        </div>
      </div>
    )
  }

  // ── Password gate ──────────────────────────────────────────────────────────
  if (!pwOk) {
    return (
      <div style={{ maxWidth: 400 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', marginBottom: 16 }}>
          Domain Jogress é protegido por senha. Insira a senha do GM para acessar.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password" value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(false) }}
            onKeyDown={e => e.key === 'Enter' && verifyPw()}
            placeholder="Senha do GM"
            style={{ ...fld, flex: 1, borderColor: pwError ? 'var(--coral)' : undefined }} />
          <button onClick={verifyPw} style={{ padding: '7px 18px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--teal)', background: 'var(--teal)', color: 'var(--paper)',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>
            Entrar
          </button>
        </div>
        {pwError && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', marginTop: 8 }}>
            Senha incorreta.
          </div>
        )}
        {!state.jogressPassword && (
          <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
            Nenhuma senha definida. Clique em Entrar para acessar sem senha e defina uma depois.
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header + senha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', flex: 1, lineHeight: 1.5 }}>
          Domain Jogress fusiona dois Digivices Fechadura. Oculto dos players por padrão.
        </div>
        <button onClick={() => setSettingPw(p => !p)}
          style={{ padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--line)', background: 'transparent',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
          {state.jogressPassword ? '🔑 Trocar Senha' : '🔑 Definir Senha'}
        </button>
        <button onClick={() => { localStorage.removeItem(JOGRESS_PW_KEY); setPwOk(false) }}
          style={{ padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--line)', background: 'transparent',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
          Travar
        </button>
      </div>

      {settingPw && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input type="password" value={newPwInput} onChange={e => setNewPwInput(e.target.value)}
            placeholder="Nova senha do portal"
            style={{ ...fld, flex: 1 }} />
          <button onClick={savePw} style={{ padding: '7px 16px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--teal)', background: 'var(--teal)', color: 'var(--paper)',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12 }}>Salvar Senha</button>
          <button onClick={() => { setSettingPw(false); setNewPwInput('') }}
            style={{ padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid var(--line)', background: 'transparent',
              fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-mute)' }}>×</button>
        </div>
      )}

      {/* Lista existente */}
      {configs.map(cfg => {
        const lock1Name = lockOptions.find(o => o.id === cfg.lock1Id)?.name ?? cfg.lock1Id ?? '—'
        const lock2Name = lockOptions.find(o => o.id === cfg.lock2Id)?.name ?? cfg.lock2Id ?? '—'
        return (
          <div key={cfg.id} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--line)',
            marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 12,
            background: 'var(--paper-deep)', opacity: cfg.visible ? 1 : 0.75 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, textTransform: 'uppercase' }}>{cfg.name}</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 6px',
                  borderRadius: 999, background: cfg.visible ? 'rgba(110,157,112,0.15)' : 'var(--paper-deep)',
                  border: `1px solid ${cfg.visible ? 'var(--green)' : 'var(--line)'}`,
                  color: cfg.visible ? 'var(--green)' : 'var(--ink-mute)' }}>
                  {cfg.visible ? 'visível' : 'oculto'}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.06em' }}>
                {lock1Name} ⟷ {lock2Name} · {cfg.memoryGroups.length} grupo(s) · {cfg.ownPassives.length} passiva(s)
              </div>
            </div>
            <button onClick={() => toggleVisible(cfg.id)}
              style={{ padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                border: '1px solid var(--line)', background: 'transparent',
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
              {cfg.visible ? '○ Ocultar' : '● Revelar'}
            </button>
            <button onClick={() => startEdit(cfg)} style={{ ...fldSm, width: 'auto', padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>Editar</button>
            <button onClick={() => del(cfg.id)} style={{ ...fldSm, width: 'auto', padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--coral)', borderColor: 'var(--coral)' }}>×</button>
          </div>
        )
      })}

      {/* Formulário de adição/edição */}
      {adding ? (
        <div style={{ padding: '16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', marginTop: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
            {editId ? 'Editar Domain Jogress' : 'Novo Domain Jogress'}
          </div>

          {/* Nome */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', display: 'block', marginBottom: 4 }}>Nome do Domain Fusionado</label>
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="ex: Domain of Time" style={fld} />
          </div>

          {/* Fechaduras */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', display: 'block', marginBottom: 4 }}>Fechadura 1 (NPC)</label>
              <select value={draft.lock1Id ?? ''} onChange={e => setDraft(d => ({ ...d, lock1Id: e.target.value }))} style={fld}>
                <option value="">— selecione —</option>
                {lockOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', display: 'block', marginBottom: 4 }}>Fechadura 2 (NPC)</label>
              <select value={draft.lock2Id ?? ''} onChange={e => setDraft(d => ({ ...d, lock2Id: e.target.value }))} style={fld}>
                <option value="">— selecione —</option>
                {lockOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>

          {/* Skills únicas por Fechadura */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12,
            padding: '12px', border: '1px solid var(--line-soft)', borderRadius: 8, background: 'var(--paper-deep)' }}>
            <PassivaEditor
              label={`Skills exclusivas de ${lockOptions.find(o => o.id === draft.lock1Id)?.name ?? 'Fechadura 1'}`}
              skills={draft.lock1Skills ?? []}
              onChange={s => setDraft(d => ({ ...d, lock1Skills: s }))}
            />
            <PassivaEditor
              label={`Skills exclusivas de ${lockOptions.find(o => o.id === draft.lock2Id)?.name ?? 'Fechadura 2'}`}
              skills={draft.lock2Skills ?? []}
              onChange={s => setDraft(d => ({ ...d, lock2Skills: s }))}
            />
          </div>

          {/* Grupos de memória */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', display: 'block', marginBottom: 8 }}>Grupos de Passivas de Memória</label>
            <GroupListEditor groups={draft.memoryGroups} onChange={g => setDraft(d => ({ ...d, memoryGroups: g }))} />
          </div>

          {/* Passivas próprias */}
          <div style={{ marginBottom: 16 }}>
            <PassivaEditor label="Passivas Próprias do Domain Fusionado (sempre ativas)" skills={draft.ownPassives} onChange={s => setDraft(d => ({ ...d, ownPassives: s }))} />
          </div>

          {/* Visibilidade */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            padding: '10px 14px', border: '1px solid var(--line-soft)', borderRadius: 8,
            background: 'var(--paper-deep)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', flex: 1 }}>
              Visível para players
            </span>
            <button onClick={() => setDraft(d => ({ ...d, visible: !d.visible }))}
              style={{ padding: '4px 14px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${draft.visible ? 'var(--green)' : 'var(--line)'}`,
                background: draft.visible ? 'rgba(110,157,112,0.15)' : 'transparent',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: draft.visible ? 'var(--green)' : 'var(--ink-mute)' }}>
              {draft.visible ? '● Visível' : '○ Oculto'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={!draft.name.trim()}
              onClick={() => save({ id: editId ?? `jcfg-${Date.now().toString(36)}`, ...draft })}
              style={{ padding: '7px 18px', borderRadius: 999, cursor: draft.name.trim() ? 'pointer' : 'not-allowed',
                border: '1px solid var(--teal)', background: 'var(--teal)', color: 'var(--paper)',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, opacity: draft.name.trim() ? 1 : 0.5 }}>
              Salvar
            </button>
            <button onClick={() => { setAdding(false); setEditId(null); setDraft(emptyConfig()) }}
              style={{ padding: '7px 18px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--line)',
                background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-mute)' }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ marginTop: 8, padding: '8px 20px', borderRadius: 999, border: '1px solid var(--line)',
            background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
          + Novo Domain Jogress
        </button>
      )}
    </div>
  )
}

// ── VisibilitySection ─────────────────────────────────────────────────────────

type VEntityKind = 'tamer' | 'survivor' | 'bestiary' | 'bug' | 'sign' | 'stage'

const VIS_LABELS: Record<VisibilityLevel, { label: string; bg: string; color: string }> = {
  hidden: { label: 'Oculto',      bg: 'var(--paper-deep)',          color: 'var(--ink-mute)' },
  name:   { label: 'Foto + Nome', bg: 'rgba(231,212,163,0.2)',       color: 'var(--gold)'     },
  full:   { label: 'Completo',    bg: 'rgba(110,157,112,0.15)',      color: 'var(--green)'    },
}

// Bestiary supports 3 levels; everything else toggles hidden ↔ full
function nextLevel(current: VisibilityLevel, isBestiary: boolean): VisibilityLevel {
  if (isBestiary) {
    if (current === 'hidden') return 'name'
    if (current === 'name')   return 'full'
    return 'hidden'
  }
  return current === 'hidden' ? 'full' : 'hidden'
}

function VisRow({ label, sub, type, id, state, onUpdate, isBestiary }: {
  label: string; sub?: string; type: string; id: string
  state: AppState; onUpdate: (s: AppState) => void; isBestiary?: boolean
}) {
  const level = getVisLevel(state, type, id)
  const { label: lvlLabel, bg, color } = VIS_LABELS[level]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      border: '1px solid var(--line)', borderRadius: 8, background: 'var(--paper)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, textTransform: 'uppercase',
          letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.08em' }}>{sub}</div>}
      </div>
      <button onClick={() => onUpdate(setVisibility(state, type, id, nextLevel(level, !!isBestiary)))}
        style={{ padding: '3px 12px', borderRadius: 999, cursor: 'pointer',
          border: `1px solid ${color}`, background: bg, color,
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
          textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {lvlLabel}
      </button>
    </div>
  )
}

function VisibilitySection({ state, onUpdate }: Props) {
  const [filter, setFilter] = useState<VEntityKind | 'all'>('all')

  const KINDS: { id: VEntityKind | 'all'; label: string }[] = [
    { id: 'all',      label: 'Todos'      },
    { id: 'tamer',    label: 'Tamers'     },
    { id: 'survivor', label: 'Survivors'  },
    { id: 'bestiary', label: 'Bestiário'  },
    { id: 'bug',      label: 'BUGs'       },
    { id: 'sign',     label: 'SIGNs'      },
    { id: 'stage',    label: 'Palcos'     },
  ]

  const show = (k: VEntityKind) => filter === 'all' || filter === k

  // Entidades atualmente visíveis no filtro, como pares [type, id]
  const visibleEntities = (): [string, string][] => {
    const out: [string, string][] = []
    if (show('tamer'))    state.tamers.forEach(t => out.push(['tamer', t.id]))
    if (show('survivor')) (state.survivors ?? []).forEach(sv => out.push(['survivor', sv.id]))
    if (show('bestiary')) state.bestiary.filter(d => !d.tamerId).forEach(d => out.push(['bestiary', d.id]))
    if (show('bug'))      state.bugs.forEach(b => out.push(['bug', b.id]))
    if (show('sign'))     (state.signs ?? []).forEach(sg => out.push(['sign', sg.id]))
    if (show('stage'))    state.stages.forEach(s => out.push(['stage', s.id]))
    return out
  }

  const bulkSet = (level: VisibilityLevel) => {
    let next = state
    for (const [type, id] of visibleEntities()) next = setVisibility(next, type, id, level)
    onUpdate(next)
  }

  // Revela (Completo) os bestiários/bugs/SIGNs presentes no palco mais recente com atores
  const revealActiveStage = () => {
    const palco = [...state.stages].reverse().find(s => s.sides.allies.length + s.sides.enemies.length > 0)
    if (!palco) return
    let next = state
    for (const a of [...palco.sides.allies, ...palco.sides.enemies]) {
      if (a.kind === 'wild' || a.kind === 'pair') {
        const id = a.kind === 'pair' ? a.digimonId : a.id
        next = setVisibility(next, 'bestiary', id, 'full')
      } else if (a.kind === 'bug')  next = setVisibility(next, 'bug',  a.id, 'full')
      else if (a.kind === 'sign')   next = setVisibility(next, 'sign', a.id, 'full')
    }
    onUpdate(next)
  }

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', marginBottom: 12, lineHeight: 1.6 }}>
        Controle o que os players conseguem ver. <b>Oculto</b> = só GM vê.{' '}
        <b>Foto + Nome</b> = players vêem imagem e nome (bestiário, BUGs, SIGNs). <b>Completo</b> = players vêem tudo.
        <br />Novos itens ficam <b>Ocultos</b> por padrão. Mudanças são enviadas aos players em tempo real.
      </div>

      {/* Ações rápidas (revelar ao vivo) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => bulkSet('full')}
          style={{ padding: '5px 14px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--green)', background: 'rgba(110,157,112,0.12)', color: 'var(--green)',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ● Revelar tudo (filtro)
        </button>
        <button onClick={() => bulkSet('hidden')}
          style={{ padding: '5px 14px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--line)', background: 'var(--paper-deep)', color: 'var(--ink-mute)',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ○ Ocultar tudo (filtro)
        </button>
        <button onClick={revealActiveStage}
          style={{ padding: '5px 14px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--coral)', background: 'transparent', color: 'var(--coral)',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ▶ Revelar atores do palco ativo
        </button>
      </div>

      {/* Filtro */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
        {KINDS.map(k => (
          <button key={k.id} onClick={() => setFilter(k.id as any)}
            style={{ padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              border: `1px solid ${filter === k.id ? 'var(--ink)' : 'var(--line)'}`,
              background: filter === k.id ? 'var(--ink)' : 'transparent',
              color: filter === k.id ? 'var(--paper)' : 'var(--ink-mute)' }}>
            {k.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {show('tamer') && state.tamers.map(t =>
          <VisRow key={t.id} label={t.name} sub="Tamer" type="tamer" id={t.id} state={state} onUpdate={onUpdate} />
        )}
        {show('survivor') && (state.survivors ?? []).map(sv =>
          <VisRow key={sv.id} label={sv.name} sub="Survivor" type="survivor" id={sv.id} state={state} onUpdate={onUpdate} />
        )}
        {show('bestiary') && state.bestiary.filter(d => !d.tamerId).map(d =>
          <VisRow key={d.id} label={d.name.replace(' Line', '')} sub="Bestiário" type="bestiary" id={d.id} state={state} onUpdate={onUpdate} isBestiary />
        )}
        {show('bug') && state.bugs.map(b =>
          <VisRow key={b.id} label={b.name} sub={`BUG · ${b.class}.${b.color}`} type="bug" id={b.id} state={state} onUpdate={onUpdate} isBestiary />
        )}
        {show('sign') && (state.signs ?? []).map(sg =>
          <VisRow key={sg.id} label={sg.name} sub={sg.code} type="sign" id={sg.id} state={state} onUpdate={onUpdate} isBestiary />
        )}
        {show('stage') && state.stages.map(s =>
          <VisRow key={s.id} label={s.title} sub="Palco" type="stage" id={s.id} state={state} onUpdate={onUpdate} />
        )}
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
    { id: 'jogress',   label: 'Jogress'  },
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
      {tab === 'jogress'   && <JogressCrud  state={state} onUpdate={onUpdate} />}
    </div>
  )
}

// ── Seção: GM (notas privadas + itens revelados sob demanda) ───────────────────
function GMSection({ state }: { state: AppState }) {
  const [notes, setNotes] = useState<GMNote[]>([])
  const [items, setItems] = useState<GMItem[]>([])
  const [loading, setLoading] = useState(true)
  const [noteDraft, setNoteDraft] = useState<GMNote>({ title: '', content: '' })
  const [itemDraft, setItemDraft] = useState<GMItem>({ name: '', description: '', item_type: 'item', assigned_to: null, revealed: false })
  const [editingNote, setEditingNote] = useState<GMNote | null>(null)
  const [noteSearch, setNoteSearch] = useState('')

  const charOptions = state.tamers.map(t => ({ id: t.id, name: t.name }))

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    Promise.all([listNotes(), listItems()]).then(([n, i]) => {
      setNotes(n); setItems(i); setLoading(false)
    })
  }, [])

  if (!supabase) {
    return <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--ink-mute)' }}>
      ~ Notas e itens do GM requerem o Supabase configurado ~
    </div>
  }
  if (loading) return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>Carregando...</div>

  const addNote = async () => {
    if (!noteDraft.title.trim()) return
    const saved = await saveNote(noteDraft)
    if (saved) setNotes(n => [saved, ...n])
    setNoteDraft({ title: '', content: '' })
  }
  const removeNote = async (id?: string) => {
    if (!id) return
    await deleteNote(id); setNotes(n => n.filter(x => x.id !== id))
  }
  const saveEditNote = async () => {
    if (!editingNote || !editingNote.title.trim()) return
    const saved = await saveNote(editingNote)
    if (saved) setNotes(list => list.map(x => x.id === saved.id ? saved : x))
    setEditingNote(null)
  }
  const addItem = async () => {
    if (!itemDraft.name.trim()) return
    const saved = await saveItem(itemDraft)
    if (saved) setItems(i => [saved, ...i])
    setItemDraft({ name: '', description: '', item_type: 'item', assigned_to: null, revealed: false })
  }
  const removeItem = async (id?: string) => {
    if (!id) return
    await deleteItem(id); setItems(i => i.filter(x => x.id !== id))
  }
  const toggleReveal = async (it: GMItem) => {
    if (!it.id) return
    const next = !it.revealed
    await revealItem(it.id, next)
    setItems(list => list.map(x => x.id === it.id ? { ...x, revealed: next } : x))
  }

  const inp: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 8, padding: '7px 12px',
    fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }

  return (
    <div>
    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14,
      color: 'var(--ink-mute)', marginBottom: 20 }}>
      ~ Diário do GM: anotações privadas da sessão e itens guardados em limbo, revelados aos players sob demanda ~
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28 }}>
      {/* Notas */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 12 }}>Notas privadas da sessão</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <input value={noteDraft.title} onChange={e => setNoteDraft(d => ({ ...d, title: e.target.value }))} placeholder="Título" style={inp} />
          <textarea value={noteDraft.content} onChange={e => setNoteDraft(d => ({ ...d, content: e.target.value }))} placeholder="Conteúdo..." rows={3} style={{ ...inp, resize: 'vertical' }} />
          <button onClick={addNote} style={{ ...inp, cursor: 'pointer', background: 'var(--ink)', color: 'var(--paper)', border: '1px solid var(--ink)', fontWeight: 600 }}>+ Nota</button>
        </div>
        {notes.length > 4 && (
          <input value={noteSearch} onChange={e => setNoteSearch(e.target.value)}
            placeholder="Filtrar notas..." style={{ ...inp, marginBottom: 8 }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes
            .filter(n => {
              const q = noteSearch.trim().toLowerCase()
              return !q || n.title.toLowerCase().includes(q) || (n.content ?? '').toLowerCase().includes(q)
            })
            .map(n => (
            <div key={n.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--paper)' }}>
              {editingNote?.id === n.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input value={editingNote!.title} onChange={e => setEditingNote(d => d && ({ ...d, title: e.target.value }))} placeholder="Título" style={inp} />
                  <textarea value={editingNote!.content} onChange={e => setEditingNote(d => d && ({ ...d, content: e.target.value }))} placeholder="Conteúdo..." rows={3} style={{ ...inp, resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={saveEditNote} style={{ ...inp, cursor: 'pointer', background: 'var(--teal)', color: '#f6f2e9', border: '1px solid var(--teal)', fontWeight: 600, padding: '5px 14px' }}>Salvar</button>
                    <button onClick={() => setEditingNote(null)} style={{ ...inp, cursor: 'pointer', background: 'transparent', color: 'var(--ink-mute)', padding: '5px 12px' }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>{n.title}</strong>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setEditingNote(n)} title="Editar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-mute)', fontSize: 13 }}>✎</button>
                      <button onClick={() => removeNote(n.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--coral)', fontSize: 16 }}>×</button>
                    </div>
                  </div>
                  {n.content && <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{n.content}</div>}
                </>
              )}
            </div>
          ))}
          {notes.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>Nenhuma nota.</div>}
        </div>
      </div>

      {/* Itens */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 12 }}>Itens (revelados sob demanda)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <input value={itemDraft.name} onChange={e => setItemDraft(d => ({ ...d, name: e.target.value }))} placeholder="Nome do item" style={inp} />
          <textarea value={itemDraft.description} onChange={e => setItemDraft(d => ({ ...d, description: e.target.value }))} placeholder="Descrição / efeitos..." rows={2} style={{ ...inp, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={itemDraft.item_type} onChange={e => setItemDraft(d => ({ ...d, item_type: e.target.value }))} style={{ ...inp, flex: 1 }}>
              <option value="item">Item</option><option value="weapon">Arma</option>
              <option value="accessory">Acessório</option><option value="key">Chave</option>
            </select>
            <select value={itemDraft.assigned_to ?? ''} onChange={e => setItemDraft(d => ({ ...d, assigned_to: e.target.value || null }))} style={{ ...inp, flex: 1 }}>
              <option value="">— sem dono —</option>
              {charOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={addItem} style={{ ...inp, cursor: 'pointer', background: 'var(--ink)', color: 'var(--paper)', border: '1px solid var(--ink)', fontWeight: 600 }}>+ Item</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => (
            <div key={it.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--paper)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>{it.name}</strong>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => toggleReveal(it)} title={it.revealed ? 'Visível ao dono' : 'Oculto'}
                    style={{ padding: '2px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
                      border: `1px solid ${it.revealed ? 'var(--green)' : 'var(--line)'}`, background: it.revealed ? 'rgba(110,157,112,0.15)' : 'transparent', color: it.revealed ? 'var(--green)' : 'var(--ink-mute)' }}>
                    {it.revealed ? '● revelado' : '○ oculto'}
                  </button>
                  <button onClick={() => removeItem(it.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--coral)', fontSize: 16 }}>×</button>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-mute)', marginTop: 2 }}>
                {it.item_type}{it.assigned_to ? ` · ${charOptions.find(c => c.id === it.assigned_to)?.name ?? it.assigned_to}` : ' · sem dono'}
              </div>
              {it.description && <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>{it.description}</div>}
            </div>
          ))}
          {items.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>Nenhum item.</div>}
        </div>
      </div>
    </div>
    </div>
  )
}

// ── Helpers para chips de atores em combate ──────────────────────────────────
function actorKeyOf(a: ActorRef): string {
  if (a.kind === 'human')    return `tamer:${a.id}`
  if (a.kind === 'pair')     return `digi:${a.digimonId}:${a.stage ?? 0}`
  if (a.kind === 'wild')     return `wild:${a.id}`
  if (a.kind === 'survivor') return `survivor:${a.id}`
  if (a.kind === 'sign')     return `sign:${a.id}`
  return `bug:${a.id}`
}

function resolveChipActor(state: AppState, a: ActorRef): {
  key: string; title: string; portrait: string; image: string | null; hp: number; hpMax: number
} | null {
  const key = actorKeyOf(a)
  if (a.kind === 'human') {
    const t = findTamer(state, a.id); if (!t) return null
    return { key, title: t.name, portrait: t.portrait, image: t.image, hp: t.status.HP.v, hpMax: t.status.HP.max }
  }
  if (a.kind === 'pair') {
    const d = findDigimon(state, a.digimonId); const s = d?.stages[a.stage ?? 0]
    if (!d || !s) return null
    const img = s.image ?? DIGIMON_DEFAULT_IMAGES[`${a.digimonId}:${a.stage ?? 0}`] ?? d.image ?? null
    return { key, title: s.stageName, portrait: s.portrait, image: img, hp: s.status.HP, hpMax: s.status.HP }
  }
  if (a.kind === 'wild') {
    const d = findDigimon(state, a.id); const s = d?.stages[0]
    if (!d || !s) return null
    const img = s.image ?? DIGIMON_DEFAULT_IMAGES[`${a.id}:0`] ?? d.image ?? null
    return { key, title: d.name, portrait: s.portrait, image: img, hp: s.status.HP, hpMax: s.status.HP }
  }
  if (a.kind === 'survivor') {
    const sv = findSurvivor(state, a.id); if (!sv) return null
    return { key, title: sv.name, portrait: sv.portrait, image: sv.image ?? null, hp: sv.status.HP.v, hpMax: sv.status.HP.max }
  }
  if (a.kind === 'sign') {
    const sg = (state.signs ?? []).find(x => x.id === a.id); if (!sg) return null
    return { key, title: sg.name, portrait: 'indigo', image: sg.image, hp: sg.status.HP, hpMax: sg.status.HP }
  }
  const b = findBug(state, a.id); if (!b) return null
  return { key, title: b.name, portrait: `bug-${b.color}`, image: b.image, hp: b.status.HP, hpMax: b.status.HP }
}

function StageActorChip({ portrait, image, title, hp, hpMax, side }: {
  portrait: string; image: string | null; title: string
  hp: number; hpMax: number; side: 'allies' | 'enemies'
}) {
  const pct = hpMax > 0 ? Math.max(0, Math.min(100, (hp / hpMax) * 100)) : 0
  const sideColor = side === 'allies' ? 'var(--green)' : 'var(--coral)'
  const hpColor   = pct > 50 ? 'var(--green)' : pct > 25 ? 'var(--orange)' : 'var(--coral)'
  return (
    <div title={`${title} · HP ${hp}/${hpMax}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 12px 4px 4px', borderRadius: 999,
        border: `1px solid ${sideColor}`, background: 'var(--paper)' }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        <span className={`fill-${portrait}`} style={{ position: 'absolute', inset: 0 }} />
        {image && <img src={image} alt={title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 36, height: 3, borderRadius: 999, background: 'var(--line-soft)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: hpColor, transition: 'width 0.15s' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)' }}>
            {hp}/{hpMax}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Seção: Campanha (flags globais) ───────────────────────────────────────────

const FLAG_META: { key: keyof CampaignFlags; label: string; desc: string }[] = [
  { key: 'wiki_detailed_pages', label: 'Páginas detalhadas da Wiki',
    desc: 'Ativa o layout em blocos (infobox, galeria, links) para todos os jogadores.' },
  { key: 'digizap_enabled', label: 'Digi-Zap ativo',
    desc: 'Liga/desliga o app de mensagens Digi-Zap para os players.' },
  { key: 'maps_for_players', label: 'Mapas para players',
    desc: 'Habilita a aba Mapas para os jogadores (o GM sempre vê).' },
  { key: 'spoiler_mode', label: 'Modo spoiler',
    desc: 'Oculta categorias sensíveis da Wiki (Eventos, Documentos, Entidades) dos players.' },
]

function FlagToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      style={{ flexShrink: 0, width: 52, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: on ? 'var(--teal)' : 'var(--line)', position: 'relative', transition: 'background 0.15s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 27 : 3,
        width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  )
}

function CampaignSection() {
  const { flags, loaded, setFlag } = useCampaignFlags()

  if (!supabase) {
    return <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--ink-mute)' }}>
      ~ Flags de campanha requerem o Supabase configurado ~
    </div>
  }

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
        marginBottom: 16, lineHeight: 1.6 }}>
        Estes interruptores valem para <b>toda a mesa</b> e são enviados aos players em tempo real.
        {SPOILER_CATEGORIES.length > 0 && (
          <> O <b>modo spoiler</b> esconde: {SPOILER_CATEGORIES.map(c =>
            WIKI_CATEGORIES.find(w => w.value === c)?.label ?? c).join(', ')}.</>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: loaded ? 1 : 0.6 }}>
        {FLAG_META.map(f => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, padding: '14px 18px', borderRadius: 12,
            background: 'var(--paper)', border: '1px solid var(--line)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase',
                letterSpacing: '-0.01em' }}>{f.label}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13,
                color: 'var(--ink-mute)', marginTop: 2 }}>{f.desc}</div>
            </div>
            <FlagToggle on={flags[f.key]} onToggle={() => setFlag(f.key, !flags[f.key])} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Seção: Dashboard (resumo da campanha + snapshots) ─────────────────────────
function DashboardSection({ state, onUpdate }: { state: AppState; onUpdate: (s: AppState) => void }) {
  const activeStage = [...state.stages].reverse().find(s => s.sides.allies.length + s.sides.enemies.length > 0)
  const totalXpFree  = state.tamers.reduce((a, t) => a + t.xp, 0)
  const totalXpSpent = state.tamers.reduce((a, t) => a + t.xpSpent, 0)

  // Chips dos atores no palco ativo (usa HP em tempo real quando disponível)
  const battleChips = activeStage
    ? ([
        ...activeStage.sides.allies.map(a => ({ actor: a, side: 'allies' as const })),
        ...activeStage.sides.enemies.map(a => ({ actor: a, side: 'enemies' as const })),
      ]
        .map(({ actor, side }) => {
          const info = resolveChipActor(state, actor)
          if (!info) return null
          const live = activeStage.actorStates?.[info.key]
          const hp    = live?.hp ?? info.hp
          const hpMax = live?.hp_max ?? info.hpMax
          return { ...info, hp, hpMax, side }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null))
    : []

  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [loadingSnap, setLoadingSnap] = useState(false)
  const [snapLabel, setSnapLabel] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  useEffect(() => {
    if (!supabase) return
    listSnapshots(20).then(setSnapshots)
  }, [])
  const doSnapshot = async () => {
    setLoadingSnap(true)
    const row = await createSnapshot(state, snapLabel)
    if (row) setSnapshots(s => [row, ...s])
    setSnapLabel('')
    setLoadingSnap(false)
  }
  const doRestore = async (id: string) => {
    if (!confirm('Restaurar este snapshot? O estado atual será sobrescrito (mas continua nos snapshots).')) return
    const snap = await loadSnapshot(id)
    if (snap) onUpdate(snap)
  }
  const doDelete = async (id: string) => {
    if (!confirm('Apagar este snapshot?')) return
    await deleteSnapshot(id)
    setSnapshots(s => s.filter(x => x.id !== id))
  }
  const startRename = (s: SnapshotRow) => { setRenamingId(s.id); setRenameValue(s.label ?? '') }
  const commitRename = async () => {
    if (!renamingId) return
    const id = renamingId
    const label = renameValue.trim()
    await labelSnapshot(id, label)
    setSnapshots(list => list.map(x => x.id === id ? { ...x, label: label || undefined } : x))
    setRenamingId(null); setRenameValue('')
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Palco ativo */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>Palco ativo</div>
        {activeStage ? (
          <Link to="/teatro" state={{ openStage: activeStage.id }}
            style={{ display: 'block', textDecoration: 'none', color: 'inherit',
              border: '1px solid var(--line)', borderRadius: 10, padding: '14px 18px',
              background: 'var(--paper)', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--ink)'
              e.currentTarget.style.background = 'var(--paper-deep)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--line)'
              e.currentTarget.style.background = 'var(--paper)'
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase' }}>{activeStage.title}</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--ink-mute)' }}>abrir palco →</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>
              R{activeStage.roundCurrent ?? 0} · Aliados: {activeStage.sides.allies.length} · Inimigos: {activeStage.sides.enemies.length}
              {activeStage.clima && ` · Clima: ${activeStage.clima}`}
            </div>
          </Link>
        ) : (
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-mute)' }}>
            ~ nenhum palco ativo ~
          </div>
        )}
      </div>

      {/* Tracker dos personagens em combate */}
      {activeStage ? (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>
            Em combate ({battleChips.length})
          </div>
          {battleChips.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {battleChips.map(chip => (
                <StageActorChip key={chip.key}
                  portrait={chip.portrait} image={chip.image} title={chip.title}
                  hp={chip.hp} hpMax={chip.hpMax} side={chip.side} />
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-mute)' }}>
              ~ sem atores resolvidos ~
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>
            Tamers ({state.tamers.length}) · XP livre: {totalXpFree} · gasto: {totalXpSpent}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {state.tamers.map(t => (
              <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', background: 'var(--paper)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase' }}>{t.name}</strong>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)' }}>XP {t.xp}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                  HP {t.status.HP.v}/{t.status.HP.max} · Mem {t.status.Memory.v}/{t.status.Memory.max} · DS {t.status.Digisoul.v}/{t.status.Digisoul.max}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Survivors */}
      {(state.survivors ?? []).length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>
            Survivors ({state.survivors!.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {state.survivors!.map(sv => (
              <div key={sv.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', background: 'var(--paper)' }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase' }}>{sv.name}</strong>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                  HP {sv.status.HP.v}/{sv.status.HP.max} · DS {sv.status.Digisoul.v}/{sv.status.Digisoul.max}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>Conteúdo</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
          {state.bestiary.length} bestiário · {state.bugs.length} BUGs · {(state.signs ?? []).length} SIGNs · {state.stages.length} palcos · {state.skillTree.length} fases de skill tree
        </div>
      </div>

      {/* Backups (snapshots rotulados) */}
      {supabase && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>Backups</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', marginBottom: 10, lineHeight: 1.6 }}>
            Salve um snapshot rotulado antes de grandes mudanças e restaure com um clique se algo der errado.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={snapLabel} onChange={e => setSnapLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loadingSnap && doSnapshot()}
              placeholder="Rótulo (ex: antes do boss do cap. 3) — opcional"
              style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '7px 12px',
                fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }} />
            <button onClick={doSnapshot} disabled={loadingSnap}
              style={{ padding: '7px 16px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {loadingSnap ? '...' : '+ Salvar backup'}
            </button>
          </div>
          {snapshots.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>Nenhum backup.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {snapshots.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '6px 12px', border: '1px solid var(--line-soft)', borderRadius: 8,
                  background: i === 0 ? 'rgba(110,157,112,0.10)' : 'var(--paper)' }}>
                  {renamingId === s.id ? (
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') } }}
                      onBlur={commitRename}
                      placeholder="Rótulo do backup"
                      style={{ flex: 1, border: '1px solid var(--teal)', borderRadius: 6, padding: '4px 8px',
                        fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }} />
                  ) : (
                    <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      {s.label && (
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                      )}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
                        {new Date(s.updated_at).toLocaleString('pt-BR')}
                        {i === 0 && <span style={{ color: 'var(--green)', marginLeft: 8 }}>atual</span>}
                      </span>
                    </span>
                  )}
                  <button onClick={() => startRename(s)} title="Renomear"
                    style={{ padding: '3px 8px', borderRadius: 999, cursor: 'pointer',
                      border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-mute)',
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    ✎
                  </button>
                  {i > 0 && (
                    <button onClick={() => doRestore(s.id)}
                      style={{ padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                        border: '1px solid var(--coral)', background: 'transparent', color: 'var(--coral)',
                        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      ↺ Restaurar
                    </button>
                  )}
                  <button onClick={() => doDelete(s.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--coral)', fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── BackstagePage ─────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'usuarios' | 'fichas' | 'skilltree' | 'regras' | 'visibilidade' | 'gm' | 'wiki' | 'campanha'

export default function BackstagePage({ state, onUpdate }: Props) {
  const { isGM } = useAuth()
  const { isTaglineHidden } = useSettings()
  const [tab, setTab] = useState<Tab>('dashboard')

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
    { id: 'dashboard',   label: 'Dashboard'    },
    { id: 'usuarios',    label: 'Usuários'     },
    { id: 'fichas',      label: 'Fichas'       },
    { id: 'skilltree',   label: 'Skill Tree'   },
    { id: 'regras',      label: 'Regras'       },
    { id: 'visibilidade', label: 'Visibilidade' },
    { id: 'gm',          label: 'Diário do GM' },
    { id: 'wiki',        label: 'Wiki'         },
    { id: 'campanha',    label: 'Campanha'     },
  ]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '28px var(--page-pad-x) 0' }}>
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
        padding: '0 var(--page-pad-x)', marginBottom: 32, overflowX: 'auto' }}>
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
      <div style={{ padding: '0 var(--page-pad-x)' }}>
        {tab === 'dashboard'    && <DashboardSection  state={state} onUpdate={onUpdate} />}
        {tab === 'usuarios'     && <UsersSection      state={state} onUpdate={onUpdate} />}
        {tab === 'fichas'       && <SheetSection      state={state} onUpdate={onUpdate} />}
        {tab === 'skilltree'    && <SkillTreeSection  state={state} onUpdate={onUpdate} />}
        {tab === 'regras'       && <RulesSection      state={state} onUpdate={onUpdate} />}
        {tab === 'visibilidade' && <VisibilitySection state={state} onUpdate={onUpdate} />}
        {tab === 'gm'           && <GMSection         state={state} />}
        {tab === 'wiki'         && <WikiSection       state={state} onUpdate={onUpdate} />}
        {tab === 'campanha'     && <CampaignSection />}
      </div>
    </div>
  )
}