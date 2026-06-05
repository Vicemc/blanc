export type WikiCategory =
  | 'humanos'
  | 'agentes'
  | 'digimons'
  | 'locais'
  | 'faccoes'
  | 'eventos'
  | 'documentos'
  | 'itens'
  | 'bugs'
  | 'signs'
  | 'entidades'

export type WikiVisibility = 'hidden' | 'name' | 'full'

export type WikiLinkedType = 'tamer' | 'digimon' | 'survivor' | 'bug' | 'sign' | 'item'

export interface WikiPage {
  id: string
  campaign_id: string
  title: string
  category: WikiCategory
  body: string
  avatar_url: string | null
  visibility: WikiVisibility
  linked_type: WikiLinkedType | null
  linked_id: string | null
  created_at: string
  updated_at: string
}

export interface WikiRelation {
  id: string
  campaign_id: string
  from_id: string
  to_id: string
  label: string
}

export const WIKI_CATEGORIES: { value: WikiCategory; label: string }[] = [
  { value: 'humanos',    label: 'Humanos' },
  { value: 'agentes',    label: 'Agentes' },
  { value: 'digimons',  label: 'Digimons' },
  { value: 'locais',    label: 'Locais' },
  { value: 'faccoes',   label: 'Facções' },
  { value: 'eventos',   label: 'Eventos' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'itens',     label: 'Itens' },
  { value: 'bugs',      label: 'BUGs' },
  { value: 'signs',     label: 'SIGNs' },
  { value: 'entidades', label: 'Entidades' },
]
