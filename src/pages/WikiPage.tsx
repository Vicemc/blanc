import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSettings } from '../lib/settings'
import { useCampaignFlags } from '../lib/campaignFlags'
import { useAuth } from '../components/AuthProvider'
import type { AppState } from '../types'
import type { WikiPage as WikiPageType, WikiPageEdit, WikiCategory, WikiContent, WikiSubcat, WikiSubcatMap } from '../types/wiki'
import {
  WIKI_CATEGORIES, EMPTY_WIKI_CONTENT, SPOILER_CATEGORIES,
  HUMANOS_AUTO_SPACES, HUMANOS_MANUAL_SUBCATS, HUMANOS_SPACE_ORDER, HUMANOS_SPACE_LABELS,
} from '../types/wiki'
import {
  listWikiPages, submitWikiPage, submitWikiPageEdit, saveOwnWikiPageEdit, listMyPendingEdits,
  getWikiSubcats, resolveHumanSpace,
} from '../lib/db/wiki'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import WikiArticle from '../components/wiki/WikiArticle'
import WikiBlocksEditor from '../components/wiki/WikiBlocksEditor'
import { WikiPageForm } from '../components/wiki/WikiSection'
import { renderWikiMarkdown } from '../components/wiki/wikiLinks'
import { pageSlug, resolvePageParam, looksLikeUuid } from '../components/wiki/wikiSlug'

interface Props {
  state:  AppState
  isGM:   boolean
}

type PlayerModal = { kind: 'new' } | { kind: 'edit'; page: WikiPageType }

