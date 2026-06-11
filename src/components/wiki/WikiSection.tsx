import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { AppState } from '../../types'
import type { WikiPage, WikiPageEdit, WikiCategory, WikiVisibility } from '../../types/wiki'
import { WIKI_CATEGORIES } from '../../types/wiki'
import {
  listWikiPages, saveWikiPage, deleteWikiPage, setWikiPageVisibility,
  listPendingEdits, approveWikiEdit, rejectWikiEdit, approveWikiPage, rejectWikiPage,
  seedWikiPages, exportWikiPages, pickWikiImport, importWikiPages,
} from '../../lib/db/wiki'
import { uploadImage } from '../../lib/db/storage'
import { SheetModal } from '../Sheet'
import type { SheetSubject } from '../Sheet'
import WikiBlocksEditor from './WikiBlocksEditor'
import WikiArticle from './WikiArticle'
import { diffWords } from './textDiff'
import type { WikiContent } from '../../types/wiki'
import { EMPTY_WIKI_CONTENT } from '../../types/wiki'
import { useCampaignFlags } from '../../lib/campaignFlags'
// import WikiGraph from './WikiGraph'

interface Props {
  state:    AppState
  onUpdate: (s: AppState) => void
}

type WikiTab = 'paginas' | 'aprovacoes'

const VISIBILITY_LABELS: Record<WikiVisibility, string> = {
  hidden: 'Oculto',
  name:   'Nome',
  full:   'Completo',
}

const VISIBILITY_COLORS: Record<WikiVisibility, string> = {
  hidden: 'var(--ink-mute)',
  name:   'var(--wheat)',
  full:   'var(--teal)',
}

function avatarFile(avatarUrl: string | null | undefined, name: string, size = 48) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      background: 'var(--paper-deep)', border: '1.5px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.4, color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
          {name.charAt(0)}
        </span>
      )}
    </div>
  )
}

// ── Formulário de edição/criação ──────────────────────────────────────────────

interface EditFormProps {
  initial?: WikiPage | null
  onSave:  (page: WikiPage) => void
  onCancel: () => void
  state: AppState
}

