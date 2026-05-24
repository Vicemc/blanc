// src/pages/BackstagePage.tsx
// Painel exclusivo do GM: gerenciar usuários, vincular tamers, liberar Skill Tree.

import { useState, useEffect, useCallback } from 'react'
import { listProfiles, setUserRole } from '../lib/auth'
import type { UserProfile } from '../lib/auth'
import { useAuth } from '../components/AuthProvider'
import type { AppState, SkillTreePhase, TamerSkill } from '../types'
import { saveStateToDB } from '../lib/db'
import { supabase } from '../lib/supabase'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'

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

  const allTamers = state.tamers
  const allDigis  = state.bestiary.filter(d => d.tamerId)

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 16 }}>
        Clique para abrir qualquer ficha em modo de edição completa
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))',
        gap: 10, marginBottom: 20 }}>
        {allTamers.map(t => (
          <button key={t.id} onClick={() => setOpen({ kind: 'tamer', id: t.id })}
            style={{ padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10,
              background: 'var(--paper)', cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase',
              letterSpacing: '-0.01em', transition: 'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
            {t.name}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)',
              marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Tamer
            </div>
          </button>
        ))}
        {allDigis.map(d => (
          <button key={d.id} onClick={() => setOpen({ kind: 'digimon', id: d.id })}
            style={{ padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10,
              background: 'var(--paper)', cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase',
              letterSpacing: '-0.01em', transition: 'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
            {d.name.replace(' Line', '')}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)',
              marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Digimon
            </div>
          </button>
        ))}
      </div>

      {open && (
        <SheetModal
          subject={open}
          state={state}
          onSaveState={onUpdate}
          onClose={() => setOpen(null)}
          editable
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

// ── BackstagePage ─────────────────────────────────────────────────────────────

type Tab = 'usuarios' | 'fichas' | 'skilltree'

export default function BackstagePage({ state, onUpdate }: Props) {
  const { isGM } = useAuth()
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
  ]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '28px 56px 0' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42,
          textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Backstage
        </h1>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
          fontSize: 18, color: 'var(--ink-soft)', marginBottom: 24 }}>
          ~ painel exclusivo do GM ~
        </div>
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
        {tab === 'usuarios'  && <UsersSection state={state} onUpdate={onUpdate} />}
        {tab === 'fichas'    && <SheetSection state={state} onUpdate={onUpdate} />}
        {tab === 'skilltree' && <SkillTreeSection state={state} onUpdate={onUpdate} />}
      </div>
    </div>
  )
}