import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppState } from '../../types'
import type { SheetSubject } from '../sheet/shared/types'
import type { WikiPage, WikiCategory, WikiLinkedType } from '../../types/wiki'
import { listWikiPages, saveWikiPage } from '../../lib/db/wiki'
import { isSupabaseReady } from '../../lib/supabase'

// Mapeia o assunto da ficha para o vínculo da Wiki (linked_type + linked_id)
// e fornece um título/categoria padrão para o stub criado.
function resolveLink(subject: SheetSubject, state: AppState):
  { type: WikiLinkedType; id: string; title: string; category: WikiCategory } | null {
  switch (subject.kind) {
    case 'tamer': {
      const t = state.tamers.find(x => x.id === subject.id)
      if (!t) return null
      return { type: 'tamer', id: t.id, title: `${t.name} ${t.surname ?? ''}`.trim(), category: 'humanos' }
    }
    case 'survivor': {
      const sv = (state.survivors ?? []).find(x => x.id === subject.id)
      if (!sv) return null
      return { type: 'survivor', id: sv.id, title: `${sv.name}${sv.surname ? ' ' + sv.surname : ''}`.trim(), category: 'humanos' }
    }
    case 'pair': {
      const d = state.bestiary.find(x => x.id === subject.digimonId)
      if (!d) return null
      const stage = d.stages[subject.stage ?? d.currentStage]
      return { type: 'digimon', id: d.id, title: stage?.stageName ?? d.name, category: 'digimons' }
    }
    case 'wild':
    case 'digimon': {
      const d = state.bestiary.find(x => x.id === subject.id)
      if (!d) return null
      return { type: 'digimon', id: d.id, title: d.name.replace(' Line', ''), category: 'digimons' }
    }
    case 'bug': {
      const b = state.bugs.find(x => x.id === subject.id)
      if (!b) return null
      return { type: 'bug', id: b.id, title: b.name, category: 'bugs' }
    }
    case 'sign': {
      const sg = (state.signs ?? []).find(x => x.id === subject.id)
      if (!sg) return null
      return { type: 'sign', id: sg.id, title: `${sg.code} · ${sg.name}`.trim(), category: 'signs' }
    }
    default:
      return null
  }
}

// Botão dentro da ficha: "Ver página na Wiki" (se já vinculada) ou
// "Criar página na Wiki" (cria um stub já vinculado à entidade).
export function WikiLinkButton({ subject, state, isGM }: {
  subject: SheetSubject; state: AppState; isGM: boolean
}) {
  const navigate = useNavigate()
  const [linked, setLinked] = useState<WikiPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const link = resolveLink(subject, state)

  useEffect(() => {
    let alive = true
    if (!isSupabaseReady || !link) { setLoading(false); return }
    listWikiPages().then(pages => {
      if (!alive) return
      const found = (pages as WikiPage[]).find(
        p => p.linked_type === link.type && p.linked_id === link.id,
      ) ?? null
      setLinked(found)
      setLoading(false)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject])

  if (!isSupabaseReady || !link) return null

  const handleCreate = async () => {
    setCreating(true)
    const page = await saveWikiPage({
      title:       link.title,
      category:    link.category,
      body:        '',
      visibility:  'hidden',
      linked_type: link.type,
      linked_id:   link.id,
      status:      'approved',
    })
    setCreating(false)
    if (page) {
      setLinked(page)
      navigate(`/wiki/${page.id}`)
    }
  }

  const baseStyle: React.CSSProperties = {
    padding: '5px 14px', borderRadius: 999, cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
    textTransform: 'uppercase', whiteSpace: 'nowrap',
  }

  if (loading) {
    return (
      <span style={{ ...baseStyle, color: 'var(--ink-mute)', cursor: 'default' }}>
        wiki…
      </span>
    )
  }

  if (linked) {
    return (
      <button onClick={() => navigate(`/wiki/${linked.id}`)}
        style={{ ...baseStyle, border: '1px solid var(--teal)', background: 'transparent', color: 'var(--teal)' }}>
        📖 Ver na Wiki
      </button>
    )
  }

  // Sem página: só o GM cria stubs vinculados.
  if (!isGM) return null
  return (
    <button onClick={handleCreate} disabled={creating}
      style={{ ...baseStyle, border: '1px solid var(--line)', background: 'transparent',
        color: 'var(--ink-soft)', opacity: creating ? 0.6 : 1 }}>
      {creating ? 'Criando…' : '＋ Criar página na Wiki'}
    </button>
  )
}
