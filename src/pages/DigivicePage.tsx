// src/pages/DigivicePage.tsx
// Interface do Digivice por usuário: ficha, inventário, records, mapas.
// GM vê todos os Digivices; player vê só o próprio.

import { useState, useEffect, lazy, Suspense } from 'react'
import type { AppState } from '../types'
import type { UserProfile } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { SheetModal } from '../components/Sheet'
import { GrainFill } from '../components/GrainFill'
import { listRevealedItemsFor } from '../lib/db'
import type { GMItem } from '../lib/db'

const GM_ITEM_TYPE_LABELS: Record<string, string> = {
  item: 'Item', weapon: 'Arma', accessory: 'Acessório', key: 'Chave',
}

// Itens revelados pelo GM ao dono — exibidos no Digivice (somente leitura).
function RevealedGMItems({ characterId }: { characterId: string | null }) {
  const [items, setItems] = useState<GMItem[]>([])
  useEffect(() => {
    let alive = true
    if (!characterId) { setItems([]); return }
    listRevealedItemsFor(characterId).then(list => { if (alive) setItems(list) })
    return () => { alive = false }
  }, [characterId])

  if (items.length === 0) return null
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 10 }}>
        Itens revelados pelo GM
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(it => (
          <div key={it.id} style={{ border: '1px solid var(--gold)', borderRadius: 8,
            padding: '10px 14px', background: 'rgba(231,212,163,0.10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase' }}>{it.name}</strong>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--gold)' }}>
                {GM_ITEM_TYPE_LABELS[it.item_type] ?? it.item_type}
              </span>
            </div>
            {it.description && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
                {it.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const MapPage = lazy(() => import('./MapPage'))

interface Props {
  state:   AppState
  onUpdate:(s: AppState) => void
  profile: UserProfile | null
  isGM:    boolean
}

const NPC_FECHADURA_IDS = new Set(['t-hare', 't-kanade', 't-shinra', 't-kumo', 't-hibito', 't-emi'])

// NPCs Fechadura — têm Digivice mas não são tamers no AppState
const NPC_FECHADURA = [
  { id: 't-hare',   name: 'Hare',   portrait: 'rose'   },
  { id: 't-kanade', name: 'Kanade', portrait: 'gold'   },
  { id: 't-shinra', name: 'Shinra', portrait: 'indigo' },
  { id: 't-kumo',   name: 'Kumo',   portrait: 'black'  },
  { id: 't-emi',    name: 'Emi',    portrait: 'coral'  },
  { id: 't-hibito', name: 'Hibito', portrait: 'orange' },
]

function charName(state: AppState, id: string): string {
  const tamer = state.tamers.find(t => t.id === id)
  if (tamer) return tamer.name
  return NPC_FECHADURA.find(n => n.id === id)?.name ?? id
}
function charPortrait(state: AppState, id: string): string {
  const tamer = state.tamers.find(t => t.id === id)
  if (tamer) return tamer.portrait
  return NPC_FECHADURA.find(n => n.id === id)?.portrait ?? 'sage'
}

interface InventoryItem {
  id:          string
  name:        string
  type:        'item' | 'weapon' | 'accessory' | 'key'
  description: string
  quantity:    number
  effects:     string
  gm_only:     boolean
}

interface DigiRecord {
  id:         string
  type:       'document' | 'photo' | 'chat'
  title:      string
  content:    string
  image_path: string | null
  session:    number | null
}

interface DigiMap {
  id:         string
  title:      string
  image_path: string | null
  notes:      string
}

interface Digivice {
  id:              string
  character_id:    string
  kind:            'chave' | 'fechadura'
  memory_current:  number
  memory_max:      number
  authority:       number
  device_status:   'active' | 'charging' | 'sleeping'
  trailmon_tickets:number
  inventory:       InventoryItem[]
  records:         DigiRecord[]
  maps:            DigiMap[]
}

const EMPTY_DIGIVICE: Omit<Digivice, 'id' | 'character_id'> = {
  kind: 'chave', memory_current: 3, memory_max: 10,
  authority: 0, device_status: 'active', trailmon_tickets: 5,
  inventory: [], records: [], maps: [],
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useDigivice(characterId: string | null) {
  const [digivice, setDigivice] = useState<Digivice | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!characterId || !supabase) { setLoading(false); return }

    supabase.from('digivices')
      .select('*')
      .eq('character_id', characterId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDigivice({
            ...data,
            inventory: data.inventory ?? [],
            records:   data.records   ?? [],
            maps:      data.maps      ?? [],
          } as Digivice)
        } else {
          setDigivice(null)
        }
        setLoading(false)
      })
  }, [characterId])

  const save = async (patch: Partial<Digivice>) => {
    if (!supabase || !characterId) return
    const updated = { ...EMPTY_DIGIVICE, ...digivice, ...patch } as Digivice
    setDigivice(updated)

    if (updated.id) {
      await supabase.from('digivices').update(patch).eq('id', updated.id)
    } else {
      const { data } = await supabase.from('digivices')
        .insert({ character_id: characterId, ...EMPTY_DIGIVICE, ...patch })
        .select('*').single()
      if (data) setDigivice({
        ...data,
        inventory: data.inventory ?? [],
        records:   data.records   ?? [],
        maps:      data.maps      ?? [],
      } as Digivice)
    }
  }

  return { digivice, loading, save }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type DigiTab = 'ficha' | 'inventario' | 'records' | 'mapas'

