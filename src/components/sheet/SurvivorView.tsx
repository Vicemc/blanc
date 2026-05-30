import React, { useState } from 'react'
import type {
  AppState, Survivor, Merit, SurvivorAttributes, SurvivorStatus, SurvivorLoreBlock,
  InventoryItem, TamerSkill,
} from '../../types'
import { PORTRAIT_LIST } from '../../types'
import { GrainFill } from '../GrainFill'
import { Toast } from '../Toast'
import styles from '../Sheet.module.css'
import {
  ValueDisplay, SkillGrid, SkillCard, AddSkillForm,
  SectionTitle, EffectText, inp,
} from './shared/components'

// ── Survivor info editor ───────────────────────────────────────────
function SurvivorInfoEditor({ sv, onSave }: { sv: Survivor; onSave: (s: Survivor) => void }) {
  const [d, setD] = useState(sv)
  const f = (k: keyof Survivor) => (v: string) => setD(s => ({ ...s, [k]: v || undefined }))
  const changed = JSON.stringify(d) !== JSON.stringify(sv)
  return (
    <div className={styles.infoEditor}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div><label className={styles.formLabel}>Nome</label>{inp(d.name, v => setD(s => ({ ...s, name: v })))}</div>
        <div><label className={styles.formLabel}>Sobrenome</label>{inp(d.surname ?? '', f('surname'))}</div>
        <div><label className={styles.formLabel}>Tagline</label>{inp(d.tagline ?? '', f('tagline'))}</div>
        <div><label className={styles.formLabel}>Voz</label>{inp(d.voice ?? '', f('voice'))}</div>
        <div><label className={styles.formLabel}>Aniversário</label>{inp(d.birthday ?? '', f('birthday'))}</div>
        <div><label className={styles.formLabel}>Signo</label>{inp(d.sign ?? '', f('sign'))}</div>
        <div><label className={styles.formLabel}>Idade</label>{inp(String(d.age ?? ''), v => setD(s => ({ ...s, age: v || undefined })))}</div>
        <div><label className={styles.formLabel}>Altura (cm)</label>
          <input type="number" min={0} value={d.height ?? ''} onChange={e => setD(s => ({ ...s, height: parseInt(e.target.value) || undefined }))} className={styles.formInput} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className={styles.formLabel}>Cor do retrato</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {PORTRAIT_LIST.map(p => (
            <div key={p} onClick={() => setD(s => ({ ...s, portrait: p }))}
              style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', position: 'relative',
                outline: d.portrait === p ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }}>
              <GrainFill color={p} />
            </div>
          ))}
        </div>
      </div>
      {changed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.btnSolid} style={{ fontSize: 12 }} onClick={() => onSave(d)}>Salvar info</button>
          <button className={styles.btnGhost} style={{ fontSize: 12 }} onClick={() => setD(sv)}>Descartar</button>
        </div>
      )}
    </div>
  )
}

