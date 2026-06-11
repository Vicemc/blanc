import { useState, useEffect, useRef, useCallback } from 'react'
import { useSettings } from '../lib/settings'
import type { GameMap, MapLayer, MapPin, MapVisibility } from '../types/map'
import type { WikiPage } from '../types/wiki'
import { listMaps, saveMap, deleteMap, listLayers, listPins, exportMap, pickMapImport, importMap } from '../lib/db/maps'
import { listWikiPages } from '../lib/db/wiki'
import { uploadImage } from '../lib/db/storage'
import MapCanvas from '../components/map/MapCanvas'
import MapEditorPanel from '../components/map/MapEditorPanel'

interface Props {
  isGM: boolean
}

const VISIBILITY_LABELS: Record<MapVisibility, string> = {
  hidden: 'Oculto',
  name:   'Nome',
  full:   'Completo',
}

const VISIBILITY_COLORS: Record<MapVisibility, string> = {
  hidden: 'var(--ink-mute)',
  name:   'var(--wheat)',
  full:   'var(--teal)',
}

function MapCardThumb({ map }: { map: GameMap }) {
  return (
    <div style={{
      aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden',
      background: 'var(--paper-deep)', border: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginBottom: 10,
    }}>
      {map.bg_url ? (
        <img src={map.bg_url} alt={map.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>
          sem imagem
        </span>
      )}
    </div>
  )
}

interface MapViewerProps {
  map:       GameMap
  allMaps:   GameMap[]
  wikiPages: WikiPage[]
  isGM:      boolean
  onBack:    () => void
  onOpenMap: (id: string) => void
  onMapChange: (m: GameMap) => void
}

function MapViewer({ map, allMaps, wikiPages, isGM, onBack, onOpenMap, onMapChange }: MapViewerProps) {
  const [layers,     setLayers]     = useState<MapLayer[]>([])
  const [pins,       setPins]       = useState<MapPin[]>([])
  const [addingPin,  setAddingPin]  = useState(false)
  const [editingPin, setEditingPin] = useState<MapPin | null>(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([listLayers(map.id), listPins(map.id)]).then(([l, p]) => {
      setLayers(l); setPins(p); setLoading(false)
    })
  }, [map.id])

  const handleToggleAddPin = useCallback(() => {
    setAddingPin(v => !v)
    setEditingPin(null)
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 400, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)',
      letterSpacing: '0.12em', textTransform: 'uppercase' }}>
      Carregando mapa...
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.1em', padding: 0 }}>
          ← Mapas
        </button>
        <span style={{ color: 'var(--line)' }}>/</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16,
          textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          {map.title}
        </span>
        {isGM && (
          <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 10,
            color: VISIBILITY_COLORS[map.visibility], letterSpacing: '0.1em' }}>
            · {VISIBILITY_LABELS[map.visibility]}
          </span>
        )}
      </div>

      {/* Canvas area */}
      <div style={{ position: 'relative', flex: 1, minHeight: 460 }}>
        <MapCanvas
          map={map}
          layers={layers}
          pins={pins}
          wikiPages={wikiPages}
          allMaps={allMaps}
          isGM={isGM}
          addingPin={addingPin}
          editingPin={editingPin}
          onPinsChange={setPins}
          onEditPin={setEditingPin}
          onOpenMap={onOpenMap}
        />
        {isGM && (
          <MapEditorPanel
            map={map}
            layers={layers}
            pins={pins}
            wikiPages={wikiPages}
            allMaps={allMaps}
            addingPin={addingPin}
            onToggleAddPin={handleToggleAddPin}
            onLayersChange={setLayers}
            onPinsChange={setPins}
            onMapChange={onMapChange}
            editingPin={editingPin}
            onEditPin={setEditingPin}
          />
        )}
      </div>
    </div>
  )
}

// ── MapPage principal ─────────────────────────────────────────────────────────