// ── Inventário ────────────────────────────────────────────────────────────────

function InventoryTab({ items, isGM, onSave }: {
  items:  InventoryItem[]
  isGM:   boolean
  onSave: (items: InventoryItem[]) => void
}) {
  const [adding,    setAdding]    = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft]         = useState<Partial<InventoryItem>>({
    name: '', type: 'item', description: '', quantity: 1, effects: '', gm_only: false,
  })
  const [editDraft, setEditDraft] = useState<InventoryItem | null>(null)

  const startEdit = (item: InventoryItem) => {
    setEditDraft({ ...item })
    setEditingId(item.id)
    setAdding(false)
  }
  const confirmEdit = () => {
    if (!editDraft || !editDraft.name.trim()) return
    onSave(items.map(i => i.id === editingId ? editDraft : i))
    setEditingId(null)
    setEditDraft(null)
  }
  const cancelEdit = () => { setEditingId(null); setEditDraft(null) }

  const visible = isGM ? items : items.filter(i => !i.gm_only)

  const addItem = () => {
    if (!draft.name?.trim()) return
    const newItem: InventoryItem = {
      id:          `item-${Date.now().toString(36)}`,
      name:        draft.name.trim(),
      type:        draft.type ?? 'item',
      description: draft.description ?? '',
      quantity:    draft.quantity ?? 1,
      effects:     draft.effects ?? '',
      gm_only:     draft.gm_only ?? false,
    }
    onSave([...items, newItem])
    setDraft({ name: '', type: 'item', description: '', quantity: 1, effects: '', gm_only: false })
    setAdding(false)
  }

  const removeItem = (id: string) => onSave(items.filter(i => i.id !== id))
  const updateQty  = (id: string, delta: number) =>
    onSave(items.map(i => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))

  const TYPE_COLOR: Record<string, string> = {
    item: 'var(--ink-mute)', weapon: 'var(--coral)',
    accessory: 'var(--teal)', key: 'var(--gold)',
  }

  if (visible.length === 0 && !adding) return (
    <div>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
        fontSize: 16, color: 'var(--ink-mute)', padding: '32px 0', textAlign: 'center' }}>
        ~ inventário vazio ~
      </div>
      {isGM && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => setAdding(true)}
            style={btnStyle}>+ Adicionar item</button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {visible.map(item => {
          if (isGM && editingId === item.id && editDraft) {
            return (
              <div key={item.id} style={{ border: '1px solid var(--line)', borderRadius: 10,
                padding: '16px', background: 'var(--paper-deep)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 8, marginBottom: 8 }}>
                  <input value={editDraft.name}
                    onChange={e => setEditDraft(d => d && ({ ...d, name: e.target.value }))}
                    placeholder="Nome do item *" style={inputStyle} />
                  <select value={editDraft.type}
                    onChange={e => setEditDraft(d => d && ({ ...d, type: e.target.value as any }))}
                    style={inputStyle}>
                    <option value="item">Item</option>
                    <option value="weapon">Arma</option>
                    <option value="accessory">Acessório</option>
                    <option value="key">Chave</option>
                  </select>
                  <input type="number" min={0} value={editDraft.quantity}
                    onChange={e => setEditDraft(d => d && ({ ...d, quantity: parseInt(e.target.value)||0 }))}
                    style={inputStyle} />
                </div>
                <input value={editDraft.description}
                  onChange={e => setEditDraft(d => d && ({ ...d, description: e.target.value }))}
                  placeholder="Descrição" style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
                <input value={editDraft.effects}
                  onChange={e => setEditDraft(d => d && ({ ...d, effects: e.target.value }))}
                  placeholder="Efeitos" style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)',
                  letterSpacing: '0.08em', marginBottom: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editDraft.gm_only}
                    onChange={e => setEditDraft(d => d && ({ ...d, gm_only: e.target.checked }))} />
                  Visível apenas para o GM
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={confirmEdit} style={{ ...btnStyle, background: 'var(--ink)',
                    color: 'var(--paper)', borderColor: 'var(--ink)' }}>Salvar</button>
                  <button onClick={cancelEdit} style={btnStyle}>Cancelar</button>
                </div>
              </div>
            )
          }

          return (
            <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '12px 16px', background: 'var(--paper)',
              border: `1px solid ${item.gm_only ? 'var(--coral)' : 'var(--line)'}`,
              borderRadius: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15,
                    textTransform: 'uppercase' }}>{item.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    padding: '1px 7px', borderRadius: 999,
                    background: 'var(--paper-deep)', color: TYPE_COLOR[item.type] }}>
                    {item.type}
                  </span>
                  {item.gm_only && isGM && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '1px 7px', borderRadius: 999,
                      background: 'rgba(196,51,33,0.1)', color: 'var(--coral)' }}>
                      GM only
                    </span>
                  )}
                </div>
                {item.description && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4 }}>
                    {item.description}
                  </div>
                )}
                {item.effects && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--teal)', letterSpacing: '0.04em' }}>
                    {item.effects}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button onClick={() => updateQty(item.id, -1)} style={miniBtn}>−</button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14,
                  fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                  {item.quantity}
                </span>
                <button onClick={() => updateQty(item.id, +1)} style={miniBtn}>+</button>
                {isGM && (
                  <>
                    <button onClick={() => startEdit(item)}
                      style={{ ...miniBtn, marginLeft: 4 }} title="Editar">✎</button>
                    <button onClick={() => removeItem(item.id)}
                      style={{ ...miniBtn, color: 'var(--coral)', borderColor: 'var(--coral)' }}>×</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isGM && !adding && (
        <button onClick={() => setAdding(true)} style={btnStyle}>+ Adicionar item</button>
      )}

      {adding && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10,
          padding: '16px', background: 'var(--paper-deep)', marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 8, marginBottom: 8 }}>
            <input value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
              placeholder="Nome do item *" style={inputStyle} />
            <select value={draft.type} onChange={e => setDraft(p => ({ ...p, type: e.target.value as any }))}
              style={inputStyle}>
              <option value="item">Item</option>
              <option value="weapon">Arma</option>
              <option value="accessory">Acessório</option>
              <option value="key">Chave</option>
            </select>
            <input type="number" min={1} value={draft.quantity}
              onChange={e => setDraft(p => ({ ...p, quantity: parseInt(e.target.value)||1 }))}
              style={inputStyle} placeholder="Qtd" />
          </div>
          <input value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))}
            placeholder="Descrição" style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
          <input value={draft.effects} onChange={e => setDraft(p => ({ ...p, effects: e.target.value }))}
            placeholder="Efeitos (ex: +1 dado para ataques)" style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)',
            letterSpacing: '0.08em', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.gm_only}
              onChange={e => setDraft(p => ({ ...p, gm_only: e.target.checked }))} />
            Visível apenas para o GM
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addItem} style={{ ...btnStyle, background: 'var(--ink)',
              color: 'var(--paper)', borderColor: 'var(--ink)' }}>Adicionar</button>
            <button onClick={() => setAdding(false)} style={btnStyle}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Records ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id:           string
  sender_id:    string
  content:      string
  survival_day: number | null
  sent_at_time: string | null
  created_at:   string
}

