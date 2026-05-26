import { useState, useEffect } from 'react'
import styles from './GrainFill.module.css'

interface GrainFillProps {
  color: string
  invert?: boolean
  className?: string
  image?: string | null
}

export function GrainFill({ color, invert = false, className = '', image }: GrainFillProps) {
  const [imgOk, setImgOk] = useState(true)
  useEffect(() => { setImgOk(true) }, [image])

  if (image && imgOk) {
    return <img src={image} alt="" className={`${styles.fill} ${className}`}
      style={{ objectFit: 'cover', width: '100%', height: '100%' }}
      onError={() => setImgOk(false)} />
  }
  return (
    <div className={`${styles.wrap} ${className}`}>
      <div className={`${styles.fill} fill-${color}`} />
      <div className={`grain ${invert ? 'grain-invert' : ''}`} />
    </div>
  )
}

// ===== Dots =====

interface DotsProps {
  value: number
  max?: number
  editable?: boolean
  xpCost?: number
  onUp?: () => void
}

export function Dots({ value, max = 5, editable, xpCost, onUp }: DotsProps) {
  const v = Math.max(0, Math.min(value, max))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{
          display: 'inline-block',
          width: 11, height: 11,
          borderRadius: '50%',
          border: '1.5px solid var(--ink)',
          background: i < v ? 'var(--ink)' : 'transparent',
          flexShrink: 0,
        }} />
      ))}
      {editable && v < max && onUp && (
        <button
          onClick={onUp}
          title={xpCost !== undefined ? `+1 (custa ${xpCost} XP)` : '+1'}
          style={{
            marginLeft: 2, background: 'transparent',
            border: '1.5px solid var(--ink)', borderRadius: '50%',
            width: 16, height: 16, cursor: 'pointer',
            fontSize: 12, lineHeight: '13px', padding: 0,
            color: 'var(--ink)', flexShrink: 0,
          }}>+</button>
      )}
    </span>
  )
}
