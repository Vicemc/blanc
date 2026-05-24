import { useEffect } from 'react'

interface ToastProps { msg: string; onDone: () => void }

export function Toast({ msg, onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--ink)', color: 'var(--paper)',
      padding: '10px 22px', borderRadius: 999,
      fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em',
      zIndex: 300, animation: 'fadeUp 0.2s ease', whiteSpace: 'nowrap',
    }}>{msg}</div>
  )
}
