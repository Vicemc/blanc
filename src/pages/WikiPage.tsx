import React, { useState, useEffect } from 'react'
import { useSettings } from '../lib/settings'
import { useAuth } from '../components/AuthProvider'
import type { AppState } from '../types'
import type { WikiPage as WikiPageType, WikiPageEdit, WikiRelation, WikiCategory, WikiVisibility } from '../types/wiki'
import { WIKI_CATEGORIES } from '../types/wiki'
import { listWikiPages, listWikiRelations, submitWikiPage, submitWikiPageEdit, listMyPendingEdits } from '../lib/db/wiki'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import WikiGraph from '../components/wiki/WikiGraph'

interface Props {
  state:  AppState
  isGM:   boolean
}

type ViewMode = 'lista' | 'grafo'
type PlayerModal = { kind: 'new' } | { kind: 'edit'; page: WikiPageType }

function parseMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/\n/g, '<br />')
}

function AvatarCircle({ url, name, size = 64 }: { url: string | null; name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      background: 'var(--paper-deep)', border: '1.5px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {url ? (
        <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.38, color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
          {name.charAt(0)}
        </span>
      )}
    </div>
  )
}

// ── Modal de contribuição do player ──────────────────────────────────────────

interface PlayerContribModalProps {
  mode:          PlayerModal
  onSubmitEdit:  (d: { title: string; body: string; category: WikiCategory }) => void
  onSubmitNew:   (d: { title: string; body: string; category: WikiCategory }) => void
  onClose:       () => void
  submitted:     boolean
}

