import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppState } from '../types'
import { SheetModal } from './Sheet'
import type { SheetSubject } from './Sheet'
import { BASE_KEYWORDS, BASE_CONDITIONS, ruleSlug } from '../data/rulesData'

interface Result {
  id:    string
  label: string
  kind:  string   // rótulo da categoria
  go:    () => void
}

export function GlobalSearch({ state, isGM = false, className }: {
  state: AppState; isGM?: boolean; className?: string
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<SheetSubject | null>(null)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  // Atalho "/" abre a busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault(); setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const keywords = state.customKeywords?.length   ? state.customKeywords   : BASE_KEYWORDS
  const conditions = state.customConditions?.length ? state.customConditions : BASE_CONDITIONS

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const match = (s: string) => s.toLowerCase().includes(q)
    const out: Result[] = []
    const closeAnd = (fn: () => void) => () => { fn(); setOpen(false); setQuery('') }

    for (const t of state.tamers) {
      if (match(t.name) || match(t.surname ?? '')) out.push({ id: t.id, label: `${t.name} ${t.surname ?? ''}`.trim(), kind: 'Tamer', go: closeAnd(() => setSheet({ kind: 'tamer', id: t.id })) })
    }
    for (const sv of state.survivors ?? []) {
      if (match(sv.name)) out.push({ id: sv.id, label: sv.name, kind: 'Survivor', go: closeAnd(() => setSheet({ kind: 'survivor', id: sv.id })) })
    }
    for (const d of state.bestiary) {
      if (match(d.name)) out.push({ id: d.id, label: d.name.replace(' Line', ''), kind: d.tamerId ? 'Digimon' : 'Selvagem', go: closeAnd(() => setSheet(d.tamerId ? { kind: 'pair', tamerId: d.tamerId, digimonId: d.id, stage: d.currentStage } : { kind: 'wild', id: d.id })) })
    }
    for (const b of state.bugs) {
      if (match(b.name) || match(b.class)) out.push({ id: b.id, label: b.name, kind: 'BUG', go: closeAnd(() => setSheet({ kind: 'bug', id: b.id })) })
    }
    for (const sg of state.signs ?? []) {
      if (match(sg.name) || match(sg.code)) out.push({ id: sg.id, label: `${sg.code} · ${sg.name}`, kind: 'SIGN', go: closeAnd(() => setSheet({ kind: 'sign', id: sg.id })) })
    }
    for (const kw of keywords) {
      if (match(kw.keyword)) out.push({ id: `kw-${kw.id}`, label: kw.keyword, kind: 'Keyword', go: closeAnd(() => navigate(`/sistema?kw=${encodeURIComponent(ruleSlug(kw.keyword))}`)) })
    }
    for (const c of conditions) {
      if (match(c.name)) out.push({ id: `cond-${c.id}`, label: c.name, kind: 'Condição', go: closeAnd(() => navigate(`/sistema?kw=${encodeURIComponent(ruleSlug(c.name))}`)) })
    }
    return out.slice(0, 40)
  }, [query, state, keywords, conditions, navigate])

  return (
    <>
      <button className={className} onClick={() => setOpen(true)} title="Buscar (tecla /)" aria-label="Buscar">🔍</button>

      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}
          style={{ alignItems: 'flex-start', paddingTop: '12vh' }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 540, background: 'var(--paper)',
            border: '1px solid var(--line)', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar tamer, digimon, BUG, SIGN, keyword..."
              style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--line-soft)',
                padding: '16px 20px', fontFamily: 'var(--font-body)', fontSize: 16,
                background: 'transparent', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {query.trim().length >= 2 && results.length === 0 && (
                <div style={{ padding: '20px', fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                  fontSize: 15, color: 'var(--ink-mute)', textAlign: 'center' }}>~ nada encontrado ~</div>
              )}
              {results.map(r => (
                <button key={`${r.kind}-${r.id}`} onClick={r.go}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    width: '100%', padding: '11px 20px', border: 'none', background: 'transparent',
                    cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--line-soft)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--paper-deep)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--ink)' }}>{r.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--ink-mute)', flexShrink: 0 }}>{r.kind}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sheet && <SheetModal subject={sheet} state={state} onClose={() => setSheet(null)} editable={false} isGM={isGM} />}
    </>
  )
}