export default function MapPage({ isGM }: Props) {
  const { isTaglineHidden } = useSettings()
  const [maps,       setMaps]       = useState<GameMap[]>([])
  const [wikiPages,  setWikiPages]  = useState<WikiPage[]>([])
  const [openMapId,  setOpenMapId]  = useState<string | null>(null)
  const [creating,   setCreating]   = useState(false)
  const [newTitle,   setNewTitle]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingBg = useRef<{ url: string; w: number; h: number } | null>(null)

  useEffect(() => {
    Promise.all([listMaps(), listWikiPages()]).then(([m, w]) => {
      setMaps(m); setWikiPages(w); setLoading(false)
    })
  }, [])

  const visibleMaps = isGM ? maps : maps.filter(m => m.visibility !== 'hidden')
  const openMap     = openMapId ? maps.find(m => m.id === openMapId) ?? null : null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string
      const img = new Image()
      img.onload = async () => {
        const url = await uploadImage(dataUrl, `maps/bg-${Date.now()}`, 'portraits')
        pendingBg.current = { url: url ?? dataUrl, w: img.naturalWidth, h: img.naturalHeight }
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setSaving(true)
    const bg = pendingBg.current
    const result = await saveMap({
      title:     newTitle.trim(),
      bg_url:    bg?.url ?? null,
      bg_width:  bg?.w   ?? 1000,
      bg_height: bg?.h   ?? 800,
    })
    setSaving(false)
    if (result) {
      setMaps(prev => [...prev, result])
      setNewTitle('')
      pendingBg.current = null
      setCreating(false)
      setOpenMapId(result.id)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remover mapa e todos os pins? Não pode ser desfeito.')) return
    await deleteMap(id)
    setMaps(prev => prev.filter(m => m.id !== id))
    if (openMapId === id) setOpenMapId(null)
  }

  const handleMapChange = useCallback((m: GameMap) => {
    setMaps(prev => prev.map(x => x.id === m.id ? m : x))
  }, [])

  const handleImportMap = async () => {
    const pkg = await pickMapImport()
    if (!pkg) { alert('Arquivo de mapa inválido.'); return }
    const created = await importMap(pkg)
    if (created) {
      setMaps(prev => [...prev, created])
      setOpenMapId(created.id)
    }
  }

  if (loading) return (
    <div style={{ maxWidth: 960, margin: '80px auto', textAlign: 'center',
      fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-mute)',
      letterSpacing: '0.12em', textTransform: 'uppercase' }}>
      Carregando mapas...
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '28px var(--page-pad-x) 0' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42,
          textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Mapas
        </h1>
        {!openMap && !isTaglineHidden('mapas') && (
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
            fontSize: 18, color: 'var(--ink-soft)', marginBottom: 24 }}>
            ~ mapas interativos do mundo ~
          </div>
        )}
      </div>

      <div style={{ padding: '0 var(--page-pad-x)' }}>
        {/* ── Visualizador de mapa aberto ── */}
        {openMap ? (
          <MapViewer
            map={openMap}
            allMaps={maps}
            wikiPages={wikiPages}
            isGM={isGM}
            onBack={() => setOpenMapId(null)}
            onOpenMap={id => setOpenMapId(id)}
            onMapChange={handleMapChange}
          />
        ) : (
          <>
            {/* Formulário de criação */}
            {isGM && (
              <div style={{ marginBottom: 28 }}>
                {creating ? (
                  <div style={{ padding: 20, background: 'var(--paper-deep)',
                    border: '1px solid var(--line)', borderRadius: 12 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 14 }}>
                      Novo Mapa
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                        placeholder="Título do mapa"
                        style={{ padding: '8px 12px', border: '1px solid var(--line)',
                          borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)',
                          fontFamily: 'var(--font-body)', fontSize: 13 }} />
                      <input ref={fileRef} type="file" accept="image/*"
                        style={{ display: 'none' }} onChange={handleFileChange} />
                      <button onClick={() => fileRef.current?.click()}
                        style={{ padding: '8px 16px', border: '1px solid var(--line)',
                          borderRadius: 8, background: 'var(--paper-deep)', cursor: 'pointer',
                          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)',
                          letterSpacing: '0.1em', textAlign: 'left' }}>
                        {pendingBg.current ? `✓ Imagem carregada (${pendingBg.current.w}×${pendingBg.current.h})` : '↑ Enviar imagem de fundo'}
                      </button>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setCreating(false); setNewTitle(''); pendingBg.current = null }}
                          style={{ padding: '8px 20px', border: '1px solid var(--line)', borderRadius: 999,
                            background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11,
                            cursor: 'pointer', color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>
                          Cancelar
                        </button>
                        <button onClick={handleCreate} disabled={saving || !newTitle.trim()}
                          style={{ padding: '8px 24px', borderRadius: 999, border: 'none',
                            background: 'var(--coral)', color: '#fff',
                            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: saving ? 'wait' : 'pointer',
                            letterSpacing: '0.1em', opacity: saving || !newTitle.trim() ? 0.6 : 1 }}>
                          {saving ? 'Criando...' : 'Criar Mapa'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setCreating(true)}
                      style={{ padding: '10px 24px', borderRadius: 999, border: 'none',
                        background: 'var(--coral)', color: '#fff',
                        fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                        letterSpacing: '0.1em' }}>
                      + Novo Mapa
                    </button>
                    <button onClick={handleImportMap}
                      title="Importar um mapa (com camadas e pins) de um arquivo JSON"
                      style={{ padding: '10px 20px', borderRadius: 999, border: '1px solid var(--line)',
                        background: 'transparent', color: 'var(--ink-soft)',
                        fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                        letterSpacing: '0.1em' }}>
                      ↑ Importar Mapa
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Grade de mapas */}
            {visibleMaps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0',
                fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-mute)', fontSize: 18 }}>
                ~ nenhum mapa disponível ~
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {visibleMaps.map(m => (
                  <div key={m.id} style={{ border: '1px solid var(--line-soft)',
                    borderRadius: 12, overflow: 'hidden', background: 'var(--paper-deep)',
                    cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                    onClick={() => setOpenMapId(m.id)}>
                    <MapCardThumb map={m} />
                    <div style={{ padding: '10px 14px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15,
                          textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {m.title}
                        </span>
                        {isGM && (
                          <>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                              color: VISIBILITY_COLORS[m.visibility], letterSpacing: '0.1em' }}>
                              {VISIBILITY_LABELS[m.visibility]}
                            </span>
                            <button onClick={e => { e.stopPropagation(); exportMap(m.id) }}
                              title="Exportar este mapa"
                              style={{ background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--ink-mute)', fontSize: 13, padding: '2px 6px' }}>
                              ↓
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleDelete(m.id) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--coral)', fontSize: 13, padding: '2px 6px' }}>
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                      {m.description && (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12,
                          color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.4 }}>
                          {m.description.slice(0, 80)}{m.description.length > 80 ? '…' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
