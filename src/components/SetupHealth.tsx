import { useState } from 'react'
import { runHealthcheck } from '../lib/db'
import type { HealthCheck } from '../lib/db'

// Botão de diagnóstico do setup do Supabase (visível ao GM).
export function SetupHealth({ className }: { className?: string }) {
  const [checks, setChecks]   = useState<HealthCheck[] | null>(null)
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    setChecks(await runHealthcheck())
    setRunning(false)
  }

  return (
    <>
      <button className={className} onClick={run} disabled={running} title="Verificar setup do Supabase">
        {running ? '...' : '⚙ Setup'}
      </button>

      {checks && (
        <div style={{
          position: 'fixed', top: 64, right: 16, zIndex: 400, width: 320,
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--ink-mute)' }}>Diagnóstico de Setup</span>
            <button onClick={() => setChecks(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-mute)' }}>×</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {checks.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ color: c.ok ? 'var(--green)' : 'var(--coral)', flexShrink: 0 }}>
                  {c.ok ? '✓' : '✗'}
                </span>
                <span style={{ flex: 1 }}>
                  {c.label}
                  {!c.ok && c.detail && (
                    <div style={{ color: 'var(--ink-mute)', fontSize: 10, marginTop: 2 }}>{c.detail}</div>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
