import { supabase, isSupabaseReady } from '../supabase'
import type { GameMap, MapLayer, MapPin, MapVisibility, MapPinIcon } from '../../types/map'

const CAMPAIGN = 'midnight-summer'

// ── Mapas ─────────────────────────────────────────────────────────────────────

export async function listMaps(): Promise<GameMap[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase
    .from('maps')
    .select('*')
    .eq('campaign_id', CAMPAIGN)
    .order('title')
  return (data ?? []) as GameMap[]
}

export async function saveMap(map: Partial<GameMap> & { title: string }): Promise<GameMap | null> {
  if (!isSupabaseReady || !supabase) return null

  const payload: Record<string, unknown> = {
    title:       map.title,
    description: map.description ?? '',
    bg_url:      map.bg_url ?? null,
    bg_width:    map.bg_width ?? 1000,
    bg_height:   map.bg_height ?? 800,
    visibility:  map.visibility ?? 'hidden',
    updated_at:  new Date().toISOString(),
  }

  if (map.id) {
    const { data } = await supabase.from('maps').update(payload).eq('id', map.id).select('*').single()
    return (data ?? null) as GameMap | null
  }
  const { data } = await supabase.from('maps').insert({ campaign_id: CAMPAIGN, ...payload }).select('*').single()
  return (data ?? null) as GameMap | null
}

export async function deleteMap(id: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('maps').delete().eq('id', id)
}

export async function setMapVisibility(id: string, visibility: MapVisibility): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('maps').update({ visibility, updated_at: new Date().toISOString() }).eq('id', id)
}

// ── Layers ────────────────────────────────────────────────────────────────────

export async function listLayers(mapId: string): Promise<MapLayer[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase
    .from('map_layers')
    .select('*')
    .eq('map_id', mapId)
    .order('order_index')
  return (data ?? []) as MapLayer[]
}

export async function saveLayer(layer: Partial<MapLayer> & { map_id: string; name: string }): Promise<MapLayer | null> {
  if (!isSupabaseReady || !supabase) return null

  const payload = {
    name:        layer.name,
    visible:     layer.visible ?? true,
    order_index: layer.order_index ?? 0,
  }

  if (layer.id) {
    const { data } = await supabase.from('map_layers').update(payload).eq('id', layer.id).select('*').single()
    return (data ?? null) as MapLayer | null
  }
  const { data } = await supabase.from('map_layers').insert({ campaign_id: CAMPAIGN, map_id: layer.map_id, ...payload }).select('*').single()
  return (data ?? null) as MapLayer | null
}

export async function deleteLayer(id: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('map_layers').delete().eq('id', id)
}

export async function toggleLayerVisibility(id: string, visible: boolean): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('map_layers').update({ visible }).eq('id', id)
}

// ── Pins ──────────────────────────────────────────────────────────────────────

export async function listPins(mapId: string): Promise<MapPin[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase
    .from('map_pins')
    .select('*')
    .eq('map_id', mapId)
  return (data ?? []) as MapPin[]
}

export async function savePin(pin: Partial<MapPin> & { map_id: string; layer_id: string; label: string; x: number; y: number }): Promise<MapPin | null> {
  if (!isSupabaseReady || !supabase) return null

  const payload: Record<string, unknown> = {
    label:          pin.label,
    description:    pin.description ?? '',
    x:              pin.x,
    y:              pin.y,
    icon:           pin.icon ?? 'default',
    visibility:     pin.visibility ?? 'hidden',
    linked_wiki_id: pin.linked_wiki_id ?? null,
    linked_map_id:  pin.linked_map_id ?? null,
    layer_id:       pin.layer_id,
    updated_at:     new Date().toISOString(),
  }

  if (pin.id) {
    const { data } = await supabase.from('map_pins').update(payload).eq('id', pin.id).select('*').single()
    return (data ?? null) as MapPin | null
  }
  const { data } = await supabase.from('map_pins').insert({ campaign_id: CAMPAIGN, map_id: pin.map_id, ...payload }).select('*').single()
  return (data ?? null) as MapPin | null
}

export async function deletePin(id: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('map_pins').delete().eq('id', id)
}

export async function movePinPosition(id: string, x: number, y: number): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('map_pins').update({ x, y, updated_at: new Date().toISOString() }).eq('id', id)
}

// ── Export / Import de mapas (backup pontual / reaproveitar entre campanhas) ───

const MAP_EXPORT_VERSION = 1

interface MapExportPackage {
  kind:    'game-map'
  version: number
  map:     GameMap
  layers:  MapLayer[]
  pins:    MapPin[]
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Exporta um mapa completo (com suas camadas e pins) para um JSON.
export async function exportMap(mapId: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  const { data: map } = await supabase.from('maps').select('*').eq('id', mapId).single()
  if (!map) return
  const [layers, pins] = await Promise.all([listLayers(mapId), listPins(mapId)])
  const pkg: MapExportPackage = {
    kind: 'game-map', version: MAP_EXPORT_VERSION,
    map: map as GameMap, layers, pins,
  }
  const slug = ((map as GameMap).title || 'mapa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mapa'
  downloadJson(`mapa-${slug}-${new Date().toISOString().slice(0, 10)}.json`, pkg)
}

// Abre o seletor de arquivos e devolve o pacote do mapa (sem inserir).
export function pickMapImport(): Promise<MapExportPackage | null> {
  return new Promise(resolve => {
    const input  = document.createElement('input')
    input.type   = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const parsed = JSON.parse(e.target?.result as string)
          if (parsed?.kind === 'game-map' && parsed.map) resolve(parsed as MapExportPackage)
          else resolve(null)
        } catch { resolve(null) }
      }
      reader.readAsText(file)
    }
    input.click()
  })
}

// Importa um mapa como NOVO mapa, recriando camadas e pins com IDs novos.
// Remapeia layer_id dos pins; descarta vínculos de wiki/mapa (variam por campanha).
export async function importMap(pkg: MapExportPackage): Promise<GameMap | null> {
  if (!isSupabaseReady || !supabase) return null
  const newMap = await saveMap({
    title:       `${pkg.map.title} (importado)`,
    description: pkg.map.description ?? '',
    bg_url:      pkg.map.bg_url ?? null,
    bg_width:    pkg.map.bg_width ?? 1000,
    bg_height:   pkg.map.bg_height ?? 800,
    visibility:  'hidden',
  })
  if (!newMap) return null

  // Recria camadas, mapeando id antigo → id novo
  const layerIdMap = new Map<string, string>()
  for (const layer of pkg.layers) {
    const saved = await saveLayer({
      map_id:      newMap.id,
      name:        layer.name,
      visible:     layer.visible,
      order_index: layer.order_index,
    })
    if (saved) layerIdMap.set(layer.id, saved.id)
  }

  // Recria pins na camada correspondente (ou na primeira como fallback)
  const fallbackLayer = layerIdMap.values().next().value as string | undefined
  for (const pin of pkg.pins) {
    const layerId = layerIdMap.get(pin.layer_id) ?? fallbackLayer
    if (!layerId) continue
    await savePin({
      map_id:      newMap.id,
      layer_id:    layerId,
      label:       pin.label,
      description: pin.description ?? '',
      x:           pin.x,
      y:           pin.y,
      icon:        pin.icon ?? 'default',
      visibility:  pin.visibility ?? 'hidden',
    })
  }
  return newMap
}
