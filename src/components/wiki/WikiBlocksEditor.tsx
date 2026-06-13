import React, { useRef, useState, useCallback } from 'react'
import type { WikiContent, WikiBlock, WikiBlockType, WikiBlockWidth, WikiInfoField, WikiGalleryImage } from '../../types/wiki'
import { WIKI_GALLERY_MAX } from '../../types/wiki'
import { toBlocks, newBlock, newBlockId, countImages } from './wikiBlocks'
import { uploadImage } from '../../lib/db/storage'
import { parseYouTubeId, youtubeThumb } from './youtube'

interface Props {
  value:     WikiContent
  onChange:  (next: WikiContent) => void
  uploadKey: string
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB por imagem

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '7px 11px', border: '1px solid var(--line)',
  borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)',
  fontFamily: 'var(--font-body)', fontSize: 13, boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--ink-mute)',
}

const iconBtn = (color: string): React.CSSProperties => ({
  background: 'none', border: `1px solid ${color}`, borderRadius: 6,
  cursor: 'pointer', color, fontFamily: 'var(--font-mono)', fontSize: 11,
  padding: '3px 8px', lineHeight: 1,
})

const BLOCK_TYPES: { type: WikiBlockType; label: string }[] = [
  { type: 'text',    label: '＋ Texto' },
  { type: 'image',   label: '＋ Imagem' },
  { type: 'infobox', label: '＋ Infobox' },
  { type: 'gallery', label: '＋ Galeria' },
  { type: 'divider', label: '＋ Divisor' },
]

const TYPE_LABEL: Record<WikiBlockType, string> = {
  text: 'Texto', image: 'Imagem', infobox: 'Infobox', gallery: 'Galeria', divider: 'Divisor',
}

