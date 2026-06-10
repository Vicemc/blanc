import React, { useState } from 'react'
import type { WikiPage, WikiBlock, WikiGalleryImage } from '../../types/wiki'
import { WIKI_CATEGORIES } from '../../types/wiki'
import { renderWikiMarkdown } from './wikiLinks'
import { toBlocks, groupIntoRows } from './wikiBlocks'
import { youtubeThumb } from './youtube'
import YouTubePlayer from './YouTubePlayer'

// Altura máxima de uma imagem de bloco = altura do avatar (coluna até 300px, aspecto 3/4 → 400px).
const AVATAR_MAX_HEIGHT = 400

interface Props {
  page:       WikiPage
  allPages:   WikiPage[]
  isGM:       boolean
  coverFill?: string | null  // classe fill-* do retrato da entidade vinculada
  onOpenPage: (id: string) => void
  onBack:     () => void
  onOpenSheet?: (page: WikiPage) => void
  onEdit?:    () => void   // botão de edição (player ou GM), opcional
  editLabel?: string
}

function Lightbox({ url, caption, onClose }: { url: string; caption?: string; onClose: () => void }) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
      <img src={url} alt={caption ?? ''} style={{ maxWidth: '90%', maxHeight: '85%', objectFit: 'contain', borderRadius: 8 }} />
      {caption && (
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: '#e8e0d0', fontSize: 14 }}>{caption}</div>
      )}
    </div>
  )
}