function RecordsTab({ records, isGM, onSave, state }: {
  records: DigiRecord[]
  isGM:    boolean
  onSave:  (records: DigiRecord[]) => void
  state:   AppState
}) {
  const [adding, setAdding]           = useState(false)
  const [viewing, setViewing]         = useState<DigiRecord | null>(null)
  const [viewingChat, setViewingChat] = useState<DigiRecord | null>(null)
  const [filter, setFilter]           = useState<'all' | 'document' | 'photo' | 'chat'>('all')
  const [sortDesc, setSortDesc]       = useState(true)
  const [draft, setDraft]             = useState<Partial<DigiRecord>>({
    type: 'document', title: '', content: '', session: null, image_path: null,
  })

  const bySession = (a: DigiRecord, b: DigiRecord) => {
    const sa = a.session ?? -Infinity, sb = b.session ?? -Infinity
    return sortDesc ? sb - sa : sa - sb
  }
  const chatRecords  = records.filter(r => r.type === 'chat').sort(bySession)
  const otherRecords = records
    .filter(r => r.type !== 'chat' && (filter === 'all' || r.type === filter))
    .sort(bySession)
  const showChat  = filter === 'all' || filter === 'chat'
  const showOther = filter === 'all' || filter === 'document' || filter === 'photo'

  const addRecord = () => {
    if (!draft.title?.trim()) return
    const rec: DigiRecord = {
      id:         `rec-${Date.now().toString(36)}`,
      type:       draft.type ?? 'document',
      title:      draft.title.trim(),
      content:    draft.content ?? '',
      image_path: draft.image_path ?? null,
      session:    draft.session ?? null,
    }
    onSave([...records, rec])
    setDraft({ type: 'document', title: '', content: '', session: null, image_path: null })
    setAdding(false)
  }

  return (
    <div>
      {/* Toolbar: filtro por tipo + ordenação por sessão */}
      {records.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {([
            ['all', 'Todos'], ['document', 'Documentos'], ['photo', 'Fotos'], ['chat', 'Conversas'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              style={{ padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                border: `1px solid ${filter === id ? 'var(--ink)' : 'var(--line)'}`,
                background: filter === id ? 'var(--ink)' : 'transparent',
                color: filter === id ? 'var(--paper)' : 'var(--ink-mute)' }}>
              {label}
            </button>
          ))}
          <button onClick={() => setSortDesc(d => !d)} title="Ordenar por sessão"
            style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', border: '1px solid var(--line)',
              background: 'transparent', color: 'var(--ink-soft)' }}>
            Sessão {sortDesc ? '↓' : '↑'}
          </button>
        </div>
      )}

      {/* Conversas Arquivadas */}
      {showChat && chatRecords.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 10,
            paddingBottom: 6, borderBottom: '1px solid var(--line-soft)' }}>
            Conversas Arquivadas
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chatRecords.map(rec => {
              const msgs: ChatMessage[] = (() => {
                try { return JSON.parse(rec.content) as ChatMessage[] } catch { return [] }
              })()
              return (
                <div key={rec.id} onClick={() => setViewingChat(rec)}
                  style={{ padding: '12px 16px', background: 'var(--paper)',
                    border: '1px solid var(--line)', borderRadius: 10,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
                  <span style={{ fontSize: 20 }}>💬</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 14,
                      textTransform: 'uppercase' }}>{rec.title}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--ink-mute)', marginTop: 2 }}>
                      {msgs.length} mensagem{msgs.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {isGM && (
                    <button onClick={e => {
                      e.stopPropagation()
                      onSave(records.filter(r => r.id !== rec.id))
                    }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--coral)', fontSize: 18, padding: '2px 6px' }}>×</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: showOther ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))',
        gap: 10, marginBottom: 16 }}>
        {otherRecords.map(rec => (
          <div key={rec.id} onClick={() => setViewing(rec)}
            style={{ padding: '14px 16px', background: 'var(--paper)',
              border: '1px solid var(--line)', borderRadius: 10,
              cursor: 'pointer', transition: 'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: rec.type === 'document' ? 'var(--teal)' : 'var(--orange)',
              marginBottom: 6 }}>
              {rec.type === 'document' ? '📄 Documento' : '📷 Foto'}
              {rec.session && ` · Sessão ${rec.session}`}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14,
              textTransform: 'uppercase' }}>{rec.title}</div>
            {rec.content && (
              <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 6,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {rec.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {isGM && !adding && (
        <button onClick={() => setAdding(true)} style={btnStyle}>+ Novo Record</button>
      )}

      {adding && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10,
          padding: '16px', background: 'var(--paper-deep)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginBottom: 8 }}>
            <input value={draft.title} onChange={e => setDraft(p => ({ ...p, title: e.target.value }))}
              placeholder="Título *" style={inputStyle} />
            <select value={draft.type} onChange={e => setDraft(p => ({ ...p, type: e.target.value as any }))}
              style={inputStyle}>
              <option value="document">Documento</option>
              <option value="photo">Foto</option>
            </select>
            <input type="number" min={1} value={draft.session ?? ''}
              onChange={e => setDraft(p => ({ ...p, session: parseInt(e.target.value)||null }))}
              style={inputStyle} placeholder="Sessão" />
          </div>
          <textarea value={draft.content} onChange={e => setDraft(p => ({ ...p, content: e.target.value }))}
            placeholder="Conteúdo do documento..." rows={4}
            style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: 8 }} />
          {draft.type === 'photo' && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)',
                marginBottom: 4 }}>Imagem da foto</label>
              <input type="file" accept="image/*"
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader()
                  r.onload = ev => setDraft(p => ({ ...p, image_path: ev.target?.result as string }))
                  r.readAsDataURL(f)
                }} />
              {draft.image_path && (
                <img src={draft.image_path} alt="preview"
                  style={{ marginTop: 8, maxWidth: '100%', maxHeight: 200,
                    borderRadius: 8, border: '1px solid var(--line)' }} />
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addRecord} style={{ ...btnStyle, background: 'var(--ink)',
              color: 'var(--paper)', borderColor: 'var(--ink)' }}>Adicionar</button>
            <button onClick={() => setAdding(false)} style={btnStyle}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal de visualização de documento/foto */}
      {viewing && (
        <div className="modal-back" onClick={() => setViewing(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <button className="closeBtn" onClick={() => setViewing(null)}
              style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36,
                borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)',
                cursor: 'pointer', fontSize: 18 }}>×</button>
            <div style={{ padding: '28px 32px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: viewing.type === 'document' ? 'var(--teal)' : 'var(--orange)',
                marginBottom: 8 }}>
                {viewing.type === 'document' ? '📄 Documento' : '📷 Foto'}
                {viewing.session && ` · Sessão ${viewing.session}`}
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
                textTransform: 'uppercase', margin: '0 0 16px' }}>{viewing.title}</h2>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15,
                color: 'var(--ink-soft)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {viewing.content || (viewing.type === 'photo' ? '' : '~ sem conteúdo ~')}
              </div>
              {viewing.image_path && (
                <img src={viewing.image_path} alt={viewing.title}
                  style={{ marginTop: 16, maxWidth: '100%', borderRadius: 10,
                    border: '1px solid var(--line)' }} />
              )}
              {isGM && (
                <button onClick={() => { onSave(records.filter(r => r.id !== viewing.id)); setViewing(null) }}
                  style={{ marginTop: 20, ...btnStyle, color: 'var(--coral)', borderColor: 'var(--coral)' }}>
                  Remover record
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de visualização de conversa arquivada */}
      {viewingChat && (
        <div className="modal-back" onClick={() => setViewingChat(null)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingChat(null)}
              style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36,
                borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)',
                cursor: 'pointer', fontSize: 18 }}>×</button>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid var(--line-soft)',
              flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 4 }}>
                💬 Conversa Arquivada
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20,
                textTransform: 'uppercase', margin: 0 }}>{viewingChat.title}</h2>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px',
              display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                const msgs: ChatMessage[] = (() => {
                  try { return JSON.parse(viewingChat.content) as ChatMessage[] } catch { return [] }
                })()
                return msgs.map(msg => {
                  const t = state.tamers.find(t => t.id === msg.sender_id)
                  const name = t?.name ?? msg.sender_id
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: 'var(--ink-mute)' }}>
                        {name}
                        {msg.survival_day && ` · Dia ${msg.survival_day}`}
                        {msg.sent_at_time && ` · ${msg.sent_at_time}`}
                      </div>
                      <div style={{ padding: '8px 12px', borderRadius: '4px 14px 14px 14px',
                        background: 'var(--paper-deep)', border: '1px solid var(--line-soft)',
                        fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.55,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Mapas ─────────────────────────────────────────────────────────────────────

function MapsTab({ maps, isGM, onSave }: {
  maps:   DigiMap[]
  isGM:   boolean
  onSave: (maps: DigiMap[]) => void
}) {
  const [mapMode, setMapMode] = useState<'pessoal' | 'mundo'>('pessoal')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft]   = useState({ title: '', notes: '', image_path: '' })
  const [viewing, setViewing] = useState<DigiMap | null>(null)

  const addMap = () => {
    if (!draft.title.trim()) return
    const m: DigiMap = {
      id:         `map-${Date.now().toString(36)}`,
      title:      draft.title.trim(),
      image_path: draft.image_path || null,
      notes:      draft.notes,
    }
    onSave([...maps, m])
    setDraft({ title: '', notes: '', image_path: '' })
    setAdding(false)
  }

  return (
    <div>
      {/* Toggle Pessoal / Mundo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(['pessoal', 'mundo'] as const).map(mode => (
          <button key={mode} onClick={() => setMapMode(mode)}
            style={{ padding: '7px 18px', borderRadius: 999, border: 'none',
              background: mapMode === mode ? 'var(--ink)' : 'var(--paper-deep)',
              color: mapMode === mode ? 'var(--paper)' : 'var(--ink-soft)',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
              letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {mode === 'pessoal' ? 'Pessoal' : 'Mundo'}
          </button>
        ))}
      </div>

      {/* ── Mundo: MapPage embarcado ── */}
      {mapMode === 'mundo' && (
        <Suspense fallback={
          <div style={{ padding: '40px 0', textAlign: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '0.12em' }}>
            Carregando...
          </div>
        }>
          <MapPage isGM={isGM} />
        </Suspense>
      )}

      {/* ── Pessoal: galeria original ── */}
      {mapMode === 'pessoal' && (<>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))',
        gap: 10, marginBottom: 16 }}>
        {maps.map(m => (
          <div key={m.id} onClick={() => setViewing(m)}
            style={{ aspectRatio: '4/3', background: m.image_path ? 'transparent' : 'var(--paper-deep)',
              border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer',
              overflow: 'hidden', position: 'relative', transition: 'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
            {m.image_path ? (
              <>
                <img src={m.image_path} alt={m.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(to top, rgba(26,24,20,0.85) 0%, transparent 100%)',
                  padding: '20px 12px 10px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 12,
                    textTransform: 'uppercase', color: '#f6f2e9' }}>{m.title}</div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', padding: 16, textAlign: 'center' }}>
                <span style={{ fontSize: 28, marginBottom: 8 }}>🗺</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13,
                  textTransform: 'uppercase' }}>{m.title}</div>
                {m.notes && (
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>{m.notes}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {isGM && !adding && (
        <button onClick={() => setAdding(true)} style={btnStyle}>+ Novo Mapa</button>
      )}

      {adding && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10,
          padding: '16px', background: 'var(--paper-deep)' }}>
          <input value={draft.title} onChange={e => setDraft(p => ({ ...p, title: e.target.value }))}
            placeholder="Título do mapa *" style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
          <input value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))}
            placeholder="Notas" style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)',
              marginBottom: 4 }}>Imagem do mapa</label>
            <input type="file" accept="image/*"
              onChange={e => {
                const f = e.target.files?.[0]; if (!f) return
                const r = new FileReader()
                r.onload = ev => setDraft(p => ({ ...p, image_path: ev.target?.result as string }))
                r.readAsDataURL(f)
              }} />
            {draft.image_path && (
              <img src={draft.image_path} alt="preview"
                style={{ marginTop: 8, maxWidth: '100%', maxHeight: 160,
                  borderRadius: 8, border: '1px solid var(--line)' }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addMap} style={{ ...btnStyle, background: 'var(--ink)',
              color: 'var(--paper)', borderColor: 'var(--ink)' }}>Adicionar</button>
            <button onClick={() => setAdding(false)} style={btnStyle}>Cancelar</button>
          </div>
        </div>
      )}

      {viewing && (
        <div className="modal-back" onClick={() => setViewing(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '28px 32px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
                textTransform: 'uppercase', margin: '0 0 8px' }}>{viewing.title}</h2>
              {viewing.notes && (
                <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 16 }}>
                  {viewing.notes}
                </div>
              )}
              {!viewing.image_path && (
                <div style={{ padding: '48px', textAlign: 'center',
                  border: '1px dashed var(--line)', borderRadius: 10,
                  fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                  color: 'var(--ink-mute)' }}>
                  ~ imagem do mapa não carregada ~
                </div>
              )}
              {viewing.image_path && (
                <img src={viewing.image_path} alt={viewing.title}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setViewing(null)} style={btnStyle}>Fechar</button>
                {isGM && (
                  <button onClick={() => { onSave(maps.filter(m => m.id !== viewing.id)); setViewing(null) }}
                    style={{ ...btnStyle, color: 'var(--coral)', borderColor: 'var(--coral)' }}>
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </>)} {/* fim mapMode === 'pessoal' */}
    </div>
  )
}

