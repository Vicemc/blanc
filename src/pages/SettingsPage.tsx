import React from 'react'
import { PageHead } from '../components/PageHead'
import { useSettings } from '../lib/settings'

const PAGE_OPTIONS = [
  { id: 'party',     label: 'Party'      },
  { id: 'goggle',    label: 'Goggle Girl' },
  { id: 'teatro',    label: 'Teatro'     },
  { id: 'sistema',   label: 'Sistema'    },
  { id: 'backstage', label: 'Backstage'  },
]

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  padding: '18px 0', borderBottom: '1px solid var(--line-soft)', gap: 24,
}
const label: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, color: 'var(--ink)',
}
const sub: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-mute)',
  marginTop: 4, lineHeight: 1.5, maxWidth: 420,
}
const sectionHead: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em',
  textTransform: 'uppercase', color: 'var(--ink-mute)',
  padding: '28px 0 10px', borderBottom: '1px solid var(--line)',
  marginBottom: 0,
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center',
        width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: checked ? 'var(--teal)' : 'var(--line)',
        transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}>
      <span style={{
        position: 'absolute', left: checked ? 'calc(100% - 22px)' : 2,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transition: 'left 0.2s',
      }} />
    </button>
  )
}

// ── Radio card ────────────────────────────────────────────────────────────────
function RadioCard({ active, onClick, title, desc }: {
  active: boolean; onClick: () => void; title: string; desc: string
}) {
  return (
    <button onClick={onClick} style={{
      padding: '14px 18px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
      border: `2px solid ${active ? 'var(--teal)' : 'var(--line)'}`,
      background: active ? 'rgba(74,155,155,0.06)' : 'var(--paper)',
      transition: 'all 0.15s', flex: 1,
    }}>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
        color: active ? 'var(--teal)' : 'var(--ink)', marginBottom: 4 }}>
        {active ? '● ' : '○ '}{title}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
        {desc}
      </div>
    </button>
  )
}

export default function SettingsPage() {
  const { settings, update } = useSettings()
  const { hideTaglines, roundPopup, sheetView } = settings

  function toggleTaglinePage(pageId: string) {
    const current = hideTaglines.pages.filter(p => p !== 'all')
    const next = current.includes(pageId)
      ? current.filter(p => p !== pageId)
      : [...current, pageId]
    update({ hideTaglines: { ...hideTaglines, pages: next } })
  }

  function toggleAllPages() {
    const isAll = hideTaglines.pages.includes('all')
    update({ hideTaglines: { ...hideTaglines, pages: isAll ? [] : ['all'] } })
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 80 }}>
      <PageHead title="Configurações" tag="preferências de exibição" pageId="configuracoes" />

      {/* ── Taglines ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 56px' }}>
        <div style={sectionHead}>Exibição</div>

        <div style={row}>
          <div>
            <div style={label}>Esconder Taglines</div>
            <div style={sub}>
              Remove as linhas decorativas em itálico (~...~) que aparecem como subtítulos e
              flavor text no site. Você pode escolher esconder em todas as páginas ou só em algumas.
            </div>
            {hideTaglines.enabled && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 13 }}>
                  <input type="checkbox" checked={hideTaglines.pages.includes('all')}
                    onChange={toggleAllPages}
                    style={{ width: 15, height: 15, accentColor: 'var(--teal)', cursor: 'pointer' }} />
                  Todas as páginas
                </label>
                {!hideTaglines.pages.includes('all') && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', paddingLeft: 4 }}>
                    {PAGE_OPTIONS.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6,
                        cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13 }}>
                        <input type="checkbox"
                          checked={hideTaglines.pages.includes(p.id)}
                          onChange={() => toggleTaglinePage(p.id)}
                          style={{ width: 14, height: 14, accentColor: 'var(--teal)', cursor: 'pointer' }} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Toggle checked={hideTaglines.enabled}
            onChange={v => update({ hideTaglines: { ...hideTaglines, enabled: v } })} />
        </div>

        {/* ── Teatro ───────────────────────────────────────────────────────── */}
        <div style={sectionHead}>Teatro / Palco</div>

        <div style={row}>
          <div>
            <div style={label}>Pop-up de Round</div>
            <div style={sub}>
              Exibe uma notificação central com o número do novo Round quando o contador avança no
              Palco. Fecha automaticamente após 2,5 segundos e toca um som.
            </div>
          </div>
          <Toggle checked={roundPopup} onChange={v => update({ roundPopup: v })} />
        </div>

        {/* ── Ficha ─────────────────────────────────────────────────────────── */}
        <div style={sectionHead}>Ficha de Personagem</div>

        <div style={{ ...row, flexDirection: 'column', borderBottom: 0 }}>
          <div>
            <div style={label}>Modo de Visualização</div>
            <div style={sub}>
              O modo Horizontal amplia o modal da ficha e organiza as seções em colunas lado a lado,
              reduzindo a necessidade de scroll.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 14 }}>
            <RadioCard
              active={sheetView === 'vertical'}
              onClick={() => update({ sheetView: 'vertical' })}
              title="Vertical"
              desc="Layout padrão com scroll vertical. Boa para telas mais estreitas."
            />
            <RadioCard
              active={sheetView === 'horizontal'}
              onClick={() => update({ sheetView: 'horizontal' })}
              title="Horizontal"
              desc="Modal amplo com Atributos e Skills em colunas, menos scroll necessário."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
