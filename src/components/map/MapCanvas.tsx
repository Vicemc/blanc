import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GameMap, MapLayer, MapPin, MapPinIcon } from '../../types/map'
import type { WikiPage } from '../../types/wiki'
import { PIN_ICON_COLORS } from '../../types/map'
import { savePin, movePinPosition } from '../../lib/db/maps'
import PinPopup from './PinPopup'
import { createRoot } from 'react-dom/client'

// Leaflet usa imagens de ícone via webpack/url que ficam quebradas em Vite.
// Resolver manualmente o ícone padrão.
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function makePinIcon(icon: MapPinIcon, visibility: string, isGM: boolean): L.DivIcon {
  const color = PIN_ICON_COLORS[icon]
  const opacity = isGM && visibility === 'hidden' ? 0.45 : 1

  const PIN_SHAPES: Record<MapPinIcon, string> = {
    default: '⬤',
    secret:  '✦',
    danger:  '▲',
    npc:     '◆',
    item:    '★',
    dungeon: '⬛',
    event:   '⬟',
  }

  const html = `
    <div style="
      display:flex; align-items:center; justify-content:center;
      width:30px; height:30px; border-radius:50%;
      background:${color}; opacity:${opacity};
      border: 2.5px solid rgba(255,255,255,0.85);
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
      font-size:13px; color:#fff; cursor:pointer;
      user-select:none;
    ">${PIN_SHAPES[icon]}</div>
  `

  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -18] })
}

interface Props {
  map:        GameMap
  layers:     MapLayer[]
  pins:       MapPin[]
  wikiPages:  WikiPage[]
  allMaps:    GameMap[]
  isGM:       boolean
  addingPin:  boolean
  editingPin: MapPin | null
  onPinsChange: (pins: MapPin[]) => void
  onEditPin:    (pin: MapPin | null) => void
  onOpenMap:    (mapId: string) => void
}

export default function MapCanvas({
  map, layers, pins, wikiPages, allMaps,
  isGM, addingPin,
  editingPin, onPinsChange, onEditPin, onOpenMap,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const markersRef   = useRef<Map<string, L.Marker>>(new Map())
  const addingRef    = useRef(addingPin)

  // Manter ref sincronizada com prop para usar no click handler sem re-registrar
  useEffect(() => { addingRef.current = addingPin }, [addingPin])

  // Inicializar Leaflet uma única vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const { bg_width: w, bg_height: h } = map
    const bounds: L.LatLngBoundsExpression = [[0, 0], [h, w]]

    const lmap = L.map(containerRef.current, {
      crs:          L.CRS.Simple,
      minZoom:      -3,
      maxZoom:      4,
      zoomSnap:     0.25,
      attributionControl: false,
    })

    L.imageOverlay(map.bg_url ?? '', bounds).addTo(lmap)
    lmap.fitBounds(bounds)
    lmap.setMaxBounds(bounds.map(([y, x]) => [y * 1.1, x * 1.1]) as L.LatLngBoundsExpression)

    lmap.on('click', async (e: L.LeafletMouseEvent) => {
      if (!addingRef.current) return
      const x = e.latlng.lng / w
      const y = 1 - e.latlng.lat / h   // inverter eixo Y (Leaflet: y=0 no topo)

      const defaultLayerId = layers[0]?.id
      if (!defaultLayerId) return

      const result = await savePin({
        map_id:   map.id,
        layer_id: defaultLayerId,
        label:    'Novo pin',
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      })
      if (result) {
        onPinsChange([...pins, result])
        onEditPin(result)
      }
    })

    mapRef.current = lmap

    return () => {
      lmap.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id])

  // Sincronizar markers quando pins/layers/isGM mudarem
  useEffect(() => {
    const lmap = mapRef.current
    if (!lmap) return

    const { bg_width: w, bg_height: h } = map
    const existingIds = new Set(markersRef.current.keys())

    pins.forEach(pin => {
      const layer = layers.find(l => l.id === pin.layer_id)
      const shouldShow = isGM ? true : (layer?.visible && pin.visibility !== 'hidden')
      const latlng: L.LatLngExpression = [
        (1 - pin.y) * h,   // inverter eixo Y
        pin.x * w,
      ]

      if (!shouldShow) {
        const marker = markersRef.current.get(pin.id)
        if (marker) { marker.remove(); markersRef.current.delete(pin.id) }
        existingIds.delete(pin.id)
        return
      }

      const wikiPage = pin.linked_wiki_id ? wikiPages.find(w => w.id === pin.linked_wiki_id) : null

      const marker = markersRef.current.get(pin.id) ?? L.marker(latlng, {
        icon:      makePinIcon(pin.icon, pin.visibility, isGM),
        draggable: isGM,
        title:     pin.label,
      }).addTo(lmap)

      marker.setLatLng(latlng)
      marker.setIcon(makePinIcon(pin.icon, pin.visibility, isGM))
      marker.options.draggable = isGM

      // Popup
      const popupEl = document.createElement('div')
      const root = createRoot(popupEl)
      root.render(
        <PinPopup
          pin={pin}
          wikiPage={wikiPage}
          isGM={isGM}
          onOpenMap={onOpenMap}
          onEdit={() => { onEditPin(pin); marker.closePopup() }}
          onDelete={async () => {
            const { deletePin } = await import('../../lib/db/maps')
            await deletePin(pin.id)
            onPinsChange(pins.filter(p => p.id !== pin.id))
            marker.remove()
            markersRef.current.delete(pin.id)
          }}
        />
      )
      marker.bindPopup(popupEl, { minWidth: 180, maxWidth: 280, closeButton: true })

      if (isGM) {
        marker.off('dragend')
        marker.on('dragend', async () => {
          const pos = marker.getLatLng()
          const nx = pos.lng / w
          const ny = 1 - pos.lat / h
          await movePinPosition(pin.id, Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny)))
          onPinsChange(pins.map(p => p.id === pin.id ? { ...p, x: nx, y: ny } : p))
        })
      }

      markersRef.current.set(pin.id, marker)
      existingIds.delete(pin.id)
    })

    // Remover markers de pins deletados
    existingIds.forEach(id => {
      markersRef.current.get(id)?.remove()
      markersRef.current.delete(id)
    })
  }, [pins, layers, isGM, wikiPages, map, onOpenMap, onEditPin, onPinsChange])

  // Cursor ao adicionar pin
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.cursor = addingPin ? 'crosshair' : ''
  }, [addingPin])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: 460, borderRadius: 'var(--radius)', overflow: 'hidden' }}
    />
  )
}