// ── DigivicePage ──────────────────────────────────────────────────────────────

export default function DigivicePage({ state, onUpdate, profile, isGM }: Props) {
  const [tab, setTab] = useState<DigiTab>('ficha')
  const [sheetOpen, setSheetOpen] = useState(false)

  // GM pode escolher qual personagem ver; player vê o próprio
  const [viewingCharId, setViewingCharId] = useState<string | null>(
    isGM ? (state.tamers[0]?.id ?? null) : (profile?.tamer_id ?? null)
  )

  const { digivice, loading, save } = useDigivice(viewingCharId)

  const tamer = state.tamers.find(t => t.id === viewingCharId)
  const digimon = tamer?.digimonId
    ? state.bestiary.find(d => d.id === tamer.digimonId)
    : null

  const canEdit = isGM || profile?.tamer_id === viewingCharId

  const TABS: { id: DigiTab; label: string }[] = [
    { id: 'ficha',     label: 'Ficha'      },
    { id: 'inventario',label: 'Inventário' },
    { id: 'records',   label: 'Records'    },
    { id: 'mapas',     label: 'Mapas'      },
  ]

  if (!supabase) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center',
        fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18,
        color: 'var(--ink-mute)' }}>
        ~ O Digivice requer o Supabase configurado ~
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '28px var(--page-pad-x) 0', display: 'flex', alignItems: 'flex-end',
        gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42,
            textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            Digivice
          </h1>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
            fontSize: 18, color: 'var(--ink-soft)' }}>
            ~ {viewingCharId ? charName(state, viewingCharId) : 'sem personagem vinculado'} ~
          </div>
        </div>

        {/* Seletor de personagem (só GM vê) */}
        {isGM && (
          <select value={viewingCharId ?? ''} onChange={e => setViewingCharId(e.target.value || null)}
            style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px',
              fontFamily: 'var(--font-body)', fontSize: 14, background: 'var(--paper)',
              color: 'var(--ink)' }}>
            <option value="">— escolher personagem —</option>
            <optgroup label="PCs">
              {state.tamers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
            <optgroup label="NPCs Fechadura">
              {NPC_FECHADURA.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </optgroup>
          </select>
        )}
      </div>

      {/* Status bar do Digivice */}
      {digivice && (
        <div style={{ padding: '14px var(--page-pad-x)', borderBottom: '1px solid var(--line-soft)', marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>

            {/* Memory */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', minWidth: 52 }}>Memory</span>
              <button onClick={() => save({ memory_current: Math.max(-3, digivice.memory_current - 1) })}
                style={miniStatusBtn}>−</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
                minWidth: 24, textAlign: 'center',
                color: digivice.memory_current < 0 ? 'var(--coral)' : 'var(--ink)' }}>
                {digivice.memory_current}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
                /{digivice.memory_max}
              </span>
              <button onClick={() => save({ memory_current: Math.min(digivice.memory_max, digivice.memory_current + 1) })}
                style={miniStatusBtn}>+</button>
              {/* Reset Memory para 3 (Charge in battle) */}
              {digivice.kind === 'chave' && (
                <button onClick={() => save({ memory_current: 3 })}
                  title="Charge: setar Memory para 3"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999,
                    border: '1px solid var(--teal)', background: 'transparent',
                    color: 'var(--teal)', cursor: 'pointer' }}>
                  ⚡ Charge
                </button>
              )}
            </div>

            {/* Autoridade — só Digivice Chave */}
            {digivice.kind === 'chave' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--ink-mute)', minWidth: 68 }}>Autoridade</span>
                <button onClick={() => save({ authority: Math.max(0, digivice.authority - 1) })}
                  style={miniStatusBtn}>−</button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700 }}>
                  {digivice.authority}
                </span>
                <button onClick={() => save({ authority: digivice.authority + 1 })}
                  style={miniStatusBtn}>+</button>
              </div>
            )}

            {/* Tickets Trailmon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', minWidth: 52 }}>Tickets</span>
              <button onClick={() => save({ trailmon_tickets: Math.max(0, digivice.trailmon_tickets - 1) })}
                style={miniStatusBtn}>−</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700 }}>
                {digivice.trailmon_tickets}
              </span>
              <button onClick={() => save({ trailmon_tickets: Math.min(5, digivice.trailmon_tickets + 1) })}
                style={miniStatusBtn}>+</button>
              <button onClick={() => save({ trailmon_tickets: 5 })}
                title="Resetar tickets para 5"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 7px',
                  borderRadius: 999, border: '1px solid var(--line)', background: 'transparent',
                  color: 'var(--ink-mute)', cursor: 'pointer' }}>↺</button>
            </div>

            {/* Status do dispositivo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              {(['active','charging','sleeping'] as const).map(st => (
                <button key={st} onClick={() => save({ device_status: st })}
                  style={{ padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    border: `1px solid ${digivice.device_status === st ? 'var(--ink)' : 'var(--line)'}`,
                    background: digivice.device_status === st ? 'var(--ink)' : 'transparent',
                    color: digivice.device_status === st ? 'var(--paper)' : 'var(--ink-mute)' }}>
                  {{ active: 'Ativo', charging: 'Carregando', sleeping: 'Dormindo' }[st]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)',
        padding: '0 var(--page-pad-x)', marginTop: 8, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '12px 20px', border: 'none', background: 'transparent',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em',
              textTransform: 'uppercase', cursor: 'pointer',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-mute)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--coral)' : 'transparent'}` }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ padding: '24px var(--page-pad-x)' }}>
        {loading ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)' }}>
            Carregando...
          </div>
        ) : !viewingCharId ? (
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
            fontSize: 18, color: 'var(--ink-mute)', textAlign: 'center', padding: '48px 0' }}>
            ~ selecione um personagem ~
          </div>
        ) : (
          <>
            {tab === 'ficha' && (
              tamer ? (
              <div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 80, height: 80, borderRadius: 14, overflow: 'hidden',
                    flexShrink: 0, position: 'relative' }}>
                    <GrainFill color={tamer.portrait} image={tamer.image} />
                  </div>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
                      textTransform: 'uppercase', margin: '0 0 4px' }}>{tamer.name}</h2>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: 'var(--ink-mute)', letterSpacing: '0.08em' }}>
                      {tamer.age} anos · {tamer.sign} · {tamer.height} cm
                    </div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                      fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>
                      ~ {tamer.tagline} ~
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'HP', value: `${tamer.status.HP.v}/${tamer.status.HP.max}` },
                    { label: 'Memory', value: `${tamer.status.Memory.v}/${tamer.status.Memory.max}` },
                    { label: 'Digisoul', value: `${tamer.status.Digisoul.v}/${tamer.status.Digisoul.max}` },
                    { label: 'Deslocamento', value: tamer.status.Deslocamento },
                    ...(!NPC_FECHADURA_IDS.has(tamer.id) ? [{ label: 'Autoridade', value: tamer.status.Autoridade }] : []),
                    { label: 'Iniciativa', value: tamer.status.Iniciativa },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '10px 14px', background: 'var(--paper-deep)',
                      border: '1px solid var(--line-soft)', borderRadius: 8, textAlign: 'center',
                      fontFamily: 'var(--font-mono)' }}>
                      <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: 'var(--ink-mute)', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setSheetOpen(true)} style={{ ...btnStyle,
                  background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }}>
                  Abrir ficha completa
                </button>
                {digimon && (
                  <div style={{ marginTop: 24, padding: '16px', background: 'var(--paper-deep)',
                    border: '1px solid var(--line-soft)', borderRadius: 10 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      color: 'var(--ink-mute)', marginBottom: 10 }}>Digimon parceiro</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18,
                      textTransform: 'uppercase' }}>{digimon.name.replace(' Line', '')}</div>
                  </div>
                )}
              </div>
            ) : viewingCharId ? (
              // NPC Fechadura — sem ficha no AppState
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: 14, overflow: 'hidden',
                  flexShrink: 0, position: 'relative' }}>
                  <GrainFill color={charPortrait(state, viewingCharId)} />
                </div>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
                    textTransform: 'uppercase', margin: '0 0 4px' }}>
                    {charName(state, viewingCharId)}
                  </h2>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--ink-mute)', letterSpacing: '0.08em' }}>NPC · Digivice Fechadura</div>
                </div>
              </div>
            ) : null
            )}

            {tab === 'inventario' && digivice && (
              <>
                <InventoryTab
                  items={digivice.inventory}
                  isGM={canEdit}
                  onSave={items => save({ inventory: items })}
                />
                <RevealedGMItems characterId={viewingCharId} />
              </>
            )}

            {tab === 'records' && digivice && (
              <RecordsTab
                records={digivice.records}
                isGM={canEdit}
                onSave={records => save({ records })}
                state={state}
              />
            )}

            {tab === 'mapas' && digivice && (
              <MapsTab
                maps={digivice.maps}
                isGM={canEdit}
                onSave={maps => save({ maps })}
              />
            )}

            {!digivice && !loading && (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                  fontSize: 16, color: 'var(--ink-mute)', marginBottom: 16 }}>
                  ~ Digivice não inicializado para este personagem ~
                </div>
                {canEdit && (
                  <button onClick={() => save({})} style={{ ...btnStyle,
                    background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }}>
                    Inicializar Digivice
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {sheetOpen && tamer && (
        <SheetModal
          subject={{ kind: 'tamer', id: tamer.id }}
          state={state}
          onSaveState={onUpdate}
          onClose={() => setSheetOpen(false)}
          editable={canEdit}
          isGM={isGM}
        />
      )}
    </div>
  )
}

// ── Estilos inline reutilizáveis ──────────────────────────────────────────────

const miniStatusBtn: React.CSSProperties = {
  width: 22, height: 22, borderRadius: '50%',
  border: '1.5px solid var(--line)', background: 'transparent',
  cursor: 'pointer', fontSize: 14, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--ink-soft)', flexShrink: 0,
}

const btnStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 999, cursor: 'pointer',
  border: '1px solid var(--line)', background: 'transparent',
  color: 'var(--ink-soft)', fontFamily: 'var(--font-body)',
  fontWeight: 600, fontSize: 13, transition: 'all 0.12s',
}

const miniBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: '50%',
  border: '1.5px solid var(--line)', background: 'transparent',
  cursor: 'pointer', fontSize: 14, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--ink-soft)',
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 8,
  padding: '7px 12px', fontFamily: 'var(--font-body)',
  fontSize: 14, background: 'var(--paper)', color: 'var(--ink)',
}