export default function WikiBlocksEditor({ value, onChange, uploadKey }: Props) {
  // Inicializa a partir do conteúdo (migra legado para blocos se necessário).
  const blocks = toBlocks(value)
  const totalImages = countImages(blocks)
  const imagesFull = totalImages >= WIKI_GALLERY_MAX

  const commit = (next: WikiBlock[]) => onChange({ ...value, blocks: next })

  const addBlock = (type: WikiBlockType) => commit([...blocks, newBlock(type)])
  const removeBlock = (id: string) => commit(blocks.filter(b => b.id !== id))
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    commit(next)
  }
  const patchBlock = (id: string, patch: Partial<WikiBlock>) =>
    commit(blocks.map(b => b.id === id ? ({ ...b, ...patch } as WikiBlock) : b))
  const setWidth = (id: string, width: WikiBlockWidth) => patchBlock(id, { width })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Música (fixa, abaixo do avatar na página) */}
      <MusicSection value={value} onChange={onChange} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>Layout em blocos</span>
        <span style={{ ...labelStyle, color: imagesFull ? 'var(--coral)' : 'var(--ink-mute)' }}>
          {totalImages}/{WIKI_GALLERY_MAX} imagens
        </span>
      </div>

      {blocks.length === 0 && (
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink-mute)' }}>
          ~ nenhum bloco — adicione abaixo ~
        </div>
      )}

      {blocks.map((block, idx) => (
        <BlockEditor
          key={block.id}
          block={block}
          idx={idx}
          total={blocks.length}
          imagesFull={imagesFull}
          uploadKey={uploadKey}
          onMove={move}
          onRemove={removeBlock}
          onPatch={patchBlock}
          onSetWidth={setWidth}
        />
      ))}

      {/* Barra de adição */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {BLOCK_TYPES.map(t => (
          <button key={t.type} onClick={() => addBlock(t.type)}
            style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--teal)',
              background: 'transparent', color: 'var(--teal)', fontFamily: 'var(--font-mono)',
              fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em' }}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Editor de um bloco ────────────────────────────────────────────────────────

interface BlockEditorProps {
  block:      WikiBlock
  idx:        number
  total:      number
  imagesFull: boolean
  uploadKey:  string
  onMove:     (idx: number, dir: -1 | 1) => void
  onRemove:   (id: string) => void
  onPatch:    (id: string, patch: Partial<WikiBlock>) => void
  onSetWidth: (id: string, width: WikiBlockWidth) => void
}

function BlockEditor({ block, idx, total, imagesFull, uploadKey, onMove, onRemove, onPatch, onSetWidth }: BlockEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => resolve(ev.target?.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  // Upload p/ bloco de imagem (1) e galeria (N até o teto global)
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    let files = Array.from(e.target.files ?? [])
    if (!files.length) return
    // Limite de 10 MB por imagem (tamanho do arquivo original)
    const oversized = files.filter(f => f.size > MAX_IMAGE_BYTES)
    if (oversized.length) {
      alert(`${oversized.length === 1 ? 'A imagem excede' : `${oversized.length} imagens excedem`} o limite de 10 MB e ${oversized.length === 1 ? 'foi ignorada' : 'foram ignoradas'}.`)
      files = files.filter(f => f.size <= MAX_IMAGE_BYTES)
    }
    if (!files.length) { if (fileRef.current) fileRef.current.value = ''; return }
    setUploading(true)
    if (block.type === 'image') {
      const url = await uploadImage(await readDataUrl(files[0]), `wiki/${uploadKey}/block-${block.id}`, 'portraits')
      if (url) onPatch(block.id, { url } as Partial<WikiBlock>)
    } else if (block.type === 'gallery') {
      const added: WikiGalleryImage[] = []
      for (let i = 0; i < files.length; i++) {
        const url = await uploadImage(await readDataUrl(files[i]), `wiki/${uploadKey}/block-${block.id}-${Date.now()}-${i}`, 'portraits')
        if (url) added.push({ url })
      }
      onPatch(block.id, { images: [...block.images, ...added] } as Partial<WikiBlock>)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [block, onPatch, uploadKey])

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper-deep)',
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Barra do bloco */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...labelStyle, color: 'var(--ink-soft)' }}>{TYPE_LABEL[block.type]}</span>
        <div style={{ flex: 1 }} />
        {/* Largura */}
        {block.type !== 'divider' && (['full', 'half'] as WikiBlockWidth[]).map(w => (
          <button key={w} onClick={() => onSetWidth(block.id, w)}
            style={{ padding: '3px 10px', borderRadius: 999,
              border: `1px solid ${block.width === w ? 'var(--teal)' : 'var(--line)'}`,
              background: block.width === w ? 'var(--teal)' : 'transparent',
              color: block.width === w ? 'var(--paper)' : 'var(--ink-mute)',
              fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
              letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {w === 'full' ? 'Largo' : 'Meio'}
          </button>
        ))}
        <button onClick={() => onMove(idx, -1)} disabled={idx === 0}
          style={{ ...iconBtn('var(--ink-mute)'), opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
        <button onClick={() => onMove(idx, 1)} disabled={idx === total - 1}
          style={{ ...iconBtn('var(--ink-mute)'), opacity: idx === total - 1 ? 0.3 : 1 }}>↓</button>
        <button onClick={() => onRemove(block.id)} style={iconBtn('var(--coral)')}>✕</button>
      </div>

      {/* Conteúdo por tipo */}
      {block.type === 'text' && (
        <>
          <input value={block.title ?? ''} onChange={e => onPatch(block.id, { title: e.target.value } as Partial<WikiBlock>)}
            placeholder="Título da seção (opcional)" style={{ ...fieldStyle, fontFamily: 'var(--font-display)' }} />
          <textarea value={block.body} onChange={e => onPatch(block.id, { body: e.target.value } as Partial<WikiBlock>)}
            placeholder="Texto (markdown: **negrito**, *itálico*, [[Link interno]], [texto](url) externo)"
            rows={4} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
        </>
      )}

      {block.type === 'infobox' && (
        <InfoboxFields
          title={block.title ?? ''}
          fields={block.fields}
          onTitle={t => onPatch(block.id, { title: t } as Partial<WikiBlock>)}
          onFields={f => onPatch(block.id, { fields: f } as Partial<WikiBlock>)}
        />
      )}

      {block.type === 'image' && (
        <>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
          {block.url ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <img src={block.url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={block.caption ?? ''} onChange={e => onPatch(block.id, { caption: e.target.value } as Partial<WikiBlock>)}
                  placeholder="Legenda (opcional)" style={fieldStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => fileRef.current?.click()} style={iconBtn('var(--ink-soft)')}>Trocar</button>
                  <button onClick={() => onPatch(block.id, { url: null } as Partial<WikiBlock>)} style={iconBtn('var(--coral)')}>Remover imagem</button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={imagesFull || uploading}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--line)',
                background: 'var(--paper)', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)',
                fontSize: 11, cursor: imagesFull ? 'not-allowed' : 'pointer', letterSpacing: '0.08em',
                opacity: imagesFull || uploading ? 0.4 : 1 }}>
              {uploading ? 'Enviando...' : imagesFull ? 'Limite de imagens atingido' : 'Enviar imagem'}
            </button>
          )}
        </>
      )}

      {block.type === 'gallery' && (
        <>
          <input value={block.title ?? ''} onChange={e => onPatch(block.id, { title: e.target.value } as Partial<WikiBlock>)}
            placeholder="Título da galeria (opcional)" style={fieldStyle} />
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
          {block.images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px,1fr))', gap: 8 }}>
              {block.images.map((g, i) => (
                <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                  border: '1px solid var(--line)' }}>
                  <img src={g.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => onPatch(block.id, { images: block.images.filter((_, j) => j !== i) } as Partial<WikiBlock>)}
                    style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%',
                      border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 10, lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={imagesFull || uploading}
            style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 999, border: '1px solid var(--teal)',
              background: 'transparent', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: 11,
              cursor: imagesFull ? 'not-allowed' : 'pointer', letterSpacing: '0.06em',
              opacity: imagesFull || uploading ? 0.4 : 1 }}>
            {uploading ? 'Enviando...' : imagesFull ? 'Limite atingido' : '＋ Imagem'}
          </button>
        </>
      )}

      {block.type === 'divider' && (
        <div style={{ borderTop: '1px solid var(--line-soft)', margin: '2px 0' }} />
      )}
    </div>
  )
}

