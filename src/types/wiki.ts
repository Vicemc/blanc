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

export type WikiPageStatus = 'approved' | 'pending'

// ── Conteúdo estruturado da página detalhada ─────────────────────────────────
export interface WikiInfoField {
  id: string
  label: string
  value: string
}

export interface WikiGalleryImage {
  url: string
  caption?: string
}

export interface WikiSectionBlock {
  id: string
  heading: string
  body: string
}

// ── Layout em blocos (grade de colunas) ──────────────────────────────────────
export type WikiBlockWidth = 'full' | 'half'

export type WikiBlock =
  | { id: string; type: 'infobox'; width: WikiBlockWidth; title?: string; fields: WikiInfoField[] }
  | { id: string; type: 'text';    width: WikiBlockWidth; title?: string; body: string }
  | { id: string; type: 'image';   width: WikiBlockWidth; url: string | null; caption?: string }
  | { id: string; type: 'gallery'; width: WikiBlockWidth; title?: string; images: WikiGalleryImage[] }
  | { id: string; type: 'divider'; width: WikiBlockWidth }

export type WikiBlockType = WikiBlock['type']

// Card de música (YouTube) fixo abaixo do avatar.
export interface WikiMusic {
  youtubeId: string
  title: string
  artist?: string
}

export interface WikiContent {
  music?:  WikiMusic | null            // card de música fixo no cabeçalho
  blocks?: WikiBlock[]                 // layout em blocos (novo)
  // Campos legados — mantidos para retrocompat / migração automática:
  infobox?:  WikiInfoField[]
  gallery?:  WikiGalleryImage[]
  sections?: WikiSectionBlock[]
}

export const WIKI_GALLERY_MAX = 6

export const EMPTY_WIKI_CONTENT: WikiContent = { infobox: [], gallery: [], sections: [] }

export interface WikiPage {
  id: string
  campaign_id: string
  title: string
  category: WikiCategory
  subcategory: string | null   // espaço manual dentro da categoria (ex.: 'senpais')
  sort_order: number           // ordem dentro do espaço (menor = primeiro)
  body: string
  avatar_url: string | null
  visibility: WikiVisibility
  linked_type: WikiLinkedType | null
  linked_id: string | null
  status: WikiPageStatus
  author_id: string | null
  owner_tamer_id: string | null
  content: WikiContent | null
  created_at: string
  updated_at: string
}

export interface WikiPageEdit {
  id: string
  page_id: string
  campaign_id: string
  author_id: string | null
  title: string
  body: string
  category: WikiCategory
  subcategory?: string | null
  content: WikiContent | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface WikiRelation {
  id: string
  campaign_id: string
  from_id: string
  to_id: string
  label: string
}

// Categorias ocultadas dos players quando o "modo spoiler" está ativo.
export const SPOILER_CATEGORIES: WikiCategory[] = ['eventos', 'documentos', 'entidades']

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

// ── Subcategorias (espaços dentro de uma categoria) ───────────────────────────

export interface WikiSubcat { key: string; label: string }

// categoria → lista de subcategorias gerenciadas pelo GM (campaign_config).
export type WikiSubcatMap = Record<string, WikiSubcat[]>

// Espaços de Humanos derivados do vínculo de entidade (não atribuíveis à mão).
export const HUMANOS_AUTO_SPACES: WikiSubcat[] = [
  { key: 'tamers',    label: 'Tamers'    },
  { key: 'survivors', label: 'Survivors' },
]

// Subcategorias manuais padrão de Humanos (atribuíveis pelo editor).
// 'survivors' entra aqui como rede de segurança para survivors sem entidade.
export const HUMANOS_MANUAL_SUBCATS: WikiSubcat[] = [
  { key: 'survivors', label: 'Survivors' },
  { key: 'senpais',   label: 'Senpais'   },
  { key: 'zaika',     label: 'Zaika'     },
  { key: 'outros',    label: 'Outros'    },
]

// Ordem de exibição dos espaços de Humanos na página pública.
export const HUMANOS_SPACE_ORDER = ['tamers', 'survivors', 'senpais', 'zaika', 'outros']

// Rótulos conhecidos de espaços de Humanos (auto + manuais), p/ cabeçalhos.
export const HUMANOS_SPACE_LABELS: Record<string, string> = {
  tamers:    'Tamers',
  survivors: 'Survivors',
  senpais:   'Senpais',
  zaika:     'Zaika',
  outros:    'Outros',
}
