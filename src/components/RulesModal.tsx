import React, { useState } from 'react'
import type { AppState, KeywordEntry, ConditionEntry } from '../types'
import { BASE_KEYWORDS, BASE_CONDITIONS, getEffectiveClimas, groupBy } from '../data/rulesData'

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <b key={i}>{p.slice(2, -2)}</b>
          : p
      )}
    </>
  )
}

function KwCard({ kw }: { kw: KeywordEntry }) {
  const tag = kw.type === 'reaction' ? 'Reação'
    : (kw.category?.includes('Ataque') ? 'Ataque' : 'Ação')
  const tagColor = kw.type === 'reaction' ? 'var(--teal)' : 'var(--ink-soft)'
  return (
    <div style={{ padding: '10px 14px', border: '1px solid var(--line)',
      borderRadius: 8, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: tagColor, border: `1px solid ${tagColor}`,
          borderRadius: 3, padding: '1px 5px' }}>{tag}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }}>
          {kw.keyword}
        </span>
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)',
        margin: 0, lineHeight: 1.5 }}>
        <RichText text={kw.desc} />
      </p>
    </div>
  )
}

function CondCard({ cond }: { cond: ConditionEntry }) {
  const typeColor = cond.type === 'wound' ? 'var(--coral)'
    : cond.type === 'positive' ? 'var(--teal)'
    : 'var(--ink-mute)'
  return (
    <div style={{ padding: '10px 14px', border: `1px solid var(--line)`,
      borderLeft: `3px solid ${typeColor}`, borderRadius: 8, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }}>
          {cond.name}
        </span>
        {cond.resist && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)',
            letterSpacing: '0.08em' }}>Resistir: {cond.resist}</span>
        )}
      </div>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)',
        margin: 0, lineHeight: 1.5 }}>
        <RichText text={cond.desc} />
      </p>
    </div>
  )
}

type Tab = 'keywords' | 'conditions' | 'climas'

export function RulesModal({ state, onClose }: { state: AppState; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('keywords')

  const allKeywords: KeywordEntry[] = [
    ...BASE_KEYWORDS,
    ...(state.customKeywords ?? []),
  ]
  const allConditions: ConditionEntry[] = [
    ...BASE_CONDITIONS,
    ...(state.customConditions ?? []),
  ]
  const allClimas = getEffectiveClimas(state.customClimas ?? [])

  const kwGroups = groupBy(allKeywords, kw =>
    kw.type === 'reaction' ? 'Reações' : (kw.category ?? 'Outros')
  )
  const condGroups = groupBy(allConditions, c => c.category ?? 'Outros')

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 999, cursor: 'pointer', border: 'none',
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
    background: active ? 'var(--ink)' : 'transparent',
    color: active ? 'var(--paper)' : 'var(--ink-mute)',
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.65)', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px',
        overflowY: 'auto' }}>
      <div style={{ background: 'var(--paper-deep)', border: '1px solid var(--line)',
        borderRadius: 12, width: '100%', maxWidth: 760, position: 'relative',
        boxShadow: '0 8px 48px rgba(0,0,0,0.35)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>Regras do Sistema</span>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--ink-mute)',
              lineHeight: 1, padding: '2px 6px' }}
            title="Fechar">×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 20px',
          borderBottom: '1px solid var(--line)' }}>
          <button style={tabStyle(tab === 'keywords')}   onClick={() => setTab('keywords')}>Palavras-chave</button>
          <button style={tabStyle(tab === 'conditions')} onClick={() => setTab('conditions')}>Condições</button>
          <button style={tabStyle(tab === 'climas')}     onClick={() => setTab('climas')}>Climas</button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
          {tab === 'keywords' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {kwGroups.map(([group, kws]) => (
                <div key={group}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>{group}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {kws.map(kw => <KwCard key={kw.id} kw={kw} />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'conditions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {condGroups.map(([group, conds]) => (
                <div key={group}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>{group}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {conds.map(c => <CondCard key={c.id} cond={c} />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'climas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {allClimas.map(c => (
                <div key={c.id} style={{ padding: '12px 16px', border: '1px solid var(--line)',
                  borderRadius: 8, background: 'var(--paper)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{c.icon}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: `var(--${c.color})`,
                      border: `1px solid var(--${c.color})`, borderRadius: 3, padding: '1px 5px',
                      letterSpacing: '0.08em', textTransform: 'uppercase' }}>{c.type}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {c.effects.map((ef, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                          color: `var(--${ef.color})`, border: `1px solid var(--${ef.color})`,
                          borderRadius: 3, padding: '1px 5px', flexShrink: 0,
                          textTransform: 'uppercase', letterSpacing: '0.06em' }}>{ef.tag}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13,
                          color: 'var(--ink-soft)', lineHeight: 1.4 }}>{ef.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
