// src/pages/ViewerPage.tsx
// Modo visitante — visualização somente leitura de fichas, Goggle Girl e palco ativo.
// Acessível via /view sem autenticação.

import { useState } from 'react'
import type { AppState } from '../types'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import { GrainFill } from '../components/GrainFill'
import { findDigimon, findBug } from '../data/store'

interface Props { state: AppState }

type ViewTab = 'party' | 'bestiary' | 'palco'

export default function ViewerPage({ state }: Props) {
  const [tab,  setTab]  = useState<ViewTab>('party')
  const [open, setOpen] = useState<SheetSubject | null>(null)

  // Palco ativo = mais recente com atores em cena
  const activePalco = [...state.stages]
    .reverse()
    .find(s => s.sides.allies.length + s.sides.enemies.length > 0)
    ?? state.stages[state.stages.length - 1]
    ?? null

  const isVis = (type: string, id: string) => {
    const raw = (state.visibility ?? {})[`${type}:${id}`] as unknown
    if (raw === false || raw === 'hidden' || raw === undefined) {
      return type === 'stage'
    }
    return true
  }

  const TABS: { id: ViewTab; label: string }[] = [
    { id: 'party',    label: 'Party' },
    { id: 'bestiary', label: 'Bestiário' },
    { id: 'palco',    label: 'Palco Ativo' },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '28px 56px 0' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42,
          textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Modo Visitante
        </h1>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
          fontSize: 18, color: 'var(--ink-soft)', marginBottom: 8 }}>
          ~ visualização somente leitura ~
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 20 }}>
          Clique em qualquer ficha para ver os detalhes
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 56px' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '12px 22px', border: 'none', background: 'transparent',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em',
              textTransform: 'uppercase', cursor: 'pointer',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-mute)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--coral)' : 'transparent'}` }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '24px 56px' }}>

        {/* Party */}
        {tab === 'party' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 16 }}>
            {state.tamers.map(t => {
              const digi = t.digimonId ? findDigimon(state, t.digimonId) : null
              const cur  = digi ? digi.stages[digi.currentStage] ?? digi.stages[0] : null
              return (
                <div key={t.id} onClick={() => setOpen({ kind: 'tamer', id: t.id })}
                  style={{ background: 'var(--paper)', border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)', overflow: 'hidden', cursor: 'pointer',
                    transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                  <div style={{ aspectRatio: '1', position: 'relative' }}>
                    <GrainFill color={t.portrait} image={t.image} />
                  </div>
                  <div style={{ padding: '12px 14px 14px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16,
                      textTransform: 'uppercase', margin: '0 0 3px' }}>{t.name}</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                      fontSize: 13, color: 'var(--ink-soft)' }}>~ {t.tagline} ~</div>
                    {digi && cur && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dotted var(--line)',
                        display: 'flex', gap: 6, alignItems: 'center' }}>
                        <div style={{ width: 20, height: 20, borderRadius: 5, overflow: 'hidden',
                          position: 'relative', flexShrink: 0 }}>
                          <GrainFill color={cur.portrait} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                          {digi.name.replace(' Line', '')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Bestiário */}
        {tab === 'bestiary' && (
          <div>
            {state.sectors.map(sector => {
              const digimons = state.bestiary.filter(d =>
                d.sectors.includes(sector.n) && isVis('bestiary', d.id)
              )
              if (digimons.length === 0) return null
              return (
                <div key={sector.n} style={{ marginBottom: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden',
                      position: 'relative', flexShrink: 0 }}>
                      <div className={`fill-${sector.color}`} style={{ position: 'absolute', inset: 0 }} />
                      <div className="grain" style={{ position: 'absolute', inset: 0 }} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18,
                        textTransform: 'uppercase' }}>Setor {sector.n} — {sector.name}</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                        fontSize: 13, color: 'var(--ink-soft)' }}>{sector.bioma}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>
                    {digimons.map(d => {
                      const s = d.stages[d.currentStage] ?? d.stages[0]
                      return (
                        <div key={d.id}
                          onClick={() => setOpen(d.tamerId ? { kind: 'pair', tamerId: d.tamerId, digimonId: d.id } : { kind: 'wild', id: d.id })}
                          style={{ background: 'var(--paper)', border: '1px solid var(--line)',
                            borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.12s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
                          <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
                            position: 'relative', flexShrink: 0 }}>
                            <GrainFill color={s.portrait} />
                          </div>
                          <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13,
                              textTransform: 'uppercase' }}>{d.name.replace(' Line', '')}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                              letterSpacing: '0.08em', textTransform: 'uppercase',
                              color: 'var(--ink-mute)', marginTop: 2 }}>
                              {s.level} · {s.type}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Bugs visíveis */}
            {state.bugs.filter(b => isVis('bug', b.id)).length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18,
                  textTransform: 'uppercase', marginBottom: 14 }}>BUGs</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>
                  {state.bugs.filter(b => isVis('bug', b.id)).map(b => (
                    <div key={b.id} onClick={() => setOpen({ kind: 'bug', id: b.id })}
                      style={{ background: 'var(--paper)', border: '1px solid var(--line)',
                        borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
                        position: 'relative', flexShrink: 0 }}>
                        <div className={`fill-bug-${b.color}`} style={{ position: 'absolute', inset: 0 }} />
                        <div className="grain grain-invert" style={{ position: 'absolute', inset: 0 }} />
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13,
                          textTransform: 'uppercase' }}>{b.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: 'var(--ink-mute)', marginTop: 2 }}>
                          {b.class}.{b.color}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Palco ativo */}
        {tab === 'palco' && (
          activePalco ? (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28,
                  textTransform: 'uppercase', margin: '0 0 4px' }}>{activePalco.title}</h2>
                {activePalco.subtitle && (
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                    fontSize: 16, color: 'var(--ink-soft)' }}>~ {activePalco.subtitle} ~</div>
                )}
              </div>

              {(['allies', 'enemies'] as const).map(side => (
                <div key={side} style={{ marginBottom: 24 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16,
                    textTransform: 'uppercase', marginBottom: 12,
                    paddingBottom: 6, borderBottom: `2px solid ${side === 'allies' ? 'var(--green)' : 'var(--coral)'}` }}>
                    {side === 'allies' ? 'Aliados' : 'Inimigos'}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginLeft: 10,
                      color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>
                      {activePalco.sides[side].length} em cena
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {activePalco.sides[side].map((a, i) => {
                      let title = '?', portrait = 'sage'
                      if (a.kind === 'human') {
                        const t = state.tamers.find(x => x.id === a.id)
                        title = t?.name ?? '?'; portrait = t?.portrait ?? 'sage'
                      } else if (a.kind === 'pair') {
                        const d = findDigimon(state, a.digimonId)
                        const s = d?.stages[a.stage ?? 0]
                        title = s?.stageName ?? d?.name ?? '?'; portrait = s?.portrait ?? 'sage'
                      } else if (a.kind === 'wild') {
                        const d = findDigimon(state, a.id)
                        title = d?.name ?? '?'; portrait = d?.stages[0]?.portrait ?? 'sage'
                      } else if (a.kind === 'bug') {
                        const b = findBug(state, a.id)
                        title = b?.name ?? '?'; portrait = `bug-${b?.color ?? 'red'}`
                      }
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column',
                          alignItems: 'center', gap: 6, minWidth: 60 }}>
                          <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden',
                            position: 'relative' }}>
                            <div className={`fill-${portrait}`} style={{ position: 'absolute', inset: 0 }} />
                            <div className="grain" style={{ position: 'absolute', inset: 0 }} />
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            color: 'var(--ink-soft)', textAlign: 'center', maxWidth: 64,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              fontSize: 18, color: 'var(--ink-mute)', textAlign: 'center', padding: '48px 0' }}>
              ~ nenhum palco ativo no momento ~
            </div>
          )
        )}
      </div>

      {open && (
        <SheetModal
          subject={open}
          state={state}
          onClose={() => setOpen(null)}
          editable={false}
        />
      )}
    </div>
  )
}