// ── Campos da infobox ─────────────────────────────────────────────────────────

function InfoboxFields({ title, fields, onTitle, onFields }: {
  title: string
  fields: WikiInfoField[]
  onTitle: (t: string) => void
  onFields: (f: WikiInfoField[]) => void
}) {
  const add = () => onFields([...fields, { id: newBlockId(), label: '', value: '' }])
  const update = (id: string, patch: Partial<WikiInfoField>) =>
    onFields(fields.map(f => f.id === id ? { ...f, ...patch } : f))
  const remove = (id: string) => onFields(fields.filter(f => f.id !== id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input value={title} onChange={e => onTitle(e.target.value)}
        placeholder="Título do quadro (opcional)" style={{ ...fieldStyle, fontFamily: 'var(--font-display)' }} />
      {fields.map(f => (
        <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 8, alignItems: 'center' }}>
          <input value={f.label} onChange={e => update(f.id, { label: e.target.value })}
            placeholder="Rótulo" style={fieldStyle} />
          <input value={f.value} onChange={e => update(f.id, { value: e.target.value })}
            placeholder="Valor (pode usar [[Link]])" style={fieldStyle} />
          <button onClick={() => remove(f.id)} style={iconBtn('var(--coral)')}>✕</button>
        </div>
      ))}
      <button onClick={add}
        style={{ alignSelf: 'flex-start', ...iconBtn('var(--teal)'), padding: '4px 12px' }}>
        ＋ Campo
      </button>
    </div>
  )
}

// ── Seção fixa de Música ──────────────────────────────────────────────────────

function MusicSection({ value, onChange }: { value: WikiContent; onChange: (n: WikiContent) => void }) {
  const music = value.music ?? null
  const [link, setLink] = useState('')
  const [invalid, setInvalid] = useState(false)

  const apply = (raw: string) => {
    setLink(raw)
    if (!raw.trim()) { setInvalid(false); return }
    const id = parseYouTubeId(raw)
    if (!id) { setInvalid(true); return }
    setInvalid(false)
    onChange({ ...value, music: { youtubeId: id, title: music?.title ?? '', artist: music?.artist ?? '' } })
  }

  const patch = (p: Partial<NonNullable<WikiContent['music']>>) => {
    if (!music) return
    onChange({ ...value, music: { ...music, ...p } })
  }

  const remove = () => { onChange({ ...value, music: null }); setLink(''); setInvalid(false) }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper-deep)',
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>♪ Música (YouTube)</span>
        {music && <button onClick={remove} style={iconBtn('var(--coral)')}>Remover</button>}
      </div>

      {!music && (
        <input value={link} onChange={e => apply(e.target.value)}
          placeholder="Cole o link do YouTube" style={fieldStyle} />
      )}
      {invalid && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--coral)', letterSpacing: '0.06em' }}>
          Link do YouTube inválido.
        </div>
      )}

      {music && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <img src={youtubeThumb(music.youtubeId)} alt=""
            style={{ width: 88, height: 66, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input value={music.title} onChange={e => patch({ title: e.target.value })}
              placeholder="Título (ex: King)" style={{ ...fieldStyle, fontFamily: 'var(--font-display)' }} />
            <input value={music.artist ?? ''} onChange={e => patch({ artist: e.target.value })}
              placeholder="Artista (ex: Florence and the Machine)" style={fieldStyle} />
            <input value={link} onChange={e => apply(e.target.value)}
              placeholder="Trocar link do YouTube" style={{ ...fieldStyle, fontSize: 11 }} />
          </div>
        </div>
      )}
    </div>
  )
}
