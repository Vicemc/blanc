// src/components/ThemeToggle.tsx
// Botão flutuante fixo no canto inferior esquerdo para alternar entre
// tema claro e escuro. Sempre presente em todas as páginas.
import { useSettings } from '../lib/settings'

export function ThemeToggle() {
  const { settings, update } = useSettings()
  const isDark = settings.theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => update({ theme: isDark ? 'light' : 'dark' })}
      title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 200,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '1px solid var(--line)',
        background: 'var(--paper-deep)',
        color: 'var(--ink)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        lineHeight: 1,
        boxShadow: 'var(--shadow, 0 2px 8px rgba(0,0,0,0.18))',
        transition: 'background 0.15s, color 0.15s, transform 0.1s',
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.92)' }}
      onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      {isDark ? '☀' : '☾'}
    </button>
  )
}
