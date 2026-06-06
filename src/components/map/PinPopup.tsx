import type { MapPin } from '../../types/map'
import type { WikiPage } from '../../types/wiki'
import { PIN_ICON_LABELS } from '../../types/map'

interface Props {
  pin:       MapPin
  wikiPage?: WikiPage | null
  isGM:      boolean
  onOpenMap?: (mapId: string) => void
  onEdit?:   () => void
  onDelete?: () => void
}

export default function PinPopup({ pin, wikiPage, isGM, onOpenMap, onEdit, onDelete }: Props) {
  const canSeeBody = pin.visibility === 'full' || isGM

  return (
    <div style={{ minWidth: 180, maxWidth: 260, fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: canSeeBody ? 10 : 0 }}>
        {wikiPage?.avatar_url && (
          <img src={wikiPage.avatar_url} alt={wikiPage.title}
            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover',
              border: '1.5px solid var(--line)', flexShrink: 0 }} />
        )}
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13,
            textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.2 }}>
            {pin.label}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)',
            letterSpacing: '0.1em', marginTop: 2 }}>
            {PIN_ICON_LABELS[pin.icon]}
            {isGM && (
              <span style={{ marginLeft: 6, color: pin.visibility === 'hidden' ? 'var(--coral)' : pin.visibility === 'name' ? 'var(--wheat)' : 'var(--teal)' }}>
                · {pin.visibility}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Corpo — só para visibility full ou GM */}
      {canSeeBody && (
        <>
          {pin.description && (
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5,
              margin: '0 0 10px', borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
              {pin.description}
            </p>
          )}

          {wikiPage && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8,
              borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>
                WIKI →
              </span>{' '}
              {wikiPage.title}
            </div>
          )}

          {pin.linked_map_id && (
            <button onClick={() => onOpenMap?.(pin.linked_map_id!)}
              style={{ width: '100%', padding: '6px 12px', borderRadius: 8,
                border: '1px solid var(--teal)', background: 'transparent', color: 'var(--teal)',
                fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                letterSpacing: '0.08em', marginBottom: 6 }}>
              Ir para mapa →
            </button>
          )}

          {isGM && (
            <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
              <button onClick={onEdit}
                style={{ flex: 1, padding: '5px 10px', borderRadius: 6,
                  border: '1px solid var(--line)', background: 'transparent',
                  fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
                  color: 'var(--ink-soft)', letterSpacing: '0.08em' }}>
                Editar
              </button>
              <button onClick={onDelete}
                style={{ padding: '5px 10px', borderRadius: 6,
                  border: '1px solid var(--coral)', background: 'transparent',
                  fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
                  color: 'var(--coral)', letterSpacing: '0.08em' }}>
                ✕
              </button>
            </div>
          )}
        </>
      )}

      {!canSeeBody && !isGM && (
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
          fontSize: 11, color: 'var(--ink-mute)', textAlign: 'center', paddingTop: 4 }}>
          ~ informações restritas ~
        </div>
      )}
    </div>
  )
}