// ── MeritCard ──────────────────────────────────────────────────────
function MeritCard({ m, editable, onDelete, onChange }: {
  m: Merit; editable?: boolean; onDelete?: () => void; onChange?: (m: Merit) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m)
  const isPassive = m.type === 'passive'

  if (editing) {
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          <input value={(draft as Merit).target ?? ''} onChange={e => setDraft(d => ({ ...d, target: e.target.value }))} placeholder="Alvo" className={styles.formInput} />
          <input value={(draft as Merit).ds_cost ?? ''} onChange={e => setDraft(d => ({ ...d, ds_cost: e.target.value }))} placeholder="Custo DS (ex: -2 Digisoul)" className={styles.formInput} />
        </div>
        <input value={draft.dados ?? ''} onChange={e => setDraft(d => ({ ...d, dados: e.target.value }))} placeholder="Dados (ex: Poder + Físico)" className={styles.formInput} style={{ marginBottom: 6, width: '100%' }} />
        <textarea value={draft.effect} onChange={e => setDraft(d => ({ ...d, effect: e.target.value }))} placeholder="Efeito" className={styles.formInput} rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={styles.btnSolid} style={{ fontSize: 12 }} onClick={() => { onChange?.(draft); setEditing(false) }}>Salvar</button>
          <button className={styles.btnGhost} style={{ fontSize: 12 }} onClick={() => { setDraft(m); setEditing(false) }}>Cancelar</button>
        </div>
      </div>
    )
  }

  const dadosLine = [
    m.target && `Alvo: ${m.target}`,
    m.ds_cost && `DS: ${m.ds_cost}`,
    m.dados && `Dados: ${m.dados}`,
  ].filter(Boolean).join(' · ')

  return (
    <div className={`${styles.skillCard} ${isPassive ? styles.passive : ''}`}>
      {editable && (
        <div className={styles.cardActions}>
          {onChange && <button className={styles.cardEdit} onClick={() => setEditing(true)} title="Editar">✎</button>}
          {onDelete && <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', paddingRight: editable ? 80 : 0 }}>
        <span className={`${styles.cardTag} ${isPassive ? styles.tagPassive : m.type === 'reaction' ? styles.tagReaction : ''}`}>
          {isPassive ? 'Passiva' : m.type === 'reaction' ? 'Reação' : 'Ação'}
        </span>
        {m.keyword && <span className={styles.cardKeyword}>[{m.keyword}]</span>}
      </div>
      <h5 className={styles.cardTitle}>{m.title}</h5>
      {dadosLine && <div className={styles.cardDados}>{dadosLine}</div>}
      {m.effect && m.effect !== '—' && <p className={styles.cardEffect}><EffectText text={m.effect} /></p>}
    </div>
  )
}

function AddMeritForm({ onAdd, onCancel }: { onAdd: (m: Merit) => void; onCancel: () => void }) {
  const [type, setType]       = useState<'action' | 'reaction' | 'passive'>('action')
  const [keyword, setKeyword] = useState('')
  const [title, setTitle]     = useState('')
  const [target, setTarget]   = useState('')
  const [dsCost, setDsCost]   = useState('')
  const [dados, setDados]     = useState('')
  const [effect, setEffect]   = useState('')

  return (
    <div className={styles.addSkillForm}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <select value={type} onChange={e => setType(e.target.value as any)} className={styles.formInput} style={{ flex: '0 0 auto' }}>
          <option value="action">Ação</option>
          <option value="reaction">Reação</option>
          <option value="passive">Passiva</option>
        </select>
        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Palavra-chave" className={styles.formInput} style={{ flex: 1 }} />
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome *" className={styles.formInput} style={{ marginBottom: 6, width: '100%' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Alvo" className={styles.formInput} />
        <input value={dsCost} onChange={e => setDsCost(e.target.value)} placeholder="Custo DS (ex: -2 Digisoul)" className={styles.formInput} />
      </div>
      <input value={dados} onChange={e => setDados(e.target.value)} placeholder="Dados (ex: Poder + Físico)" className={styles.formInput} style={{ marginBottom: 6, width: '100%' }} />
      <textarea value={effect} onChange={e => setEffect(e.target.value)} placeholder="Efeito" className={styles.formInput} rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button className={styles.btnSolid} style={{ fontSize: 12 }} onClick={() => {
          if (!title.trim()) return
          onAdd({ type, keyword, title, target: target || undefined, ds_cost: dsCost || undefined, dados: dados || undefined, effect })
        }}>+ Adicionar</button>
        <button className={styles.btnGhost} style={{ fontSize: 12 }} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── SurvivorInventoryTab ───────────────────────────────────────────
const TIPO_COLORS: Record<string, string> = {
  Arma: 'var(--coral)', Chave: 'var(--gold, #c8972a)', Acessório: 'var(--teal)', Item: 'var(--ink-mute)',
}

function SurvivorItemForm({ draft, setDraft, onConfirm, onCancel }: {
  draft: InventoryItem
  setDraft: (fn: (d: InventoryItem) => InventoryItem) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ background: 'var(--paper-deep)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 14px 10px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={draft.tipo ?? ''} onChange={e => setDraft(d => ({ ...d, tipo: (e.target.value as any) || undefined }))}
          className={styles.formInput} style={{ flex: '0 0 130px', padding: '7px 10px', fontSize: 13 }}>
          <option value="">— Tipo —</option>
          {(['Item', 'Arma', 'Chave', 'Acessório'] as const).map(t => <option key={t}>{t}</option>)}
        </select>
        <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Nome *" className={styles.formInput}
          style={{ flex: '1 1 160px', padding: '7px 10px', fontSize: 13 }} />
        <input type="number" min={0} value={draft.qty}
          onChange={e => setDraft(d => ({ ...d, qty: parseInt(e.target.value) || 0 }))}
          className={styles.formInput} style={{ flex: '0 0 60px', padding: '7px 10px', fontSize: 13 }} />
      </div>
      {draft.tipo === 'Arma' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={draft.alcance ?? ''} onChange={e => setDraft(d => ({ ...d, alcance: e.target.value || undefined }))}
            placeholder="Alcance" className={styles.formInput}
            style={{ flex: 1, padding: '7px 10px', fontSize: 13 }} />
          <input type="number" min={0} value={draft.usos ?? ''}
            onChange={e => setDraft(d => ({ ...d, usos: parseInt(e.target.value) || undefined }))}
            placeholder="Usos" className={styles.formInput}
            style={{ flex: '0 0 80px', padding: '7px 10px', fontSize: 13 }} />
        </div>
      )}
      <textarea value={draft.descricao ?? ''} onChange={e => setDraft(d => ({ ...d, descricao: e.target.value || undefined }))}
        placeholder="Descrição" rows={2}
        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', resize: 'vertical' }} />
      <textarea value={draft.efeito ?? ''} onChange={e => setDraft(d => ({ ...d, efeito: e.target.value || undefined }))}
        placeholder="Efeito" rows={2}
        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className={styles.btnSolid} style={{ fontSize: 12, padding: '7px 16px' }} onClick={onConfirm}>✓ Salvar</button>
        <button className={styles.btnGhost} style={{ fontSize: 12, padding: '7px 16px' }} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function SurvivorItemRow({ item, editable, onEdit, onDelete }: {
  item: InventoryItem; editable: boolean
  onEdit: (item: InventoryItem) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item)

  if (editing) {
    return (
      <SurvivorItemForm
        draft={draft} setDraft={setDraft}
        onConfirm={() => { onEdit(draft); setEditing(false) }}
        onCancel={() => { setDraft(item); setEditing(false) }}
      />
    )
  }

  return (
    <div style={{ borderBottom: '1px dotted var(--line-soft)', padding: '9px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {item.tipo && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: TIPO_COLORS[item.tipo] ?? 'var(--ink-mute)',
            border: `1px solid ${TIPO_COLORS[item.tipo] ?? 'var(--ink-mute)'}`,
            borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
            {item.tipo}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, flex: 1, fontWeight: 500 }}>{item.name}</span>
        {item.tipo === 'Arma' && item.alcance && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>Alc. {item.alcance}</span>
        )}
        {item.tipo === 'Arma' && item.usos != null && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>{item.usos}× usos</span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', flexShrink: 0 }}>×{item.qty}</span>
        {editable && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className={styles.cardEdit} onClick={() => { setDraft(item); setEditing(true) }} title="Editar">✎</button>
            <button className={styles.cardDel}  onClick={onDelete} title="Remover">×</button>
          </div>
        )}
      </div>
      {(item.descricao || item.efeito) && (
        <div style={{ paddingLeft: item.tipo ? 0 : 0, marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {item.descricao && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-soft, var(--ink-mute))', lineHeight: 1.5 }}>{item.descricao}</span>
          )}
          {item.efeito && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-mute)', marginRight: 4 }}>Efeito</span>
              {item.efeito}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function SurvivorInventoryTab({ sv, editable, onSave }: {
  sv: Survivor; editable: boolean; onSave: (sv: Survivor) => void
}) {
  const emptyDraft = (): InventoryItem => ({ id: '', name: '', qty: 1, tipo: 'Item' })
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<InventoryItem>(emptyDraft)

  const handleAdd = () => {
    if (!draft.name.trim()) return
    const item = { ...draft, id: `inv-${Date.now().toString(36)}` }
    onSave({ ...sv, inventory: [...sv.inventory, item] })
    setDraft(emptyDraft())
    setAdding(false)
  }

  return (
    <div>
      <SectionTitle>Inventário</SectionTitle>
      {sv.inventory.length === 0 && !adding && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', padding: '8px 4px 12px' }}>~ inventário vazio ~</div>
      )}
      {sv.inventory.map((item, idx) => (
        <SurvivorItemRow key={item.id} item={item} editable={editable}
          onEdit={updated => onSave({ ...sv, inventory: sv.inventory.map((x, i) => i === idx ? updated : x) })}
          onDelete={() => onSave({ ...sv, inventory: sv.inventory.filter((_, i) => i !== idx) })}
        />
      ))}
      {editable && adding && (
        <SurvivorItemForm draft={draft} setDraft={setDraft}
          onConfirm={handleAdd}
          onCancel={() => { setDraft(emptyDraft()); setAdding(false) }}
        />
      )}
      {editable && !adding && (
        <button className={styles.btnGhost} style={{ fontSize: 11, marginTop: 8 }} onClick={() => setAdding(true)}>
          + Adicionar item
        </button>
      )}
    </div>
  )
}

// ── SurvivorLoreTab ────────────────────────────────────────────────
export function SurvivorLoreTab({ sv, editable, isGM, onSave }: {
  sv: Survivor; editable: boolean; isGM?: boolean; onSave: (sv: Survivor) => void
}) {
  const DEFAULT_LORE: SurvivorLoreBlock[] = [
    { text: '', visible: false },
    { text: '', visible: false },
    { text: '', visible: false },
  ]
  const lore = sv.lore && sv.lore.length === 3 ? sv.lore : DEFAULT_LORE
  const LABELS = ['I', 'II', 'III']

  const updateBlock = (i: number, patch: Partial<SurvivorLoreBlock>) => {
    const next = lore.map((b, j) => j === i ? { ...b, ...patch } : b)
    onSave({ ...sv, lore: next })
  }

  const visibleBlocks = lore.filter(b => b.visible)

  if (!isGM && visibleBlocks.length === 0) {
    return (
      <div style={{ padding: '32px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', letterSpacing: '0.08em' }}>
        Nenhuma informação disponível.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
      {lore.map((block, i) => {
        if (!isGM && !block.visible) return null
        return (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-mute)', fontWeight: 700 }}>
                Informação {LABELS[i]}
              </span>
              {isGM && editable && (
                <button
                  onClick={() => updateBlock(i, { visible: !block.visible })}
                  style={{
                    padding: '3px 12px', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                    background: block.visible ? 'var(--teal)' : 'transparent',
                    border: '1px solid var(--teal)',
                    color: block.visible ? 'var(--paper)' : 'var(--teal)',
                    transition: 'all 0.15s',
                  }}>
                  {block.visible ? '● Visível' : '○ Oculto'}
                </button>
              )}
            </div>
            {isGM && editable ? (
              <textarea
                value={block.text}
                onChange={e => updateBlock(i, { text: e.target.value })}
                placeholder="Escreva aqui..."
                style={{
                  width: '100%', minHeight: 140, boxSizing: 'border-box',
                  padding: '12px 14px', borderRadius: 8, border: '1px solid var(--line)',
                  fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.65,
                  background: 'var(--paper)', color: 'var(--ink)', resize: 'vertical',
                  outline: 'none',
                }}
              />
            ) : (
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7,
                color: block.text ? 'var(--ink)' : 'var(--ink-mute)',
                whiteSpace: 'pre-wrap',
                padding: '12px 14px', borderRadius: 8,
                border: '1px solid var(--line-soft)',
                background: 'var(--paper-raised, var(--paper))',
              }}>
                {block.text || 'Sem conteúdo.'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── SurvivorView ───────────────────────────────────────────────────
export function SurvivorView({ sv, editable, isGM, onSave, state, wide = false }: {
  sv: Survivor; editable: boolean; isGM?: boolean
  onSave: (sv: Survivor) => void; state: AppState; wide?: boolean
}) {
  const [toast, setToast]           = useState<string | null>(null)
  const [showAddMerit, setShowAddMerit]   = useState(false)
  const [showAddSkill, setShowAddSkill]   = useState(false)
  const [passiveToggles, setPassiveToggles] = useState<Record<number, { active: boolean; x: number }>>({})

  const editAttr = (k: keyof SurvivorAttributes, v: number) =>
    onSave({ ...sv, attributes: { ...sv.attributes, [k]: Math.max(1, Math.min(5, v)) } })

  const editStatus = (patch: Partial<SurvivorStatus>) =>
    onSave({ ...sv, status: { ...sv.status, ...patch } as SurvivorStatus })

  const wildDigimons = (state.bestiary ?? []).filter(d => !d.tamerId)
  const svSkills = sv.survivorSkills ?? []

  const statusSection = (
    <>
      <SectionTitle>Status</SectionTitle>
      <div className={styles.statRow}>
        <div className={styles.statCell}>
          <span className={styles.statKey}>HP</span>
          {isGM && editable ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <input type="number" min={0} max={sv.status.HP.max} value={sv.status.HP.v}
                onChange={e => editStatus({ HP: { ...sv.status.HP, v: Math.max(0, Math.min(sv.status.HP.max, parseInt(e.target.value) || 0)) } })}
                className={styles.numInput} style={{ width: 44 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>/</span>
              <input type="number" min={1} max={30} value={sv.status.HP.max}
                onChange={e => editStatus({ HP: { ...sv.status.HP, max: Math.max(1, parseInt(e.target.value) || 1) } })}
                className={styles.numInput} style={{ width: 44 }} />
            </div>
          ) : (
            <span className={styles.statVal}>{sv.status.HP.v}/{sv.status.HP.max}</span>
          )}
        </div>
        <div className={styles.statCell}>
          <span className={styles.statKey}>Digisoul</span>
          {isGM && editable ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <input type="number" min={0} max={sv.status.Digisoul.max} value={sv.status.Digisoul.v}
                onChange={e => editStatus({ Digisoul: { ...sv.status.Digisoul, v: Math.max(0, Math.min(sv.status.Digisoul.max, parseInt(e.target.value) || 0)) } })}
                className={styles.numInput} style={{ width: 44 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>/</span>
              <input type="number" min={1} max={30} value={sv.status.Digisoul.max}
                onChange={e => editStatus({ Digisoul: { ...sv.status.Digisoul, max: Math.max(1, parseInt(e.target.value) || 1) } })}
                className={styles.numInput} style={{ width: 44 }} />
            </div>
          ) : (
            <span className={styles.statVal}>{sv.status.Digisoul.v}/{sv.status.Digisoul.max}</span>
          )}
        </div>
        <div className={styles.statCell}>
          <span className={styles.statKey}>Desl.</span>
          {isGM && editable ? (
            <input type="number" min={1} max={20} value={sv.status.Deslocamento}
              onChange={e => editStatus({ Deslocamento: Math.max(1, parseInt(e.target.value) || 1) })}
              className={styles.numInput} style={{ width: 44 }} />
          ) : (
            <span className={styles.statVal}>{sv.status.Deslocamento}</span>
          )}
        </div>
        <div className={styles.statCell}>
          <span className={styles.statKey}>Init.</span>
          {isGM && editable ? (
            <input type="number" min={0} max={20} value={sv.status.Iniciativa ?? 0}
              onChange={e => editStatus({ Iniciativa: Math.max(0, parseInt(e.target.value) || 0) })}
              className={styles.numInput} style={{ width: 44 }} />
          ) : (
            <span className={styles.statVal}>{sv.status.Iniciativa ?? 0}</span>
          )}
        </div>
      </div>
    </>
  )

  const attrSection = (
    <>
      <SectionTitle>Atributos</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {(['Poder', 'Refinamento', 'Resistência'] as (keyof SurvivorAttributes)[]).map(k => (
          <div key={k} className={styles.attrRow}>
            <span className={styles.attrName}>{k}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <ValueDisplay value={sv.attributes[k]} max={5} />
              {isGM && editable && (
                <>
                  <button onClick={() => editAttr(k, sv.attributes[k] + 1)} className={styles.attrFreeBtn} disabled={sv.attributes[k] >= 5}>+</button>
                  <button onClick={() => editAttr(k, sv.attributes[k] - 1)} className={styles.attrFreeBtn} disabled={sv.attributes[k] <= 1}>−</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )

  const skillsSection = (
    <>
      <SectionTitle>Perícias</SectionTitle>
      <SkillGrid
        skills={sv.skills}
        editable={!!(isGM && editable)}
        freeMode={isGM && editable}
        onFreeEdit={(cat, name, delta) =>
          onSave({ ...sv, skills: { ...sv.skills, [cat]: { ...sv.skills[cat], [name]: Math.max(0, Math.min(5, sv.skills[cat][name] + delta)) } } })
        }
      />
    </>
  )

  const survivorSkillsSection = (
    <>
      <SectionTitle action={editable && isGM && !showAddSkill && (
        <button className={styles.btnGhost} style={{ fontSize: 11 }} onClick={() => setShowAddSkill(true)}>+ Nova Skill</button>
      )}>Survivor Skills</SectionTitle>
      {svSkills.length === 0 && !showAddSkill && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', padding: '8px 0 12px' }}>Nenhuma skill.</div>
      )}
      {[...svSkills]
        .map((s, origIdx) => ({ s, origIdx }))
        .sort((a, b) => (a.s.type === 'passive' ? 1 : 0) - (b.s.type === 'passive' ? 1 : 0))
        .map(({ s, origIdx }) => (
          <SkillCard key={origIdx} s={s} editable={!!(isGM && editable)}
            onChange={sk => onSave({ ...sv, survivorSkills: svSkills.map((x, j) => j === origIdx ? sk as TamerSkill : x) })}
            onDelete={isGM && editable ? () => onSave({ ...sv, survivorSkills: svSkills.filter((_, j) => j !== origIdx) }) : undefined}
            onToggle={s.toggleBonus ? (active, x) =>
              setPassiveToggles(p => ({ ...p, [origIdx]: { active, x: x ?? 0 } }))
            : undefined}
            toggleActive={passiveToggles[origIdx]?.active ?? false}
            toggleX={passiveToggles[origIdx]?.x ?? 0}
          />
        ))
      }
      {showAddSkill && (
        <AddSkillForm isTamer onAdd={sk => { onSave({ ...sv, survivorSkills: [...svSkills, sk as TamerSkill] }); setShowAddSkill(false); setToast('Skill adicionada!') }} onCancel={() => setShowAddSkill(false)} />
      )}
    </>
  )

  const meritsSection = (
    <>
      <SectionTitle action={isGM && editable && !showAddMerit && (
        <button className={styles.btnGhost} style={{ fontSize: 11 }} onClick={() => setShowAddMerit(true)}>+ Mérito/Falha</button>
      )}>Méritos e Falhas</SectionTitle>
      {sv.merits.length === 0 && !showAddMerit && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', padding: '8px 0 12px' }}>Nenhum mérito ou falha.</div>
      )}
      {sv.merits.map((m, i) => (
        <MeritCard key={i} m={m} editable={!!(isGM && editable)}
          onDelete={isGM && editable ? () => onSave({ ...sv, merits: sv.merits.filter((_, j) => j !== i) }) : undefined}
          onChange={isGM && editable ? updated => onSave({ ...sv, merits: sv.merits.map((x, j) => j === i ? updated : x) }) : undefined}
        />
      ))}
      {showAddMerit && (
        <AddMeritForm
          onAdd={m => { onSave({ ...sv, merits: [...sv.merits, m] }); setShowAddMerit(false) }}
          onCancel={() => setShowAddMerit(false)}
        />
      )}
    </>
  )

  const mindLinkSection = (
    <>
      <SectionTitle>Mind Link</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 0' }}>
        {isGM && editable ? (
          <select
            value={sv.mindLink.digimonId ?? ''}
            onChange={e => onSave({ ...sv, mindLink: { ...sv.mindLink, digimonId: e.target.value || null } })}
            className={styles.formInput}
            style={{ flex: 1, minWidth: 160 }}>
            <option value="">— Nenhum —</option>
            {wildDigimons.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        ) : (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: sv.mindLink.digimonId ? 'var(--ink)' : 'var(--ink-mute)' }}>
            {sv.mindLink.digimonId
              ? (wildDigimons.find(d => d.id === sv.mindLink.digimonId)?.name ?? sv.mindLink.digimonId)
              : '— Nenhum —'}
          </span>
        )}
        {sv.mindLink.digimonId && (
          <button
            onClick={isGM && editable ? () => onSave({ ...sv, mindLink: { ...sv.mindLink, active: !sv.mindLink.active } }) : undefined}
            style={{
              padding: '4px 14px', borderRadius: 999,
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
              background: sv.mindLink.active ? 'var(--teal)' : 'transparent',
              border: '1px solid var(--teal)',
              color: sv.mindLink.active ? 'var(--paper)' : 'var(--teal)',
              cursor: isGM && editable ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}>
            {sv.mindLink.active ? '● Link Ativo' : '○ Link Inativo'}
          </button>
        )}
      </div>
    </>
  )

  const leftCol  = <>{statusSection}{attrSection}{skillsSection}</>
  const rightCol = <>{survivorSkillsSection}{meritsSection}{mindLinkSection}</>

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {isGM && (
        <>
          <SectionTitle>Informações</SectionTitle>
          <SurvivorInfoEditor sv={sv} onSave={s => { onSave(s); setToast('Info salva!') }} />
        </>
      )}
      {wide ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 48px', alignItems: 'start' }}>
          <div>{leftCol}</div>
          <div>{rightCol}</div>
        </div>
      ) : (
        <>{leftCol}{rightCol}</>
      )}
    </div>
  )
}
