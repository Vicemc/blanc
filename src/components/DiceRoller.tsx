import { useState } from 'react'
import { rollPool, type RollResult } from '../lib/dice'

interface HistoryEntry extends RollResult { id: string; label?: string }

// Rolador de dados flutuante (FAB), disponível em todas as páginas.
export function DiceRoller() {
  const [open, setOpen]       = useState(false)
  const [pool, setPool]       = useState(5)
  const [difficulty, setDiff] = useState(7)
  const [explode, setExplode] = useState(true)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const doRoll = () => {
    const r = rollPool(pool, { difficulty, explode })
    setHistory(h => [{ ...r, id: `roll-${Date.now().toString(36)}` }, ...h].slice(0, 8))
  }

  const last = history[0]

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Rolar dados (d10 pool)"
        aria-label="Rolador de dados"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 350,
          width: 52, height: 52, borderRadius: '50%', cursor: 'pointer',
          border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
          fontSize: 24, lineHeight: 1, boxShadow: 'var(--shadow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        🎲
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 20, zIndex: 350, width: 280,
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase' }}>Dados</span>
            <button onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-mute)' }}>×</button>
          </div>

          {/* Pool */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={ctrlLabel}>Pool</span>
            <button onClick={() => setPool(p => Math.max(0, p - 1))} style={miniBtn}>−</button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{pool}</span>
            <button onClick={() => setPool(p => p + 1)} style={miniBtn}>+</button>
          </div>

          {/* Dificuldade */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={ctrlLabel}>Dif.</span>
            <button onClick={() => setDiff(d => Math.max(2, d - 1))} style={miniBtn}>−</button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, minWidth: 28, textAlign: 'center' }}>{difficulty}</span>
            <button onClick={() => setDiff(d => Math.min(10, d + 1))} style={miniBtn}>+</button>
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', cursor: 'pointer' }}>
              <input type="checkbox" checked={explode} onChange={e => setExplode(e.target.checked)}
                style={{ accentColor: 'var(--coral)' }} />
              10 explode
            </label>
          </div>

          <button onClick={doRoll} style={{
            width: '100%', padding: '10px 0', borderRadius: 999, cursor: 'pointer',
            border: '1px solid var(--coral)', background: 'var(--coral)', color: 'var(--paper)',
            fontFamily: 'var(--font-display)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 12 }}>
            Rolar {pool}d10
          </button>

          {/* Resultado */}
          {last && (
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1,
                color: last.botch ? 'var(--coral)' : last.crit ? 'var(--gold)' : 'var(--ink)' }}>
                {last.chance ? (last.successes ? '✓' : '✗') : last.successes}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginTop: 2 }}>
                {last.chance ? 'Chance Roll' : last.botch ? 'Botch' : last.crit ? `${last.successes} sucessos · crítico` : `${last.successes} sucesso${last.successes !== 1 ? 's' : ''}`}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 6,
                display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                {last.rolls.map((d, i) => (
                  <span key={i} style={{
                    minWidth: 20, padding: '1px 4px', borderRadius: 4, textAlign: 'center',
                    border: '1px solid var(--line)',
                    background: d >= last.difficulty ? 'rgba(110,157,112,0.18)' : d === 1 ? 'rgba(226,88,69,0.14)' : 'transparent',
                    color: d >= last.difficulty ? 'var(--green)' : d === 1 ? 'var(--coral)' : 'var(--ink-mute)',
                  }}>{d}</span>
                ))}
              </div>
            </div>
          )}

          {/* Histórico */}
          {history.length > 1 && (
            <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8,
              maxHeight: 120, overflowY: 'auto' }}>
              {history.slice(1).map(h => (
                <div key={h.id} style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--ink-mute)', padding: '2px 0' }}>
                  {h.chance ? 'chance' : `${h.pool}d10`} → {h.botch ? 'botch' : `${h.successes} suc.`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

const ctrlLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--ink-mute)', minWidth: 38,
}
const miniBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: '50%', border: '1.5px solid var(--line)',
  background: 'transparent', cursor: 'pointer', fontSize: 14, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)',
}