// Resolve a classe de fundo (fill-*) do avatar a partir da entidade vinculada,
// para a Wiki reaproveitar a cor do retrato (imagens têm fundo transparente).
function resolvePortrait(page: WikiPageType, state: AppState): string | null {
  if (!page.linked_type || !page.linked_id) return null
  let portrait: string | undefined
  if (page.linked_type === 'tamer')         portrait = state.tamers.find(t => t.id === page.linked_id)?.portrait
  else if (page.linked_type === 'survivor') portrait = (state.survivors ?? []).find(s => s.id === page.linked_id)?.portrait
  else if (page.linked_type === 'digimon') {
    const line = state.bestiary.find(d => d.id === page.linked_id)
    portrait = line?.stages[line.currentStage]?.portrait
  }
  return portrait ? `fill-${portrait}` : null
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

// ── Espaços (subcategorias) de uma categoria ─────────────────────────────────

// Lista ordenada de espaços de uma categoria (auto + manuais + do GM), para
// renderizar cabeçalhos de seção. Humanos tem espaços fixos; demais vêm do GM.
function categorySpaces(category: WikiCategory, gmSubcats: WikiSubcatMap): WikiSubcat[] {
  if (category === 'humanos') {
    const ordered = HUMANOS_SPACE_ORDER.map(key => {
      const found = [...HUMANOS_AUTO_SPACES, ...HUMANOS_MANUAL_SUBCATS].find(s => s.key === key)
      return found ?? { key, label: HUMANOS_SPACE_LABELS[key] ?? key }
    })
    // Subcats extras que o GM tenha criado para Humanos, fora dos fixos.
    const extra = (gmSubcats.humanos ?? []).filter(s => !HUMANOS_SPACE_ORDER.includes(s.key))
    return [...ordered, ...extra]
  }
  return gmSubcats[category] ?? []
}

// Espaço a que uma página pertence dentro da sua categoria.
function pageSpace(page: WikiPageType): string {
  if (page.category === 'humanos') return resolveHumanSpace(page)
  return page.subcategory || ''
}

// Agrupa páginas pelos espaços ordenados; só retorna grupos não vazios.
// Páginas cuja subcat não bate com nenhum espaço conhecido caem em "Outros"
// (Humanos) ou num grupo "Sem subcategoria".
function groupBySpace(
  pages: WikiPageType[], category: WikiCategory, gmSubcats: WikiSubcatMap,
): { space: WikiSubcat; pages: WikiPageType[] }[] {
  const spaces = categorySpaces(category, gmSubcats)
  if (spaces.length === 0) return [{ space: { key: '', label: '' }, pages }]

  const known = new Set(spaces.map(s => s.key))
  const fallbackKey = category === 'humanos' ? 'outros' : '__none__'
  const buckets = new Map<string, WikiPageType[]>()

  for (const p of pages) {
    let key = pageSpace(p)
    if (!known.has(key)) key = fallbackKey
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(p)
  }

  const ordered = spaces.map(space => ({ space, pages: buckets.get(space.key) ?? [] }))
  // Grupo de fallback para categorias não-Humanos (sem subcat atribuída).
  if (fallbackKey === '__none__' && buckets.has('__none__')) {
    ordered.push({ space: { key: '__none__', label: 'Sem subcategoria' }, pages: buckets.get('__none__')! })
  }
  const byOrder = (a: WikiPageType, b: WikiPageType) =>
    (a.sort_order - b.sort_order) || a.title.localeCompare(b.title)
  return ordered
    .filter(g => g.pages.length > 0)
    .map(g => ({ ...g, pages: [...g.pages].sort(byOrder) }))
}

// ── Modal de contribuição do player ──────────────────────────────────────────

interface ContribData { title: string; body: string; category: WikiCategory; subcategory: string | null; content: WikiContent }

interface PlayerContribModalProps {
  mode:          PlayerModal
  detailed:      boolean
  isOwner:       boolean
  gmSubcats:     WikiSubcatMap
  onSubmitEdit:  (d: ContribData) => void
  onSubmitNew:   (d: ContribData) => void
  onClose:       () => void
  submitted:     boolean
}

function PlayerContribModal({ mode, detailed, isOwner, gmSubcats, onSubmitEdit, onSubmitNew, onClose, submitted }: PlayerContribModalProps) {
  const isEdit = mode.kind === 'edit'
  // Edição direta (sem aprovação) quando o player é o dono da própria página.
  const directEdit = isEdit && isOwner
  const initial = isEdit ? mode.page : null
  const [title,    setTitle]    = useState(initial?.title    ?? '')
  const [category, setCategory] = useState<WikiCategory>(initial?.category ?? 'humanos')
  const [subcategory, setSubcategory] = useState<string | null>(initial?.subcategory ?? null)
  const [body,     setBody]     = useState(initial?.body     ?? '')
  const [content,  setContent]  = useState<WikiContent>(initial?.content ?? EMPTY_WIKI_CONTENT)
  const [saving,   setSaving]   = useState(false)

  // Tamer/Survivor vinculados agrupam pelo vínculo (automático) — sem select manual.
  const isAutoLinked = !!initial && (initial.linked_type === 'tamer' || initial.linked_type === 'survivor')
  // Subcategorias atribuíveis na categoria atual.
  const subcatOptions: WikiSubcat[] = category === 'humanos'
    ? HUMANOS_MANUAL_SUBCATS
    : (gmSubcats[category] ?? [])
  const showSubcatSelect = !isAutoLinked && subcatOptions.length > 0

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--line)',
    borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)',
    fontFamily: 'var(--font-body)', fontSize: 13, boxSizing: 'border-box',
  }

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSaving(true)
    // Vinculados não carregam subcat manual (vínculo manda); senão usa o select.
    const data: ContribData = {
      title: title.trim(), body, category, content,
      subcategory: isAutoLinked ? null : subcategory,
    }
    if (isEdit) await onSubmitEdit(data)
    else        await onSubmitNew(data)
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: detailed ? 680 : 560, maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--paper)',
        border: '1px solid var(--line)', borderRadius: 16, padding: 'var(--page-pad-x-sm)',
        display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
          {isEdit ? `Editar: ${(mode as { kind: 'edit'; page: WikiPageType }).page.title}` : 'Nova Página'}
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '32px 0',
            fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--teal)' }}>
            {directEdit ? 'Página atualizada!'
              : isEdit ? 'Edição enviada para aprovação do GM!'
              : 'Página criada e aguardando aprovação do GM!'}
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

            {/* Subcategoria (espaço) — só para páginas não vinculadas a entidade. */}
            {showSubcatSelect && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                  letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Subcategoria
                </span>
                <select value={subcategory ?? ''} onChange={e => setSubcategory(e.target.value || null)}
                  style={{ ...fieldStyle, flex: 1 }}>
                  <option value="">— sem subcategoria —</option>
                  {subcatOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            )}
            {isAutoLinked && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                letterSpacing: '0.08em' }}>
                Esta página é agrupada automaticamente em {initial?.linked_type === 'tamer' ? 'Tamers' : 'Survivors'} pelo vínculo.
              </div>
            )}

            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Sobre (markdown: **negrito**, *itálico*, ## título, [[Link interno]], [texto](url) externo)"
              rows={detailed ? 5 : 10}
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5,
                minHeight: detailed ? 120 : 200, flexShrink: 0, boxSizing: 'border-box' }} />

            {detailed && (
              <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                <WikiBlocksEditor
                  value={content}
                  onChange={setContent}
                  uploadKey={initial?.id ?? (title || 'page').toLowerCase().replace(/\s+/g, '-')}
                />
              </div>
            )}

            {!isEdit && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                letterSpacing: '0.08em', lineHeight: 1.5 }}>
                Sua contribuição será revisada pelo GM antes de aparecer na Wiki.
              </div>
            )}
            {isEdit && !directEdit && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                letterSpacing: '0.08em', lineHeight: 1.5 }}>
                Sua edição será revisada pelo GM. O conteúdo atual será mantido até a aprovação.
              </div>
            )}
            {directEdit && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                letterSpacing: '0.08em', lineHeight: 1.5 }}>
                Esta é a sua página — as alterações são salvas direto, sem aprovação.
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
                {saving ? 'Salvando...' : directEdit ? 'Salvar alterações' : 'Enviar para aprovação'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Modal de edição do GM (reaproveita o formulário completo do Backstage) ────

function GmEditModal({ page, state, onSave, onClose }: {
  page: WikiPageType
  state: AppState
  onSave: (p: WikiPageType) => void
  onClose: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16,
        padding: 'var(--page-pad-x-sm)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
          Editando (GM): {page.title}
        </div>
        <WikiPageForm initial={page} state={state} onSave={onSave} onCancel={onClose} />
      </div>
    </div>
  )
}

export default function WikiPage({ state, isGM }: Props) {
  const { session, profile } = useAuth()
  const { isTaglineHidden } = useSettings()
  const { flags } = useCampaignFlags()
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const detailed = flags.wiki_detailed_pages
  const [pages,        setPages]        = useState<WikiPageType[]>([])
  const [catFilter,    setCatFilter]    = useState<WikiCategory | null>(null)
  const [selected,     setSelected]     = useState<WikiPageType | null>(null)
  const [sheetOpen,    setSheetOpen]    = useState<SheetSubject | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [playerModal,  setPlayerModal]  = useState<PlayerModal | null>(null)
  const [gmEditPage,   setGmEditPage]   = useState<WikiPageType | null>(null)
  const [pendingEdits, setPendingEdits] = useState<WikiPageEdit[]>([])
  const [gmSubcats,    setGmSubcats]    = useState<WikiSubcatMap>({})
  const [submitted,    setSubmitted]    = useState(false)

  const userId = session?.user?.id ?? null

  // Player é dono da própria página (ex.: o jogador do Naoki na página do Naoki).
  const ownsPage = (p: WikiPageType | null | undefined) =>
    !!p?.owner_tamer_id && profile?.tamer_id === p.owner_tamer_id

  useEffect(() => {
    getWikiSubcats().then(setGmSubcats)
  }, [])

  useEffect(() => {
    const loads: Promise<unknown>[] = [listWikiPages()]
    if (userId && !isGM) loads.push(listMyPendingEdits(userId))
    Promise.all(loads).then(([p, edits]) => {
      setPages(p as WikiPageType[])
      if (edits) setPendingEdits(edits as WikiPageEdit[])
      setLoading(false)
    })
  }, [userId, isGM])

  const visible = pages.filter(p => {
    if (isGM) return true
    if (p.status === 'pending') return p.author_id === userId
    // Modo spoiler: oculta categorias sensíveis dos players.
    if (flags.spoiler_mode && SPOILER_CATEGORIES.includes(p.category)) return false
    return p.visibility === 'name' || p.visibility === 'full'
  })

  // Categorias que realmente têm páginas visíveis — únicas opções de filtro.
  const usedCategories = WIKI_CATEGORIES.filter(c => visible.some(p => p.category === c.value))

  // Sem filtro "Todas": seleciona a primeira categoria disponível por padrão e
  // reajusta se a categoria atual deixar de existir.
  useEffect(() => {
    if (usedCategories.length === 0) return
    if (!catFilter || !usedCategories.some(c => c.value === catFilter)) {
      setCatFilter(usedCategories[0].value)
    }
  }, [usedCategories, catFilter])

  const filtered = catFilter ? visible.filter(p => p.category === catFilter) : []

  // Redireciona links antigos por UUID (ou param não-canônico) para o slug legível.
  useEffect(() => {
    if (!detailed || !routeId || loading) return
    const page = resolvePageParam(routeId, visible)
    if (!page) return
    const canonical = pageSlug(page, visible)
    if (routeId !== canonical && (looksLikeUuid(routeId) || routeId.toLowerCase() !== canonical)) {
      navigate(`/wiki/${canonical}`, { replace: true })
    }
  }, [detailed, routeId, loading, visible, navigate])

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

  // Abre uma página: no modo detalhado navega para /wiki/:slug; senão painel inline.
  const openPage = (page: WikiPageType) => {
    if (detailed) navigate(`/wiki/${pageSlug(page, visible)}`)
    else setSelected(page)
  }
  const openPageById = (pageId: string) => {
    const p = pages.find(x => x.id === pageId)
    if (detailed && p) { navigate(`/wiki/${pageSlug(p, visible)}`); return }
    if (p) setSelected(p)
  }

  const handlePlayerSubmitEdit = async (data: ContribData) => {
    if (!userId || playerModal?.kind !== 'edit') return
    const page = playerModal.page

    // Dono da própria página edita sem aprovação — aplica direto (só na Wiki).
    if (ownsPage(page)) {
      const updated = await saveOwnWikiPageEdit(page.id, {
        title:    data.title,
        body:     data.body,
        category: data.category,
        subcategory: data.subcategory,
        content:  data.content,
      })
      if (updated) {
        setPages(prev => prev.map(p => p.id === updated.id ? updated : p))
        setSubmitted(true)
        setTimeout(() => { setSubmitted(false); setPlayerModal(null) }, 1200)
      }
      return
    }

    const edit = await submitWikiPageEdit(userId, {
      page_id:  page.id,
      title:    data.title,
      body:     data.body,
      category: data.category,
      subcategory: data.subcategory,
      content:  data.content,
    })
    if (edit) {
      setPendingEdits(prev => [...prev, edit])
      setSubmitted(true)
      setTimeout(() => { setSubmitted(false); setPlayerModal(null) }, 2000)
    }
  }

  const handlePlayerSubmitNew = async (data: ContribData) => {
    if (!userId) return
    const page = await submitWikiPage(userId, {
      title: data.title, category: data.category,
      subcategory: data.subcategory, body: data.body, content: data.content,
    })
    if (page) {
      setPages(prev => [...prev, page])
      setSubmitted(true)
      setTimeout(() => { setSubmitted(false); setPlayerModal(null) }, 2000)
    }
  }

  // GM: salva a página direto (sem aprovação) usando o mesmo fluxo do Backstage.
  const handleGmSaved = (page: WikiPageType) => {
    setPages(prev => prev.map(p => p.id === page.id ? page : p))
    setGmEditPage(null)
  }

  // Card de uma página na lista (reutilizado pelos grupos de subcategoria).
  const renderCard = (page: WikiPageType) => {
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
          onClick={() => isFull && !isPending ? openPage(page) : undefined}>
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
          {(isGM || canEdit) && (
            <button onClick={e => {
              e.stopPropagation()
              if (isGM) { setGmEditPage(page) }
              else { setPlayerModal({ kind: 'edit', page }); setSubmitted(false) }
            }}
              title={isGM ? 'Editar página' : undefined}
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
  }

  // Espaços (subcategorias) com páginas, na ordem de exibição.
  const spaceGroups = catFilter ? groupBySpace(filtered, catFilter, gmSubcats) : []

  if (loading) return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px var(--page-pad-x)',
      fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)',
      letterSpacing: '0.12em', textTransform: 'uppercase' }}>
      Carregando Wiki...
    </div>
  )

  // ── Modo detalhado: rota /wiki/:id renderiza o artigo ──────────────────────
  if (detailed && routeId) {
    const page = resolvePageParam(routeId, visible)
    if (!page) {
      return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '60px var(--page-pad-x)',
          fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-mute)', textAlign: 'center' }}>
          ~ página não encontrada ~
          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate('/wiki')}
              style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid var(--line)',
                background: 'transparent', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)',
                fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em' }}>
              ← Voltar à Wiki
            </button>
          </div>
        </div>
      )
    }

    const isFull = page.visibility === 'full' || isGM
    const isOwner = ownsPage(page)
    const ownerOk = page.owner_tamer_id ? profile?.tamer_id === page.owner_tamer_id : true
    const canEdit = !isGM && userId && page.status !== 'pending' && isFull
      && !hasPendingEditFor(page.id) && ownerOk

    return (
      <>
        <WikiArticle
          page={page}
          allPages={visible}
          isGM={isGM}
          coverFill={resolvePortrait(page, state)}
          onOpenPage={openPageById}
          onBack={() => navigate('/wiki')}
          onOpenSheet={canEdit || isGM || isFull ? openSheet : undefined}
          onEdit={
            isGM ? () => setGmEditPage(page)
            : canEdit ? () => { setPlayerModal({ kind: 'edit', page }); setSubmitted(false) }
            : undefined
          }
          editLabel={isGM ? 'Editar página' : isOwner ? 'Editar página' : 'Sugerir edição'}
        />

        {playerModal && (
          <PlayerContribModal
            mode={playerModal}
            detailed={detailed}
            isOwner={ownsPage(playerModal.kind === 'edit' ? playerModal.page : null)}
            gmSubcats={gmSubcats}
            onSubmitEdit={handlePlayerSubmitEdit}
            onSubmitNew={handlePlayerSubmitNew}
            onClose={() => setPlayerModal(null)}
            submitted={submitted}
          />
        )}

        {gmEditPage && (
          <GmEditModal page={gmEditPage} state={state}
            onSave={handleGmSaved} onClose={() => setGmEditPage(null)} />
        )}

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
      </>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '28px var(--page-pad-x) 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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

      {/* Controles — filtros de categoria (sem opção "Todas") */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 var(--page-pad-x)', marginBottom: 24, flexWrap: 'wrap' }}>

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

      <div style={{ padding: '0 var(--page-pad-x)' }}>
        {/* ── Lista ── */}
        <>
            {visible.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                color: 'var(--ink-mute)', textAlign: 'center', padding: '60px 0' }}>
                ~ nenhuma página disponível ~
              </div>
            ) : spaceGroups.length <= 1 ? (
              // Categoria sem subcategorias (ou um único grupo): grade única.
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
                {filtered.map(renderCard)}
              </div>
            ) : (
              // Categoria com espaços: cabeçalho de seção + grade por espaço.
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {spaceGroups.map(group => (
                  <div key={group.space.key}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                      letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)',
                      borderBottom: '1px solid var(--line-soft)', paddingBottom: 8, marginBottom: 14 }}>
                      {group.space.label}
                      <span style={{ color: 'var(--ink-mute)', marginLeft: 8 }}>({group.pages.length})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
                      {group.pages.map(renderCard)}
                    </div>
                  </div>
                ))}
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
                      borderTop: '1px solid var(--line-soft)', paddingTop: 20 }}>
                    {renderWikiMarkdown(selected.body, visible, openPageById)}
                  </div>
                )}
              </div>
            )}
        </>

      </div>

      {/* Modal de contribuição do player */}
      {playerModal && (
        <PlayerContribModal
          mode={playerModal}
          detailed={detailed}
          isOwner={ownsPage(playerModal.kind === 'edit' ? playerModal.page : null)}
          gmSubcats={gmSubcats}
          onSubmitEdit={handlePlayerSubmitEdit}
          onSubmitNew={handlePlayerSubmitNew}
          onClose={() => setPlayerModal(null)}
          submitted={submitted}
        />
      )}

      {/* Modal de edição do GM (um clique a partir da Wiki) */}
      {gmEditPage && (
        <GmEditModal page={gmEditPage} state={state}
          onSave={handleGmSaved} onClose={() => setGmEditPage(null)} />
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