function WikiPageForm({ initial, onSave, onCancel, state }: EditFormProps) {
  const [title,      setTitle]      = useState(initial?.title      ?? '')
  const [category,   setCategory]   = useState<WikiCategory>(initial?.category ?? 'humanos')
  const [body,       setBody]       = useState(initial?.body       ?? '')
  const [avatarUrl,  setAvatarUrl]  = useState(initial?.avatar_url ?? null as string | null)
  const [visibility, setVisibility] = useState<WikiVisibility>(initial?.visibility ?? 'hidden')
  const [linkedType,   setLinkedType]   = useState(initial?.linked_type   ?? null as string | null)
  const [linkedId,     setLinkedId]     = useState(initial?.linked_id    ?? null as string | null)
  const [ownerTamerId, setOwnerTamerId] = useState(initial?.owner_tamer_id ?? null as string | null)
  const [content,    setContent]    = useState<WikiContent>(initial?.content ?? EMPTY_WIKI_CONTENT)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const allTamers:    typeof state.tamers    = state.tamers
  const allDigimons:  typeof state.bestiary  = state.bestiary
  const allSurvivors: typeof state.survivors = state.survivors
  const allBugs:      typeof state.bugs      = state.bugs
  const allSigns:     typeof state.signs     = state.signs

  const handleAvatar = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string
      const url = await uploadImage(dataUrl, `wiki/${title || 'page'}-${Date.now()}`, 'portraits')
      setAvatarUrl(url)
    }
    reader.readAsDataURL(file)
  }, [title])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    const result = await saveWikiPage({
      ...(initial ?? {}),
      title:          title.trim(),
      category,
      body,
      avatar_url:     avatarUrl,
      visibility,
      linked_type:    (linkedType as any) ?? null,
      linked_id:      linkedId ?? null,
      owner_tamer_id: ownerTamerId ?? null,
      content,
    })
    setSaving(false)
    if (result) onSave(result)
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--line)',
    borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)',
    fontFamily: 'var(--font-body)', fontSize: 13,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {avatarFile(avatarUrl, title || '?', 56)}
        <div style={{ flex: 1 }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatar} />
          <button onClick={() => fileRef.current?.click()}
            style={{ padding: '6px 14px', border: '1px solid var(--line)', borderRadius: 8,
              background: 'var(--paper-deep)', fontFamily: 'var(--font-mono)', fontSize: 11,
              cursor: 'pointer', color: 'var(--ink-soft)', letterSpacing: '0.1em' }}>
            {avatarUrl ? 'Trocar avatar' : 'Enviar avatar'}
          </button>
          {avatarUrl && (
            <button onClick={() => setAvatarUrl(null)}
              style={{ marginLeft: 8, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8,
                background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer', color: 'var(--coral)' }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Título + Categoria */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título"
          style={fieldStyle} />
        <select value={category} onChange={e => setCategory(e.target.value as WikiCategory)}
          style={fieldStyle}>
          {WIKI_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Corpo / Sobre */}
      <textarea value={body} onChange={e => setBody(e.target.value)}
        placeholder="Sobre (markdown: **negrito**, *itálico*, ## títulos, [[Link interno]])"
        rows={6}
        style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />

      {/* Layout em blocos (infobox, texto, imagens, galeria) */}
      <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
        <WikiBlocksEditor
          value={content}
          onChange={setContent}
          uploadKey={initial?.id ?? (title || 'page').toLowerCase().replace(/\s+/g, '-')}
        />
      </div>

      {/* Visibilidade */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>
          VISIBILIDADE
        </span>
        {(['hidden', 'name', 'full'] as WikiVisibility[]).map(v => (
          <button key={v} onClick={() => setVisibility(v)}
            style={{ padding: '5px 12px', borderRadius: 999,
              border: `1.5px solid ${visibility === v ? VISIBILITY_COLORS[v] : 'var(--line)'}`,
              background: visibility === v ? VISIBILITY_COLORS[v] : 'transparent',
              color: visibility === v ? 'var(--paper)' : 'var(--ink-mute)',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
              letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {VISIBILITY_LABELS[v]}
          </button>
        ))}
      </div>

      {/* Vínculo com ficha */}
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
        <select value={linkedType ?? ''} onChange={e => { setLinkedType(e.target.value || null); setLinkedId(null) }}
          style={fieldStyle}>
          <option value="">Sem vínculo</option>
          <option value="tamer">Tamer</option>
          <option value="digimon">Digimon</option>
          <option value="survivor">Survivor</option>
          <option value="bug">BUG</option>
          <option value="sign">SIGN</option>
        </select>
        {linkedType === 'tamer' && (
          <select value={linkedId ?? ''} onChange={e => setLinkedId(e.target.value || null)} style={fieldStyle}>
            <option value="">— selecione —</option>
            {allTamers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {linkedType === 'digimon' && (
          <select value={linkedId ?? ''} onChange={e => setLinkedId(e.target.value || null)} style={fieldStyle}>
            <option value="">— selecione —</option>
            {allDigimons.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {linkedType === 'survivor' && (
          <select value={linkedId ?? ''} onChange={e => setLinkedId(e.target.value || null)} style={fieldStyle}>
            <option value="">— selecione —</option>
            {allSurvivors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {linkedType === 'bug' && (
          <select value={linkedId ?? ''} onChange={e => setLinkedId(e.target.value || null)} style={fieldStyle}>
            <option value="">— selecione —</option>
            {allBugs.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {linkedType === 'sign' && (
          <select value={linkedId ?? ''} onChange={e => setLinkedId(e.target.value || null)} style={fieldStyle}>
            <option value="">— selecione —</option>
            {allSigns.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* Dono da página (restrição de edição) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)',
          letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
          EDIÇÃO RESTRITA A
        </span>
        <select value={ownerTamerId ?? ''} onChange={e => setOwnerTamerId(e.target.value || null)}
          style={{ ...fieldStyle, flex: 1 }}>
          <option value="">— qualquer player —</option>
          <option value="t-naoki">Naoki</option>
          <option value="t-mori">Mori</option>
          <option value="t-miki">Miki</option>
          <option value="t-yuri">Yuri</option>
          <option value="t-eisuke">Eisuke</option>
          <option value="t-sachi">Sachi</option>
        </select>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel}
          style={{ padding: '8px 20px', border: '1px solid var(--line)', borderRadius: 999,
            background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
            color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving || !title.trim()}
          style={{ padding: '8px 20px', borderRadius: 999, border: 'none',
            background: 'var(--coral)', color: '#fff',
            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: saving ? 'wait' : 'pointer',
            letterSpacing: '0.1em', opacity: saving || !title.trim() ? 0.6 : 1 }}>
          {saving ? 'Salvando...' : initial ? 'Salvar' : 'Criar'}
        </button>
      </div>
    </div>
  )
}

// ── Revisão de edição: original vs. proposta lado a lado ─────────────────────

interface EditReviewModalProps {
  edit:      WikiPageEdit
  original:  WikiPage | undefined
  allPages:  WikiPage[]
  busy:      boolean
  onApprove: () => void
  onReject:  () => void
  onClose:   () => void
}

// Linha de mudança de metadado (título/categoria): mostra antes → depois.
function DiffMetaRow({ label, changed, before, after }: {
  label: string; changed: boolean; before: string; after: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <span style={{ width: 80, color: 'var(--ink-mute)', fontSize: 10, letterSpacing: '0.1em',
        textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      {changed ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(196,51,33,0.18)', color: 'var(--ink-soft)',
            textDecoration: 'line-through', padding: '1px 8px', borderRadius: 4 }}>{before || '—'}</span>
          <span style={{ color: 'var(--ink-mute)' }}>→</span>
          <span style={{ background: 'rgba(110,157,112,0.22)', color: 'var(--ink)',
            padding: '1px 8px', borderRadius: 4 }}>{after || '—'}</span>
        </span>
      ) : (
        <span style={{ color: 'var(--ink-soft)' }}>{after || '—'}</span>
      )}
    </div>
  )
}

function EditReviewModal({ edit, original, allPages, busy, onApprove, onReject, onClose }: EditReviewModalProps) {
  const [view, setView] = useState<'diff' | 'sidebyside'>('diff')

  // Página "proposta" = original com os campos editáveis substituídos pela proposta.
  // Campos não editáveis (avatar, vínculos, visibilidade) são herdados do original.
  const base: WikiPage = original ?? {
    id: edit.page_id, campaign_id: edit.campaign_id, title: edit.title, category: edit.category,
    body: '', avatar_url: null, visibility: 'full', linked_type: null, linked_id: null,
    status: 'approved', author_id: null, owner_tamer_id: null, content: null,
    created_at: edit.created_at, updated_at: edit.created_at,
  }
  const proposed: WikiPage = {
    ...base,
    title:    edit.title,
    category: edit.category,
    body:     edit.body,
    content:  edit.content ?? {},
  }

  const titleChanged = base.title !== proposed.title
  const catChanged   = base.category !== proposed.category
  const bodyParts    = diffWords(base.body ?? '', proposed.body ?? '')
  const bodyChanged  = bodyParts.some(p => p.op !== 'equal')

  const colTitle = (label: string, color: string) => (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
      textTransform: 'uppercase', color, padding: '12px 16px',
      borderBottom: '1px solid var(--line)', position: 'sticky', top: 0,
      background: 'var(--paper)', zIndex: 1 }}>
      {label}
    </div>
  )

  const noop = () => {}

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1500,
      display: 'flex', flexDirection: 'column', padding: '32px 24px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ flex: 1, minHeight: 0, maxWidth: 1280, width: '100%', margin: '0 auto',
        background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16,
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '16px 24px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--ink)' }}>
            Revisar edição — {original?.title ?? edit.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Alternância de modo de revisão */}
            <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden' }}>
              {(['diff', 'sidebyside'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ border: 'none', cursor: 'pointer', padding: '5px 14px',
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: view === v ? 'var(--ink)' : 'transparent',
                    color: view === v ? 'var(--paper)' : 'var(--ink-mute)' }}>
                  {v === 'diff' ? 'Diff' : 'Lado a lado'}
                </button>
              ))}
            </div>
            <button onClick={onClose}
              style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999,
                cursor: 'pointer', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)',
                fontSize: 11, padding: '5px 14px', letterSpacing: '0.08em' }}>
              Fechar ✕
            </button>
          </div>
        </div>

        {/* Comparação: diff textual OU lado a lado renderizado */}
        {view === 'diff' ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
            {/* Mudanças de metadados */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              <DiffMetaRow label="Título" changed={titleChanged} before={base.title} after={proposed.title} />
              <DiffMetaRow label="Categoria"
                changed={catChanged}
                before={WIKI_CATEGORIES.find(c => c.value === base.category)?.label ?? base.category}
                after={WIKI_CATEGORIES.find(c => c.value === proposed.category)?.label ?? proposed.category} />
            </div>

            {/* Diff do corpo */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 10 }}>
              Corpo {bodyChanged ? '' : '(sem alterações)'}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7,
              color: 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              padding: '14px 16px', border: '1px solid var(--line-soft)', borderRadius: 10,
              background: 'var(--paper-deep)' }}>
              {bodyParts.length === 0
                ? <span style={{ color: 'var(--ink-mute)', fontStyle: 'italic' }}>~ vazio ~</span>
                : bodyParts.map((p, i) => (
                    <span key={i} style={
                      p.op === 'insert'
                        ? { background: 'rgba(110,157,112,0.28)', color: 'var(--ink)', borderRadius: 3 }
                        : p.op === 'delete'
                          ? { background: 'rgba(196,51,33,0.22)', color: 'var(--ink-soft)', textDecoration: 'line-through', borderRadius: 3 }
                          : undefined
                    }>{p.text}</span>
                  ))
              }
            </div>

            {/* Legenda */}
            <div style={{ display: 'flex', gap: 18, marginTop: 14,
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
              <span><span style={{ background: 'rgba(110,157,112,0.28)', padding: '1px 6px', borderRadius: 3 }}>verde</span> adicionado</span>
              <span><span style={{ background: 'rgba(196,51,33,0.22)', textDecoration: 'line-through', padding: '1px 6px', borderRadius: 3 }}>vermelho</span> removido</span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--line)', opacity: 0.85 }}>
              {colTitle('Original (atual)', 'var(--ink-mute)')}
              <WikiArticle page={base} allPages={allPages} isGM
                onOpenPage={noop} onBack={noop} />
            </div>
            <div style={{ overflowY: 'auto' }}>
              {colTitle('Proposta (pendente)', 'var(--teal)')}
              <WikiArticle page={proposed} allPages={allPages} isGM
                onOpenPage={noop} onBack={noop} />
            </div>
          </div>
        )}

        {/* Ações */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
          padding: '14px 24px', borderTop: '1px solid var(--line)' }}>
          <button onClick={onReject} disabled={busy}
            style={{ padding: '8px 22px', borderRadius: 999, border: '1px solid var(--coral)',
              background: 'transparent', color: 'var(--coral)',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: busy ? 'wait' : 'pointer',
              letterSpacing: '0.08em', opacity: busy ? 0.6 : 1 }}>
            Rejeitar
          </button>
          <button onClick={onApprove} disabled={busy}
            style={{ padding: '8px 22px', borderRadius: 999, border: 'none',
              background: 'var(--teal)', color: '#fff',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: busy ? 'wait' : 'pointer',
              letterSpacing: '0.08em', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Aplicando...' : 'Aprovar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── WikiSection principal ─────────────────────────────────────────────────────

export default function WikiSection({ state, onUpdate }: Props) {
  const { flags, setFlag } = useCampaignFlags()
  const [pages,        setPages]        = useState<WikiPage[]>([])
  const [pendingEdits, setPendingEdits] = useState<WikiPageEdit[]>([])
  const [wikiTab,      setWikiTab]      = useState<WikiTab>('paginas')
  const [catFilter,    setCatFilter]    = useState<WikiCategory | 'all'>('all')
  const [editing,      setEditing]      = useState<WikiPage | null | 'new'>(null)
  const [sheetOpen,    setSheetOpen]    = useState<SheetSubject | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [seeding,      setSeeding]      = useState(false)
  const [seedResult,   setSeedResult]   = useState<{ created: number; skipped: number } | null>(null)
  const [reviewEdit,   setReviewEdit]   = useState<WikiPageEdit | null>(null)
  const [reviewBusy,   setReviewBusy]   = useState(false)

  useEffect(() => {
    Promise.all([listWikiPages(), listPendingEdits()]).then(([p, edits]) => {
      setPages(p as WikiPage[])
      setPendingEdits(edits as WikiPageEdit[])
      setLoading(false)
    })
  }, [])

  const filtered = catFilter === 'all' ? pages : pages.filter(p => p.category === catFilter)

  const handleSaved = (page: WikiPage) => {
    setPages(prev => {
      const idx = prev.findIndex(p => p.id === page.id)
      return idx >= 0 ? prev.map(p => p.id === page.id ? page : p) : [...prev, page]
    })
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta página da Wiki? Esta ação não pode ser desfeita.')) return
    await deleteWikiPage(id)
    setPages(prev => prev.filter(p => p.id !== id))
  }

  const handleVisChange = async (page: WikiPage, vis: WikiVisibility) => {
    await setWikiPageVisibility(page.id, vis)
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, visibility: vis } : p))
  }

  const handleApproveEdit = async (edit: WikiPageEdit) => {
    setReviewBusy(true)
    const updated = await approveWikiEdit(edit)
    setReviewBusy(false)
    if (updated) {
      setPages(prev => prev.map(p => p.id === updated.id ? updated : p))
      setPendingEdits(prev => prev.filter(e => e.id !== edit.id))
      setReviewEdit(prev => prev?.id === edit.id ? null : prev)
    }
  }

  const handleRejectEdit = async (editId: string) => {
    setReviewBusy(true)
    await rejectWikiEdit(editId)
    setReviewBusy(false)
    setPendingEdits(prev => prev.filter(e => e.id !== editId))
    setReviewEdit(prev => prev?.id === editId ? null : prev)
  }

  const handleApprovePage = async (pageId: string) => {
    await approveWikiPage(pageId)
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, status: 'approved' } : p))
  }

  const handleRejectPage = async (pageId: string) => {
    await rejectWikiPage(pageId)
    setPages(prev => prev.filter(p => p.id !== pageId))
  }

  const handleSeed = async () => {
    if (!confirm('Inicializar páginas de personagens? Páginas existentes não serão duplicadas.')) return
    setSeeding(true)
    const result = await seedWikiPages(state)
    setSeedResult(result)
    setSeeding(false)
    const freshPages = await listWikiPages()
    setPages(freshPages as WikiPage[])
  }

  const handleExportAll = () => {
    const toExport = catFilter === 'all' ? pages : filtered
    if (toExport.length === 0) return
    exportWikiPages(toExport, catFilter === 'all' ? 'todas' : catFilter)
  }

  const handleImport = async () => {
    const imported = await pickWikiImport()
    if (!imported || imported.length === 0) return
    if (!confirm(`Importar ${imported.length} página(s) como novas? Vínculos de entidade não são reaproveitados.`)) return
    const created = await importWikiPages(imported)
    if (created > 0) {
      const fresh = await listWikiPages()
      setPages(fresh as WikiPage[])
    }
    alert(`${created} página(s) importada(s).`)
  }

  const pendingPages = pages.filter(p => p.status === 'pending')
  const pendingCount = pendingPages.length + pendingEdits.length

  const openSheet = (page: WikiPage) => {
    if (!page.linked_type || !page.linked_id) return
    const kind = page.linked_type === 'tamer'    ? 'tamer'
               : page.linked_type === 'digimon'  ? 'digimon'
               : page.linked_type === 'survivor' ? 'survivor'
               : null
    if (kind) setSheetOpen({ kind, id: page.linked_id })
  }

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)', padding: '24px 0' }}>
      Carregando Wiki...
    </div>
  )

  const SUB_TABS: { id: WikiTab; label: string; badge?: number }[] = [
    { id: 'paginas',    label: 'Páginas' },
    { id: 'aprovacoes', label: 'Aprovações', badge: pendingCount || undefined },
  ]

  return (
    <div>
      {/* Toggle global: páginas detalhadas para todos */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, padding: '12px 16px', marginBottom: 20, borderRadius: 12,
        background: 'var(--paper-deep)', border: '1px solid var(--line)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--ink)' }}>
            Páginas detalhadas
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12,
            color: 'var(--ink-mute)', marginTop: 2 }}>
            Ativa o novo layout (infobox, galeria, links) para todos os jogadores.
          </div>
        </div>
        <button onClick={() => setFlag('wiki_detailed_pages', !flags.wiki_detailed_pages)}
          style={{ flexShrink: 0, width: 52, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: flags.wiki_detailed_pages ? 'var(--teal)' : 'var(--line)',
            position: 'relative', transition: 'background 0.15s' }}>
          <span style={{ position: 'absolute', top: 3, left: flags.wiki_detailed_pages ? 27 : 3,
            width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
        </button>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setWikiTab(t.id)}
            style={{ padding: '8px 18px', border: 'none', borderRadius: 999,
              background: wikiTab === t.id ? 'var(--ink)' : 'var(--paper-deep)',
              color: wikiTab === t.id ? 'var(--paper)' : 'var(--ink-soft)',
              fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.label}
            {t.badge ? (
              <span style={{ background: 'var(--coral)', color: '#fff', borderRadius: 999,
                padding: '1px 6px', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {wikiTab === 'paginas' && editing === null && (
          <>
            {seedResult && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                letterSpacing: '0.08em', alignSelf: 'center' }}>
                {seedResult.created} criadas · {seedResult.skipped} já existiam
              </span>
            )}
            <button onClick={handleSeed} disabled={seeding}
              style={{ padding: '8px 18px', borderRadius: 999, border: 'none',
                background: 'var(--teal)', color: '#fff',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                cursor: seeding ? 'wait' : 'pointer', letterSpacing: '0.1em',
                opacity: seeding ? 0.6 : 1 }}>
              {seeding ? 'Inicializando...' : 'Inicializar páginas'}
            </button>
            <button onClick={handleExportAll} disabled={filtered.length === 0}
              title="Exportar as páginas do filtro atual para um arquivo JSON"
              style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid var(--line)',
                background: 'transparent', color: 'var(--ink-soft)',
                fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                letterSpacing: '0.1em', opacity: filtered.length === 0 ? 0.5 : 1 }}>
              ↓ Exportar
            </button>
            <button onClick={handleImport}
              title="Importar páginas de um arquivo JSON"
              style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid var(--line)',
                background: 'transparent', color: 'var(--ink-soft)',
                fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                letterSpacing: '0.1em' }}>
              ↑ Importar
            </button>
            <button onClick={() => setEditing('new')}
              style={{ padding: '8px 20px', borderRadius: 999, border: 'none',
                background: 'var(--coral)', color: '#fff',
                fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                letterSpacing: '0.1em' }}>
              + Nova Página
            </button>
          </>
        )}
      </div>

      {/* ── Páginas ── */}
      {wikiTab === 'paginas' && (
        <>
          {/* Formulário de criação/edição */}
          {editing !== null && (
            <div style={{ padding: 20, background: 'var(--paper-deep)', border: '1px solid var(--line)',
              borderRadius: 12, marginBottom: 24 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 16 }}>
                {editing === 'new' ? 'Nova Página' : `Editando: ${(editing as WikiPage).title}`}
              </div>
              <WikiPageForm
                initial={editing === 'new' ? null : editing as WikiPage}
                onSave={handleSaved}
                onCancel={() => setEditing(null)}
                state={state}
              />
            </div>
          )}

          {/* Filtros por categoria */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            <button onClick={() => setCatFilter('all')}
              style={{ padding: '5px 14px', borderRadius: 999,
                border: `1.5px solid ${catFilter === 'all' ? 'var(--coral)' : 'var(--line)'}`,
                background: catFilter === 'all' ? 'var(--coral)' : 'transparent',
                color: catFilter === 'all' ? '#fff' : 'var(--ink-mute)',
                fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                letterSpacing: '0.08em' }}>
              Todas ({pages.length})
            </button>
            {WIKI_CATEGORIES.map(c => {
              const count = pages.filter(p => p.category === c.value).length
              if (count === 0) return null
              return (
                <button key={c.value} onClick={() => setCatFilter(c.value)}
                  style={{ padding: '5px 14px', borderRadius: 999,
                    border: `1.5px solid ${catFilter === c.value ? 'var(--teal)' : 'var(--line)'}`,
                    background: catFilter === c.value ? 'var(--teal)' : 'transparent',
                    color: catFilter === c.value ? '#fff' : 'var(--ink-mute)',
                    fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                    letterSpacing: '0.08em' }}>
                  {c.label} ({count})
                </button>
              )
            })}
          </div>

          {/* Lista de páginas */}
          {filtered.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              color: 'var(--ink-mute)', textAlign: 'center', padding: '40px 0' }}>
              ~ nenhuma página nesta categoria ~
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(page => (
                <div key={page.id} style={{ display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', background: 'var(--paper-deep)',
                  border: '1px solid var(--line-soft)', borderRadius: 10 }}>
                  {avatarFile(page.avatar_url, page.title, 40)}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14,
                        textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        {page.title}
                      </strong>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                        background: 'var(--paper)', border: '1px solid var(--line-soft)',
                        borderRadius: 4, padding: '1px 6px', letterSpacing: '0.1em' }}>
                        {WIKI_CATEGORIES.find(c => c.value === page.category)?.label ?? page.category}
                      </span>
                    </div>
                    {page.body && (
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12,
                        color: 'var(--ink-soft)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                        {page.body.replace(/[#*_]/g, '').slice(0, 80)}…
                      </div>
                    )}
                  </div>

                  {/* Visibilidade inline */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['hidden', 'name', 'full'] as WikiVisibility[]).map(v => (
                      <button key={v} onClick={() => handleVisChange(page, v)}
                        style={{ padding: '3px 10px', borderRadius: 999,
                          border: `1.5px solid ${page.visibility === v ? VISIBILITY_COLORS[v] : 'var(--line-soft)'}`,
                          background: page.visibility === v ? VISIBILITY_COLORS[v] : 'transparent',
                          color: page.visibility === v ? 'var(--paper)' : 'var(--ink-mute)',
                          fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
                          letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {VISIBILITY_LABELS[v]}
                      </button>
                    ))}
                  </div>

                  {/* Botão ficha */}
                  {page.linked_type && page.linked_id && ['tamer','digimon','survivor'].includes(page.linked_type) && (
                    <button onClick={() => openSheet(page)}
                      style={{ padding: '5px 12px', borderRadius: 999,
                        border: '1px solid var(--teal)', background: 'transparent', color: 'var(--teal)',
                        fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
                        letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                      Ver Ficha
                    </button>
                  )}

                  {/* Exportar / Editar / Deletar */}
                  <button onClick={() => exportWikiPages([page])} title="Exportar esta página"
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '2px 6px' }}>
                    ↓
                  </button>
                  <button onClick={() => setEditing(page)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '2px 6px' }}>
                    ✎
                  </button>
                  <button onClick={() => handleDelete(page.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--coral)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '2px 6px' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Aprovações ── */}
      {wikiTab === 'aprovacoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {pendingCount === 0 && (
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              color: 'var(--ink-mute)', textAlign: 'center', padding: '40px 0' }}>
              ~ nenhuma contribuição aguardando aprovação ~
            </div>
          )}

          {/* Novas páginas pendentes */}
          {pendingPages.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 14 }}>
                Novas páginas ({pendingPages.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingPages.map(page => (
                  <div key={page.id} style={{ padding: '16px 20px', background: 'var(--paper-deep)',
                    border: '1px solid var(--wheat)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 14,
                            textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            {page.title}
                          </strong>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
                            background: 'var(--paper)', border: '1px solid var(--line-soft)',
                            borderRadius: 4, padding: '1px 6px' }}>
                            {WIKI_CATEGORIES.find(c => c.value === page.category)?.label ?? page.category}
                          </span>
                        </div>
                        {page.body && (
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13,
                            color: 'var(--ink-soft)', lineHeight: 1.6,
                            maxHeight: 120, overflow: 'hidden' }}>
                            {page.body.replace(/[#*_]/g, '').slice(0, 300)}
                            {page.body.length > 300 ? '…' : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => handleApprovePage(page.id)}
                          style={{ padding: '6px 16px', borderRadius: 999, border: 'none',
                            background: 'var(--teal)', color: '#fff',
                            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                            letterSpacing: '0.08em' }}>
                          Aprovar
                        </button>
                        <button onClick={() => handleRejectPage(page.id)}
                          style={{ padding: '6px 16px', borderRadius: 999,
                            border: '1px solid var(--coral)', background: 'transparent', color: 'var(--coral)',
                            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                            letterSpacing: '0.08em' }}>
                          Rejeitar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edições pendentes */}
          {pendingEdits.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 14 }}>
                Edições de páginas existentes ({pendingEdits.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingEdits.map(edit => {
                  const originalPage = pages.find(p => p.id === edit.page_id)
                  const titleChanged = !!originalPage && originalPage.title !== edit.title
                  const catChanged   = !!originalPage && originalPage.category !== edit.category
                  return (
                    <div key={edit.id} style={{ padding: '16px 20px', background: 'var(--paper-deep)',
                      border: '1px solid var(--wheat)', borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--wheat)',
                          letterSpacing: '0.1em', marginBottom: 4 }}>
                          edição de: {originalPage?.title ?? edit.page_id}
                        </div>
                        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                          fontSize: 12, color: 'var(--ink-mute)' }}>
                          {titleChanged && <>título alterado · </>}
                          {catChanged && <>categoria alterada · </>}
                          conteúdo proposto — abra para revisar
                        </div>
                      </div>
                      <button onClick={() => setReviewEdit(edit)}
                        style={{ padding: '6px 16px', borderRadius: 999, border: '1px solid var(--teal)',
                          background: 'transparent', color: 'var(--teal)',
                          fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                          letterSpacing: '0.08em', flexShrink: 0 }}>
                        Ver alterações
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Revisão de edição pendente (original vs. proposta) */}
      {reviewEdit && (
        <EditReviewModal
          edit={reviewEdit}
          original={pages.find(p => p.id === reviewEdit.page_id)}
          allPages={pages}
          busy={reviewBusy}
          onApprove={() => handleApproveEdit(reviewEdit)}
          onReject={() => handleRejectEdit(reviewEdit.id)}
          onClose={() => setReviewEdit(null)}
        />
      )}

      {/* SheetModal para fichas vinculadas */}
      {sheetOpen && (
        <SheetModal
          subject={sheetOpen}
          state={state}
          onSaveState={onUpdate}
          onClose={() => setSheetOpen(null)}
          editable
          isGM
        />
      )}
    </div>
  )
}