function PlayerContribModal({ mode, onSubmitEdit, onSubmitNew, onClose, submitted }: PlayerContribModalProps) {
  const isEdit = mode.kind === 'edit'
  const initial = isEdit ? mode.page : null
  const [title,    setTitle]    = useState(initial?.title    ?? '')
  const [category, setCategory] = useState<WikiCategory>(initial?.category ?? 'humanos')
  const [body,     setBody]     = useState(initial?.body     ?? '')
  const [saving,   setSaving]   = useState(false)

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--line)',
    borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)',
    fontFamily: 'var(--font-body)', fontSize: 13, boxSizing: 'border-box',
  }

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSaving(true)
    const data = { title: title.trim(), body, category }
    if (isEdit) await onSubmitEdit(data)
    else        await onSubmitNew(data)
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 560, background: 'var(--paper)',
        border: '1px solid var(--line)', borderRadius: 16, padding: 28,
        display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
          {isEdit ? `Editar: ${(mode as { kind: 'edit'; page: WikiPageType }).page.title}` : 'Nova Página'}
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '32px 0',
            fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--teal)' }}>
            {isEdit ? 'Edição enviada para aprovação do GM!' : 'Página criada e aguardando aprovação do GM!'}
          </div>
        ) : (
          <>
            {!isEdit && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título"
                  style={fieldStyle} />
                <select value={category} onChange={e => setCategory(e.target.value as WikiCategory)} style={fieldStyle}>
                  {WIKI_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}

            {isEdit && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" style={fieldStyle} />
                <select value={category} onChange={e => setCategory(e.target.value as WikiCategory)} style={fieldStyle}>
                  {WIKI_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}

            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Conteúdo (markdown: **negrito**, *itálico*, ## título)"
              rows={10}
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />

            {!isEdit && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                letterSpacing: '0.08em', lineHeight: 1.5 }}>
                Sua contribuição será revisada pelo GM antes de aparecer na Wiki.
              </div>
            )}
            {isEdit && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                letterSpacing: '0.08em', lineHeight: 1.5 }}>
                Sua edição será revisada pelo GM. O conteúdo atual será mantido até a aprovação.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose}
                style={{ padding: '8px 20px', border: '1px solid var(--line)', borderRadius: 999,
                  background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11,
                  cursor: 'pointer', color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={saving || !title.trim()}
                style={{ padding: '8px 20px', borderRadius: 999, border: 'none',
                  background: 'var(--coral)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  cursor: saving ? 'wait' : 'pointer', letterSpacing: '0.1em',
                  opacity: saving || !title.trim() ? 0.6 : 1 }}>
                {saving ? 'Enviando...' : 'Enviar para aprovação'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function WikiPage({ state, isGM }: Props) {
  const { session, profile } = useAuth()
  const { isTaglineHidden } = useSettings()
  const [pages,        setPages]        = useState<WikiPageType[]>([])
  const [relations,    setRelations]    = useState<WikiRelation[]>([])
  const [catFilter,    setCatFilter]    = useState<WikiCategory | 'all'>('all')
  const [viewMode,     setViewMode]     = useState<ViewMode>('lista')
  const [selected,     setSelected]     = useState<WikiPageType | null>(null)
  const [sheetOpen,    setSheetOpen]    = useState<SheetSubject | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [playerModal,  setPlayerModal]  = useState<PlayerModal | null>(null)
  const [pendingEdits, setPendingEdits] = useState<WikiPageEdit[]>([])
  const [submitted,    setSubmitted]    = useState(false)

  const userId = session?.user?.id ?? null

  useEffect(() => {
    const loads: Promise<unknown>[] = [listWikiPages(), listWikiRelations()]
    if (userId && !isGM) loads.push(listMyPendingEdits(userId))
    Promise.all(loads).then(([p, r, edits]) => {
      setPages(p as WikiPageType[])
      setRelations(r as WikiRelation[])
      if (edits) setPendingEdits(edits as WikiPageEdit[])
      setLoading(false)
    })
  }, [userId, isGM])

  const visible = pages.filter(p => {
    if (isGM) return true
    if (p.status === 'pending') return p.author_id === userId
    return p.visibility === 'name' || p.visibility === 'full'
  })

  const filtered = catFilter === 'all' ? visible : visible.filter(p => p.category === catFilter)

  const openSheet = (page: WikiPageType) => {
    if (!page.linked_type || !page.linked_id) return
    const kind = page.linked_type === 'tamer'    ? 'tamer'
               : page.linked_type === 'digimon'  ? 'digimon'
               : page.linked_type === 'survivor' ? 'survivor'
               : null
    if (kind) setSheetOpen({ kind, id: page.linked_id })
  }

  const hasPendingEditFor = (pageId: string) =>
    pendingEdits.some(e => e.page_id === pageId)

  const handlePlayerSubmitEdit = async (data: { title: string; body: string; category: WikiCategory }) => {
    if (!userId || playerModal?.kind !== 'edit') return
    const edit = await submitWikiPageEdit(userId, {
      page_id:  playerModal.page.id,
      title:    data.title,
      body:     data.body,
      category: data.category,
    })
    if (edit) {
      setPendingEdits(prev => [...prev, edit])
      setSubmitted(true)
      setTimeout(() => { setSubmitted(false); setPlayerModal(null) }, 2000)
    }
  }

  const handlePlayerSubmitNew = async (data: { title: string; body: string; category: WikiCategory }) => {
    if (!userId) return
    const page = await submitWikiPage(userId, data)
    if (page) {
      setPages(prev => [...prev, page])
      setSubmitted(true)
      setTimeout(() => { setSubmitted(false); setPlayerModal(null) }, 2000)
    }
  }

  if (loading) return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 56px',
      fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)',
      letterSpacing: '0.12em', textTransform: 'uppercase' }}>
      Carregando Wiki...
    </div>
  )

  const usedCategories = WIKI_CATEGORIES.filter(c => visible.some(p => p.category === c.value))

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '28px 56px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ marginBottom: isTaglineHidden('wiki') ? 24 : 0 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42,
            textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            Wiki
          </h1>
          {!isTaglineHidden('wiki') && (
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              fontSize: 18, color: 'var(--ink-soft)', marginBottom: 24 }}>
              ~ enciclopédia do mundo ~
            </div>
          )}
        </div>
        {!isGM && userId && (
          <button onClick={() => { setPlayerModal({ kind: 'new' }); setSubmitted(false) }}
            style={{ marginTop: 8, padding: '9px 20px', borderRadius: 999, border: 'none',
              background: 'var(--coral)', color: '#fff',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
              letterSpacing: '0.1em', flexShrink: 0 }}>
            + Contribuir
          </button>
        )}
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 56px', marginBottom: 24, flexWrap: 'wrap' }}>
        {/* View toggles */}
        {(['lista', 'grafo'] as ViewMode[]).map(v => (
          <button key={v} onClick={() => setViewMode(v)}
            style={{ padding: '7px 16px', borderRadius: 999, border: 'none',
              background: viewMode === v ? 'var(--ink)' : 'var(--paper-deep)',
              color: viewMode === v ? 'var(--paper)' : 'var(--ink-soft)',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
              letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {v}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

        {/* Filtros de categoria */}
        <button onClick={() => setCatFilter('all')}
          style={{ padding: '5px 14px', borderRadius: 999,
            border: `1.5px solid ${catFilter === 'all' ? 'var(--coral)' : 'var(--line)'}`,
            background: catFilter === 'all' ? 'var(--coral)' : 'transparent',
            color: catFilter === 'all' ? '#fff' : 'var(--ink-mute)',
            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em' }}>
          Todas
        </button>
        {usedCategories.map(c => (
          <button key={c.value} onClick={() => setCatFilter(c.value)}
            style={{ padding: '5px 14px', borderRadius: 999,
              border: `1.5px solid ${catFilter === c.value ? 'var(--teal)' : 'var(--line)'}`,
              background: catFilter === c.value ? 'var(--teal)' : 'transparent',
              color: catFilter === c.value ? '#fff' : 'var(--ink-mute)',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em' }}>
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 56px' }}>
        {/* ── Lista ── */}
        {viewMode === 'lista' && (
          <>
            {visible.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                color: 'var(--ink-mute)', textAlign: 'center', padding: '60px 0' }}>
                ~ nenhuma página disponível ~
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
                {filtered.map(page => {
                  const isFull = page.visibility === 'full' || isGM
                  const isPending = page.status === 'pending'
                  const hasPendingEdit = !isGM && hasPendingEditFor(page.id)
                  const ownerOk = page.owner_tamer_id
                    ? profile?.tamer_id === page.owner_tamer_id
                    : true
                  const canEdit = !isGM && userId && !isPending && isFull && !hasPendingEdit && ownerOk
                  return (
                    <div key={page.id}
                      style={{ display: 'flex', flexDirection: 'column', gap: 12,
                        padding: 16, background: 'var(--paper-deep)',
                        border: `1px solid ${selected?.id === page.id ? 'var(--coral)' : isPending ? 'var(--wheat)' : 'var(--line-soft)'}`,
                        borderRadius: 12, opacity: isPending ? 0.75 : 1,
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                        boxShadow: selected?.id === page.id ? '0 0 0 2px var(--coral)' : 'none' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center',
                        cursor: isFull && !isPending ? 'pointer' : 'default' }}
                        onClick={() => isFull && !isPending ? setSelected(page) : undefined}>
                        <AvatarCircle url={page.avatar_url} name={page.title} size={48} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14,
                            textTransform: 'uppercase', letterSpacing: '0.02em',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {page.title}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                            color: 'var(--ink-mute)', letterSpacing: '0.1em', marginTop: 3 }}>
                            {WIKI_CATEGORIES.find(c => c.value === page.category)?.label ?? page.category}
                            {isGM && (
                              <span style={{ marginLeft: 8, color: page.visibility === 'hidden' ? 'var(--coral)' : page.visibility === 'name' ? 'var(--wheat)' : 'var(--teal)' }}>
                                · {page.visibility}
                              </span>
                            )}
                          </div>
                        </div>
                        {canEdit && (
                          <button onClick={e => { e.stopPropagation(); setPlayerModal({ kind: 'edit', page }); setSubmitted(false) }}
                            style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 6,
                              cursor: 'pointer', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)',
                              fontSize: 11, padding: '3px 8px', flexShrink: 0 }}>
                            ✎
                          </button>
                        )}
                      </div>

                      {isPending && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: 'var(--wheat)', letterSpacing: '0.1em', textAlign: 'center',
                          background: 'rgba(217,185,116,0.08)', borderRadius: 6, padding: '4px 0' }}>
                          aguardando aprovação do GM
                        </div>
                      )}
                      {hasPendingEdit && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: 'var(--wheat)', letterSpacing: '0.1em', textAlign: 'center',
                          background: 'rgba(217,185,116,0.08)', borderRadius: 6, padding: '4px 0' }}>
                          edição aguardando aprovação
                        </div>
                      )}
                      {!isFull && !isPending && (
                        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                          fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center' }}>
                          ~ informações restritas ~
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Painel lateral de detalhe */}
            {selected && (selected.visibility === 'full' || isGM) && (
              <div style={{ marginTop: 28, padding: '24px 28px',
                background: 'var(--paper-deep)', border: '1px solid var(--line)',
                borderRadius: 14 }}>
                <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                  <AvatarCircle url={selected.avatar_url} name={selected.title} size={72} />
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24,
                      textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>
                      {selected.title}
                    </h2>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: 'var(--ink-mute)', letterSpacing: '0.1em', marginBottom: 12 }}>
                      {WIKI_CATEGORIES.find(c => c.value === selected.category)?.label ?? selected.category}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {selected.linked_type && selected.linked_id &&
                        ['tamer','digimon','survivor'].includes(selected.linked_type) && (
                        <button onClick={() => openSheet(selected)}
                          style={{ padding: '6px 14px', borderRadius: 999,
                            border: '1px solid var(--teal)', background: 'transparent', color: 'var(--teal)',
                            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                            letterSpacing: '0.08em' }}>
                          Ver Ficha
                        </button>
                      )}
                      <button onClick={() => setSelected(null)}
                        style={{ padding: '6px 14px', borderRadius: 999,
                          border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-mute)',
                          fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                          letterSpacing: '0.08em' }}>
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>

                {selected.body && (
                  <div
                    style={{ fontFamily: 'var(--font-body)', fontSize: 14,
                      lineHeight: 1.7, color: 'var(--ink-soft)',
                      borderTop: '1px solid var(--line-soft)', paddingTop: 20 }}
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(selected.body) }}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* ── Grafo ── */}
        {viewMode === 'grafo' && (
          <WikiGraph
            pages={visible}
            relations={relations}
            isGM={isGM}
            onNodeClick={page => {
              if (page.visibility === 'full' || isGM) setSelected(page)
            }}
          />
        )}
      </div>

      {/* Modal de contribuição do player */}
      {playerModal && (
        <PlayerContribModal
          mode={playerModal}
          onSubmitEdit={handlePlayerSubmitEdit}
          onSubmitNew={handlePlayerSubmitNew}
          onClose={() => setPlayerModal(null)}
          submitted={submitted}
        />
      )}

      {/* SheetModal */}
      {sheetOpen && (
        <SheetModal
          subject={sheetOpen}
          state={state}
          onSaveState={() => {}}
          onClose={() => setSheetOpen(null)}
          editable={false}
          isGM={isGM}
        />
      )}
    </div>
  )
}
