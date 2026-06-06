import { useState } from 'react'
import type { GameMap, MapLayer, MapPin, MapPinIcon, MapVisibility } from '../../types/map'
import { WIKI_CATEGORIES } from '../../types/wiki'
import { PIN_ICON_LABELS, PIN_ICON_COLORS } from '../../types/map'
import type { WikiPage } from '../../types/wiki'
import { saveLayer, deleteLayer, toggleLayerVisibility, savePin, deletePin, setMapVisibility } from '../../lib/db/maps'

interface Props {
  map:        GameMap
  layers:     MapLayer[]
  pins:       MapPin[]
  wikiPages:  WikiPage[]
  allMaps:    GameMap[]
  addingPin:  boolean
  onToggleAddPin: () => void
  onLayersChange: (layers: MapLayer[]) => void
  onPinsChange:   (pins: MapPin[]) => void
  onMapChange:    (map: GameMap) => void
  editingPin: MapPin | null
  onEditPin:  (pin: MapPin | null) => void
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

type PanelTab = 'layers' | 'pin' | 'mapa'

export default function MapEditorPanel({
  map, layers, pins, wikiPages, allMaps,
  addingPin, onToggleAddPin,
  onLayersChange, onPinsChange, onMapChange,
  editingPin, onEditPin,
}: Props) {
  const [tab,          setTab]          = useState<PanelTab>('layers')
  const [newLayerName, setNewLayerName] = useState('')
  const [savingLayer,  setSavingLayer]  = useState(false)

  // Estado do formulário de pin
  const [pinLabel,       setPinLabel]       = useState(editingPin?.label       ?? '')
  const [pinDesc,        setPinDesc]        = useState(editingPin?.description ?? '')
  const [pinIcon,        setPinIcon]        = useState<MapPinIcon>(editingPin?.icon ?? 'default')
  const [pinVis,         setPinVis]         = useState<MapVisibility>(editingPin?.visibility ?? 'hidden')
  const [pinLayerId,     setPinLayerId]      = useState(editingPin?.layer_id    ?? layers[0]?.id ?? '')
  const [pinWikiId,      setPinWikiId]      = useState(editingPin?.linked_wiki_id ?? null as string | null)
  const [pinMapId,       setPinMapId]       = useState(editingPin?.linked_map_id  ?? null as string | null)
  const [savingPin,      setSavingPin]      = useState(false)

  // Sync formulário quando editingPin muda
  const prevPinId = editingPin?.id
  if (editingPin && editingPin.id !== prevPinId) {
    setPinLabel(editingPin.label)
    setPinDesc(editingPin.description)
    setPinIcon(editingPin.icon)
    setPinVis(editingPin.visibility)
    setPinLayerId(editingPin.layer_id)
    setPinWikiId(editingPin.linked_wiki_id)
    setPinMapId(editingPin.linked_map_id)
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--line)',
    borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)',
    fontFamily: 'var(--font-body)', fontSize: 12,
  }

  const handleAddLayer = async () => {
    if (!newLayerName.trim()) return
    setSavingLayer(true)
    const result = await saveLayer({ map_id: map.id, name: newLayerName.trim(), order_index: layers.length })
    setSavingLayer(false)
    if (result) { onLayersChange([...layers, result]); setNewLayerName('') }
  }

  const handleToggleLayer = async (layer: MapLayer) => {
    await toggleLayerVisibility(layer.id, !layer.visible)
    onLayersChange(layers.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l))
  }

  const handleDeleteLayer = async (id: string) => {
    if (!confirm('Remover layer? Todos os pins nela serão deletados.')) return
    await deleteLayer(id)
    onLayersChange(layers.filter(l => l.id !== id))
    onPinsChange(pins.filter(p => p.layer_id !== id))
  }

  const handleSavePin = async () => {
    if (!pinLabel.trim() || !pinLayerId) return
    if (!editingPin) return
    setSavingPin(true)
    const result = await savePin({
      ...editingPin,
      label:          pinLabel.trim(),
      description:    pinDesc,
      icon:           pinIcon,
      visibility:     pinVis,
      layer_id:       pinLayerId,
      linked_wiki_id: pinWikiId,
      linked_map_id:  pinMapId,
    })
    setSavingPin(false)
    if (result) {
      onPinsChange(pins.map(p => p.id === result.id ? result : p))
      onEditPin(null)
    }
  }

  const handleDeletePin = async () => {
    if (!editingPin) return
    if (!confirm('Remover este pin?')) return
    await deletePin(editingPin.id)
    onPinsChange(pins.filter(p => p.id !== editingPin.id))
    onEditPin(null)
  }

  const handleMapVis = async (vis: MapVisibility) => {
    await setMapVisibility(map.id, vis)
    onMapChange({ ...map, visibility: vis })
  }

  // Quando um pin está sendo editado, vai para a aba pin
  const activeTab = editingPin ? 'pin' : tab

  return (
    <div style={{
      position: 'absolute', top: 10, right: 10, zIndex: 1000,
      width: 260, background: 'var(--paper)',
      border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
        {([['layers', 'Layers'], ['mapa', 'Mapa']] as [PanelTab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); onEditPin(null) }}
            style={{ flex: 1, padding: '10px 0', border: 'none',
              background: activeTab === id ? 'var(--paper-deep)' : 'transparent',
              fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
              color: activeTab === id ? 'var(--ink)' : 'var(--ink-mute)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              borderBottom: `2px solid ${activeTab === id ? 'var(--coral)' : 'transparent'}` }}>
            {label}
          </button>
        ))}
        {editingPin && (
          <button onClick={() => setTab('pin')}
            style={{ flex: 1, padding: '10px 0', border: 'none',
              background: activeTab === 'pin' ? 'var(--paper-deep)' : 'transparent',
              fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
              color: activeTab === 'pin' ? 'var(--coral)' : 'var(--ink-mute)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              borderBottom: `2px solid ${activeTab === 'pin' ? 'var(--coral)' : 'transparent'}` }}>
            Pin ✎
          </button>
        )}
      </div>

      <div style={{ padding: 14, maxHeight: 480, overflowY: 'auto' }}>

        {/* ── Layers ── */}
        {activeTab === 'layers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={onToggleAddPin}
              style={{ width: '100%', padding: '8px 0', borderRadius: 999,
                border: 'none',
                background: addingPin ? 'var(--coral)' : 'var(--ink)',
                color: 'var(--paper)',
                fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                letterSpacing: '0.1em' }}>
              {addingPin ? '✕ Cancelar pin' : '+ Adicionar pin'}
            </button>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--ink-mute)', marginTop: 4 }}>
              Layers ({layers.length})
            </div>

            {layers.map(layer => (
              <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', background: 'var(--paper-deep)',
                border: '1px solid var(--line-soft)', borderRadius: 8 }}>
                <button onClick={() => handleToggleLayer(layer)}
                  style={{ width: 28, height: 28, borderRadius: 6, border: 'none',
                    background: layer.visible ? 'var(--teal)' : 'var(--line)',
                    color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 12,
                    cursor: 'pointer', flexShrink: 0 }}>
                  {layer.visible ? '●' : '○'}
                </button>
                <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 13,
                  color: layer.visible ? 'var(--ink)' : 'var(--ink-mute)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {layer.name}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
                  {pins.filter(p => p.layer_id === layer.id).length}
                </span>
                <button onClick={() => handleDeleteLayer(layer.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--coral)', fontSize: 12, padding: '2px 4px' }}>
                  ✕
                </button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newLayerName} onChange={e => setNewLayerName(e.target.value)}
                placeholder="Nova layer..."
                onKeyDown={e => e.key === 'Enter' && handleAddLayer()}
                style={{ ...fieldStyle, flex: 1 }} />
              <button onClick={handleAddLayer} disabled={savingLayer || !newLayerName.trim()}
                style={{ padding: '7px 12px', borderRadius: 8, border: 'none',
                  background: 'var(--coral)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                  opacity: savingLayer || !newLayerName.trim() ? 0.5 : 1 }}>
                +
              </button>
            </div>
          </div>
        )}

        {/* ── Editar Pin ── */}
        {activeTab === 'pin' && editingPin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={pinLabel} onChange={e => setPinLabel(e.target.value)}
              placeholder="Título do pin"
              style={fieldStyle} />

            <textarea value={pinDesc} onChange={e => setPinDesc(e.target.value)}
              placeholder="Descrição (opcional)"
              rows={3}
              style={{ ...fieldStyle, resize: 'vertical' }} />

            {/* Ícone */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 6 }}>
                Ícone
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(Object.entries(PIN_ICON_LABELS) as [MapPinIcon, string][]).map(([icon, label]) => (
                  <button key={icon} onClick={() => setPinIcon(icon)}
                    style={{ padding: '3px 8px', borderRadius: 6,
                      border: `1.5px solid ${pinIcon === icon ? PIN_ICON_COLORS[icon] : 'var(--line)'}`,
                      background: pinIcon === icon ? PIN_ICON_COLORS[icon] : 'transparent',
                      color: pinIcon === icon ? '#fff' : 'var(--ink-mute)',
                      fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Visibilidade */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 6 }}>
                Visibilidade
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['hidden', 'name', 'full'] as MapVisibility[]).map(v => (
                  <button key={v} onClick={() => setPinVis(v)}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 999,
                      border: `1.5px solid ${pinVis === v ? VISIBILITY_COLORS[v] : 'var(--line)'}`,
                      background: pinVis === v ? VISIBILITY_COLORS[v] : 'transparent',
                      color: pinVis === v ? 'var(--paper)' : 'var(--ink-mute)',
                      fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}>
                    {VISIBILITY_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>

            {/* Layer */}
            <select value={pinLayerId} onChange={e => setPinLayerId(e.target.value)} style={fieldStyle}>
              {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>

            {/* Link Wiki */}
            <select value={pinWikiId ?? ''} onChange={e => { setPinWikiId(e.target.value || null); setPinMapId(null) }} style={fieldStyle}>
              <option value="">Sem link Wiki</option>
              {wikiPages.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
            </select>

            {/* Link Mapa */}
            {!pinWikiId && (
              <select value={pinMapId ?? ''} onChange={e => setPinMapId(e.target.value || null)} style={fieldStyle}>
                <option value="">Sem sub-mapa</option>
                {allMaps.filter(m => m.id !== map.id).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDeletePin}
                style={{ padding: '7px 12px', borderRadius: 8,
                  border: '1px solid var(--coral)', background: 'transparent',
                  color: 'var(--coral)', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer' }}>
                ✕ Remover
              </button>
              <button onClick={() => onEditPin(null)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 8,
                  border: '1px solid var(--line)', background: 'transparent',
                  fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer', color: 'var(--ink-mute)' }}>
                Cancelar
              </button>
              <button onClick={handleSavePin} disabled={savingPin || !pinLabel.trim()}
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                  background: 'var(--coral)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                  opacity: savingPin || !pinLabel.trim() ? 0.6 : 1 }}>
                {savingPin ? '...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* ── Config do Mapa ── */}
        {activeTab === 'mapa' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
              Visibilidade do mapa
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['hidden', 'name', 'full'] as MapVisibility[]).map(v => (
                <button key={v} onClick={() => handleMapVis(v)}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 999,
                    border: `1.5px solid ${map.visibility === v ? VISIBILITY_COLORS[v] : 'var(--line)'}`,
                    background: map.visibility === v ? VISIBILITY_COLORS[v] : 'transparent',
                    color: map.visibility === v ? 'var(--paper)' : 'var(--ink-mute)',
                    fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
                    letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {VISIBILITY_LABELS[v]}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
              {map.bg_width} × {map.bg_height} px · {pins.length} pin{pins.length !== 1 ? 's' : ''} · {layers.length} layer{layers.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
