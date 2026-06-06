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
