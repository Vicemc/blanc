export type MapVisibility = 'hidden' | 'name' | 'full'

export type MapPinIcon = 'default' | 'secret' | 'danger' | 'npc' | 'item' | 'dungeon' | 'event'

export interface GameMap {
  id:          string
  campaign_id: string
  title:       string
  description: string
  bg_url:      string | null
  bg_width:    number
  bg_height:   number
  visibility:  MapVisibility
  created_at:  string
  updated_at:  string
}

export interface MapLayer {
  id:          string
  map_id:      string
  campaign_id: string
  name:        string
  visible:     boolean
  order_index: number
}

export interface MapPin {
  id:             string
  map_id:         string
  layer_id:       string
  campaign_id:    string
  label:          string
  description:    string
  x:              number   // 0..1 fração da largura
  y:              number   // 0..1 fração da altura
  icon:           MapPinIcon
  visibility:     MapVisibility
  linked_wiki_id: string | null
  linked_map_id:  string | null
  created_at:     string
  updated_at:     string
}

export const PIN_ICON_LABELS: Record<MapPinIcon, string> = {
  default: 'Padrão',
  secret:  'Segredo',
  danger:  'Perigo',
  npc:     'NPC',
  item:    'Item',
  dungeon: 'Dungeon',
  event:   'Evento',
}

export const PIN_ICON_COLORS: Record<MapPinIcon, string> = {
  default: '#6e8bb5',
  secret:  '#8a6ea0',
  danger:  '#c43321',
  npc:     '#e25845',
  item:    '#d9b974',
  dungeon: '#3b3a5e',
  event:   '#e87a2c',
}
