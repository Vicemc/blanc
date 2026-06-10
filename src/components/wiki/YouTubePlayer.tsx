import React, { useRef, useState, useCallback, useEffect } from 'react'
import { youtubeEmbedUrl } from './youtube'

interface Props {
  youtubeId: string
  title:     string
  artist?:   string
  onClose:   () => void
}

const WIDTH = 420
const HEIGHT = 236 + 40  // iframe 16:9 (420×236) + barra de título

// Player flutuante arrastável do YouTube — estilo picture-in-picture.
export default function YouTubePlayer({ youtubeId, title, artist, onClose }: Props) {
  // Posição inicial: canto inferior direito.
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(16, window.innerWidth - WIDTH - 24) : 24,
    y: typeof window !== 'undefined' ? Math.max(16, window.innerHeight - HEIGHT - 24) : 24,
  }))
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.preventDefault()
  }, [pos])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return
      const x = Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - WIDTH)
      const y = Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 44)
      setPos({ x, y })
    }
    const onUp = () => { drag.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, width: WIDTH, zIndex: 3000,
      borderRadius: 12, overflow: 'hidden', background: '#0d0d0f',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>

      {/* Barra de título (arrastável) */}
      <div onMouseDown={onMouseDown}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          background: '#1a1a1e', cursor: 'move', userSelect: 'none' }}>
        <span style={{ color: '#ff5a4d', fontSize: 13 }}>♪</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 11,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          {artist && (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono)', fontSize: 9,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {artist}
            </div>
          )}
        </div>
        <button onClick={onClose} aria-label="Fechar"
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>
          ✕
        </button>
      </div>

      {/* Vídeo */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
        <iframe
          src={youtubeEmbedUrl(youtubeId)}
          title={title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  )
}