export default function WikiArticle({ page, allPages, isGM, coverFill, onOpenPage, onBack, onOpenSheet, onEdit, editLabel }: Props) {
  const [lightbox, setLightbox] = useState<{ url: string; caption?: string } | null>(null)
  const [musicOpen, setMusicOpen] = useState(false)

  const content  = page.content ?? {}
  const music    = content.music && content.music.youtubeId ? content.music : null
  const allBlocks = toBlocks(content, page.body)
  // A primeira infobox vai para o cabeçalho (ao lado do cover); o resto flui abaixo.
  const headerInfoboxIdx = allBlocks.findIndex(b => b.type === 'infobox')
  const headerInfobox = headerInfoboxIdx >= 0 ? allBlocks[headerInfoboxIdx] : null
  const flowBlocks = headerInfoboxIdx >= 0
    ? allBlocks.filter((_, i) => i !== headerInfoboxIdx)
    : allBlocks
  const rows     = groupIntoRows(flowBlocks)
  const catLabel = WIKI_CATEGORIES.find(c => c.value === page.category)?.label ?? page.category

  const canSheet = page.linked_type && page.linked_id &&
    ['tamer', 'digimon', 'survivor'].includes(page.linked_type)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px var(--page-pad-x) 80px' }}>
      {/* Voltar */}
      <button onClick={onBack}
        style={{ marginBottom: 20, padding: '6px 14px', borderRadius: 999,
          border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-mute)',
          fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em' }}>
        ← Voltar
      </button>

      {/* Cabeçalho: cover + título + infobox */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 28, alignItems: 'start' }}>
        {/* Coluna esquerda: cover + card de música */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Cover */}
          <div className={coverFill ?? undefined}
            style={{ borderRadius: 16, overflow: 'hidden', border: '1.5px solid var(--line)',
            background: coverFill ? undefined : 'var(--paper-deep)', aspectRatio: '3/4',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {page.avatar_url ? (
              <img src={page.avatar_url} alt={page.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 96, color: 'var(--ink-mute)', textTransform: 'uppercase' }}>
                {page.title.charAt(0)}
              </span>
            )}
          </div>

        </div>

        {/* Título + infobox */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 6 }}>
              {catLabel}
              {isGM && (
                <span style={{ marginLeft: 10, color: page.visibility === 'hidden' ? 'var(--coral)' : page.visibility === 'name' ? 'var(--wheat)' : 'var(--teal)' }}>
                  · {page.visibility}
                </span>
              )}
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, textTransform: 'uppercase',
              letterSpacing: '-0.02em', margin: 0, lineHeight: 1.05 }}>
              {page.title}
            </h1>
          </div>

          {/* Infobox ao lado do avatar */}
          {headerInfobox && (
            <BlockView block={headerInfobox} allPages={allPages}
              onOpenPage={onOpenPage} onOpenImage={setLightbox} />
          )}

          {/* Ações + card de música à direita */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {canSheet && onOpenSheet && (
              <button onClick={() => onOpenSheet(page)}
                style={{ padding: '7px 16px', borderRadius: 999, border: '1px solid var(--teal)',
                  background: 'transparent', color: 'var(--teal)', fontFamily: 'var(--font-mono)',
                  fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em' }}>
                Ver Ficha
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit}
                style={{ padding: '7px 16px', borderRadius: 999, border: '1px solid var(--line)',
                  background: 'transparent', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)',
                  fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em' }}>
                {editLabel ?? 'Editar'}
              </button>
            )}

            {/* Card de música (estilo carrd) */}
            {music && (
              <button onClick={() => setMusicOpen(true)} aria-label={`Tocar ${music.title}`}
                style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                  marginLeft: 'auto', padding: '8px 12px', borderRadius: 12, border: '1px solid var(--line)',
                  cursor: 'pointer', overflow: 'hidden', textAlign: 'left',
                  minWidth: 220, maxWidth: 320, flex: '1 1 220px',
                  background: `linear-gradient(rgba(20,16,30,0.72), rgba(20,16,30,0.82)), url(${youtubeThumb(music.youtubeId)}) center/cover` }}>
                <span style={{ color: '#fff', fontSize: 14, flexShrink: 0 }}>♪</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: 14,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {music.title}
                  </div>
                  {music.artist && (
                    <div style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'var(--font-mono)',
                      fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {music.artist}
                    </div>
                  )}
                </div>
                <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12 }}>
                  ▶
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Blocos em grade de colunas */}
      {rows.length > 0 && (
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {rows.map((row, ri) => {
            // Linha de 2 colunas com imagem + algo: estica para a imagem casar a altura do vizinho.
            const pairedImage = row.length === 2 && row.some(b => b.type === 'image')
            return (
              <div key={ri} style={{ display: 'grid',
                gridTemplateColumns: row.length === 2 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                gap: 18, alignItems: pairedImage ? 'stretch' : 'start' }}>
                {row.map(block => (
                  <BlockView key={block.id} block={block} allPages={allPages} paired={row.length === 2}
                    onOpenPage={onOpenPage} onOpenImage={setLightbox} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {lightbox && <Lightbox url={lightbox.url} caption={lightbox.caption} onClose={() => setLightbox(null)} />}
      {musicOpen && music && (
        <YouTubePlayer youtubeId={music.youtubeId} title={music.title} artist={music.artist}
          onClose={() => setMusicOpen(false)} />
      )}
    </div>
  )
}

// ── Renderização de um bloco ──────────────────────────────────────────────────

interface BlockViewProps {
  block:       WikiBlock
  allPages:    WikiPage[]
  paired?:     boolean   // true quando o bloco está numa linha de 2 colunas
  onOpenPage:  (id: string) => void
  onOpenImage: (img: WikiGalleryImage) => void
}

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 12,
}

function BlockView({ block, allPages, paired, onOpenPage, onOpenImage }: BlockViewProps) {
  if (block.type === 'divider') {
    return <div style={{ borderTop: '1px solid var(--line-soft)', margin: '6px 0' }} />
  }

  if (block.type === 'infobox') {
    if (block.fields.length === 0) return null
    return (
      <div>
        {block.title && (
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase',
            letterSpacing: '-0.01em', margin: '0 0 10px' }}>{block.title}</h2>
        )}
        <div style={{ border: '1px solid var(--line-soft)', borderRadius: 12, overflow: 'hidden',
          background: 'var(--paper-deep)' }}>
          {block.fields.map((f, i) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 0,
              borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)' }}>
              <div style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)',
                background: 'var(--paper)', borderRight: '1px solid var(--line-soft)' }}>
                {f.label}
              </div>
              <div style={{ padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)' }}>
                {renderWikiMarkdown(f.value, allPages, onOpenPage)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (block.type === 'text') {
    return (
      <div>
        {block.title && (
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase',
            letterSpacing: '-0.01em', margin: '0 0 10px' }}>{block.title}</h2>
        )}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-soft)', textAlign: 'justify' }}>
          {renderWikiMarkdown(block.body, allPages, onOpenPage)}
        </div>
      </div>
    )
  }

  if (block.type === 'image') {
    if (!block.url) return null
    // Ao lado de outro bloco (par): a imagem acompanha a largura da coluna e nunca
    // ultrapassa a altura do vizinho (célula esticada + object-fit contain).
    // Sozinha (largura cheia): tamanho natural, limitada à altura do avatar.
    return (
      <figure style={{ margin: 0, minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', height: paired ? '100%' : undefined }}>
        <img src={block.url} alt={block.caption ?? ''}
          onClick={() => onOpenImage({ url: block.url!, caption: block.caption })}
          style={{ cursor: 'pointer', display: 'block',
            width: paired ? '100%' : 'auto',
            maxWidth: '100%',
            maxHeight: paired ? '100%' : AVATAR_MAX_HEIGHT,
            height: 'auto', objectFit: 'contain', borderRadius: 12,
            border: '1px solid var(--line)', background: 'var(--paper-deep)' }} />
        {block.caption && (
          <figcaption style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12,
            color: 'var(--ink-mute)', marginTop: 6, textAlign: 'center' }}>
            {block.caption}
          </figcaption>
        )}
      </figure>
    )
  }

  if (block.type === 'gallery') {
    if (block.images.length === 0) return null
    return (
      <div>
        {block.title && <div style={sectionLabel}>{block.title}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 12 }}>
          {block.images.map((g, idx) => (
            <div key={idx} onClick={() => onOpenImage(g)}
              style={{ cursor: 'pointer', borderRadius: 10, overflow: 'hidden',
                border: '1px solid var(--line)', background: 'var(--paper-deep)', aspectRatio: '1' }}>
              <img src={g.url} alt={g.caption ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}
