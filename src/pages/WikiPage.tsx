import { useState, useEffect } from 'react'
import { useAuth } from '../components/AuthProvider'
import type { AppState } from '../types'
import type { WikiPage as WikiPageType, WikiRelation, WikiCategory, WikiVisibility } from '../types/wiki'
import { WIKI_CATEGORIES } from '../types/wiki'
import { listWikiPages, listWikiRelations } from '../lib/db/wiki'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import WikiGraph from '../components/wiki/WikiGraph'

interface Props {
  state:  AppState
  isGM:   boolean
}

type ViewMode = 'lista' | 'grafo'

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

export default function WikiPage({ state, isGM }: Props) {
  const [pages,      setPages]      = useState<WikiPageType[]>([])
  const [relations,  setRelations]  = useState<WikiRelation[]>([])
  const [catFilter,  setCatFilter]  = useState<WikiCategory | 'all'>('all')
  const [viewMode,   setViewMode]   = useState<ViewMode>('lista')
  const [selected,   setSelected]   = useState<WikiPageType | null>(null)
  const [sheetOpen,  setSheetOpen]  = useState<SheetSubject | null>(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    Promise.all([listWikiPages(), listWikiRelations()]).then(([p, r]) => {
      setPages(p); setRelations(r); setLoading(false)
    })
  }, [])

  const visible = pages.filter(p =>
    isGM ? true : (p.visibility === 'name' || p.visibility === 'full')
  )

  const filtered = catFilter === 'all' ? visible : visible.filter(p => p.category === catFilter)

  const openSheet = (page: WikiPageType) => {
    if (!page.linked_type || !page.linked_id) return
    const kind = page.linked_type === 'tamer'    ? 'tamer'
               : page.linked_type === 'digimon'  ? 'digimon'
               : page.linked_type === 'survivor' ? 'survivor'
               : null
    if (kind) setSheetOpen({ kind, id: page.linked_id })
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
      <div style={{ padding: '28px 56px 0' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42,
          textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Wiki
        </h1>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
          fontSize: 18, color: 'var(--ink-soft)', marginBottom: 24 }}>
          ~ enciclopédia do mundo ~
        </div>
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
                  return (
                    <div key={page.id}
                      onClick={() => isFull ? setSelected(page) : undefined}
                      style={{ display: 'flex', flexDirection: 'column', gap: 12,
                        padding: 16, background: 'var(--paper-deep)',
                        border: `1px solid ${selected?.id === page.id ? 'var(--coral)' : 'var(--line-soft)'}`,
                        borderRadius: 12, cursor: isFull ? 'pointer' : 'default',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                        boxShadow: selected?.id === page.id ? '0 0 0 2px var(--coral)' : 'none' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
                      </div>

                      {!isFull && (
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
