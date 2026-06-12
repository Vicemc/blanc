import { supabase, isSupabaseReady } from '../supabase'
import type { WikiPage, WikiPageEdit, WikiRelation, WikiCategory, WikiVisibility, WikiLinkedType, WikiContent, WikiSubcatMap } from '../../types/wiki'
import type { AppState } from '../../types'
import { getCampaignConfig, setCampaignConfig } from './config'

const CAMPAIGN = 'midnight-summer'

// ── Subcategorias / espaços ───────────────────────────────────────────────────

// Resolve o espaço de exibição de uma página de Humanos.
// Prioridade: vínculo de entidade (automático) → subcategoria manual → 'outros'.
export function resolveHumanSpace(page: Pick<WikiPage, 'linked_type' | 'subcategory'>): string {
  if (page.linked_type === 'tamer')    return 'tamers'
  if (page.linked_type === 'survivor') return 'survivors'
  return page.subcategory || 'outros'
}

export const WIKI_SUBCATS_KEY = 'wiki_subcategories'

// Subcategorias gerenciadas pelo GM (por categoria), persistidas em campaign_config.
export async function getWikiSubcats(): Promise<WikiSubcatMap> {
  const raw = await getCampaignConfig<WikiSubcatMap>(WIKI_SUBCATS_KEY)
  return raw ?? {}
}

export async function setWikiSubcats(map: WikiSubcatMap): Promise<void> {
  await setCampaignConfig(WIKI_SUBCATS_KEY, map)
}

// ── Páginas da Wiki ───────────────────────────────────────────────────────────

export async function listWikiPages(): Promise<WikiPage[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase
    .from('wiki_pages')
    .select('*')
    .eq('campaign_id', CAMPAIGN)
    .order('category')
    .order('title')
  return (data ?? []) as WikiPage[]
}

export async function saveWikiPage(page: Partial<WikiPage> & { title: string; category: WikiCategory }): Promise<WikiPage | null> {
  if (!isSupabaseReady || !supabase) return null

  const payload: Record<string, unknown> = {
    title:       page.title,
    category:    page.category,
    subcategory: page.subcategory ?? null,
    sort_order:  page.sort_order ?? 0,
    body:        page.body ?? '',
    avatar_url:  page.avatar_url ?? null,
    visibility:  page.visibility ?? 'hidden',
    linked_type:    page.linked_type ?? null,
    linked_id:      page.linked_id ?? null,
    status:         page.status ?? 'approved',
    owner_tamer_id: page.owner_tamer_id ?? null,
    content:        page.content ?? {},
    updated_at:     new Date().toISOString(),
  }

  if (page.id) {
    const { data } = await supabase
      .from('wiki_pages')
      .update(payload)
      .eq('id', page.id)
      .select('*')
      .single()
    return (data ?? null) as WikiPage | null
  }

  const { data } = await supabase
    .from('wiki_pages')
    .insert({ campaign_id: CAMPAIGN, ...payload })
    .select('*')
    .single()
  return (data ?? null) as WikiPage | null
}

// Player cria nova página — fica como 'pending' até o GM aprovar
export async function submitWikiPage(
  authorId: string,
  page: { title: string; category: WikiCategory; subcategory?: string | null; body: string; content?: WikiContent }
): Promise<WikiPage | null> {
  if (!isSupabaseReady || !supabase) return null
  const { data } = await supabase
    .from('wiki_pages')
    .insert({
      campaign_id: CAMPAIGN,
      title:       page.title,
      category:    page.category,
      subcategory: page.subcategory ?? null,
      body:        page.body,
      content:     page.content ?? {},
      avatar_url:  null,
      visibility:  'hidden',
      linked_type: null,
      linked_id:   null,
      status:      'pending',
      author_id:   authorId,
    })
    .select('*')
    .single()
  return (data ?? null) as WikiPage | null
}

// Player submete edição de página existente
export async function submitWikiPageEdit(
  authorId: string,
  edit: { page_id: string; title: string; body: string; category: WikiCategory; subcategory?: string | null; content?: WikiContent }
): Promise<WikiPageEdit | null> {
  if (!isSupabaseReady || !supabase) return null
  const { data } = await supabase
    .from('wiki_page_edits')
    .insert({
      campaign_id: CAMPAIGN,
      page_id:     edit.page_id,
      author_id:   authorId,
      title:       edit.title,
      body:        edit.body,
      category:    edit.category,
      subcategory: edit.subcategory ?? null,
      content:     edit.content ?? {},
      status:      'pending',
    })
    .select('*')
    .single()
  return (data ?? null) as WikiPageEdit | null
}

// Dono da página edita a própria página — aplica direto, sem aprovação.
// Atualiza APENAS a linha em wiki_pages; não toca em app_state / fichas / palco.
export async function saveOwnWikiPageEdit(
  pageId: string,
  edit: { title: string; body: string; category: WikiCategory; subcategory?: string | null; content?: WikiContent }
): Promise<WikiPage | null> {
  if (!isSupabaseReady || !supabase) return null
  const { data } = await supabase
    .from('wiki_pages')
    .update({
      title:      edit.title,
      body:       edit.body,
      category:   edit.category,
      subcategory: edit.subcategory ?? null,
      content:    edit.content ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', pageId)
    .select('*')
    .single()
  return (data ?? null) as WikiPage | null
}

// GM lista edições pendentes
export async function listPendingEdits(): Promise<WikiPageEdit[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase
    .from('wiki_page_edits')
    .select('*')
    .eq('campaign_id', CAMPAIGN)
    .eq('status', 'pending')
    .order('created_at')
  return (data ?? []) as WikiPageEdit[]
}

// GM aprova edição — aplica na página principal
export async function approveWikiEdit(edit: WikiPageEdit): Promise<WikiPage | null> {
  if (!isSupabaseReady || !supabase) return null
  const [{ data: page }] = await Promise.all([
    supabase
      .from('wiki_pages')
      .update({
        title: edit.title, body: edit.body, category: edit.category,
        ...(edit.subcategory !== undefined ? { subcategory: edit.subcategory } : {}),
        content: edit.content ?? {}, updated_at: new Date().toISOString(),
      })
      .eq('id', edit.page_id)
      .select('*')
      .single(),
    supabase
      .from('wiki_page_edits')
      .update({ status: 'approved' })
      .eq('id', edit.id),
  ])
  return (page ?? null) as WikiPage | null
}

// GM rejeita edição
export async function rejectWikiEdit(editId: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('wiki_page_edits').update({ status: 'rejected' }).eq('id', editId)
}

// GM aprova nova página pendente
export async function approveWikiPage(pageId: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase
    .from('wiki_pages')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', pageId)
}

// GM rejeita/remove nova página pendente
export async function rejectWikiPage(pageId: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('wiki_pages').delete().eq('id', pageId)
}

// Lista edições pendentes de uma página específica (para o player ver o status)
export async function listMyPendingEdits(authorId: string): Promise<WikiPageEdit[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase
    .from('wiki_page_edits')
    .select('*')
    .eq('campaign_id', CAMPAIGN)
    .eq('author_id', authorId)
    .eq('status', 'pending')
  return (data ?? []) as WikiPageEdit[]
}

export async function deleteWikiPage(id: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('wiki_pages').delete().eq('id', id)
}

export async function setWikiPageVisibility(id: string, visibility: WikiVisibility): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('wiki_pages').update({ visibility, updated_at: new Date().toISOString() }).eq('id', id)
}

// ── Relações do Grafo ─────────────────────────────────────────────────────────

export async function listWikiRelations(): Promise<WikiRelation[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase
    .from('wiki_relations')
    .select('*')
    .eq('campaign_id', CAMPAIGN)
  return (data ?? []) as WikiRelation[]
}

export async function saveWikiRelation(relation: Omit<WikiRelation, 'id' | 'campaign_id'>): Promise<WikiRelation | null> {
  if (!isSupabaseReady || !supabase) return null
  const { data } = await supabase
    .from('wiki_relations')
    .insert({ campaign_id: CAMPAIGN, ...relation })
    .select('*')
    .single()
  return (data ?? null) as WikiRelation | null
}

export async function deleteWikiRelation(id: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('wiki_relations').delete().eq('id', id)
}

// ── Export / Import de páginas (backup pontual / reaproveitar lore) ────────────

const WIKI_EXPORT_VERSION = 1

interface WikiExportPackage {
  kind:    'wiki-pages'
  version: number
  pages:   WikiPage[]
}

// Dispara o download de um JSON no browser (mesmo padrão de exportStateToFile).
function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Exporta uma ou mais páginas da Wiki para um arquivo JSON.
export function exportWikiPages(pages: WikiPage[], filenameHint?: string): void {
  const pkg: WikiExportPackage = { kind: 'wiki-pages', version: WIKI_EXPORT_VERSION, pages }
  const slug = (filenameHint ?? (pages.length === 1 ? pages[0].title : `${pages.length}-paginas`))
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wiki'
  downloadJson(`wiki-${slug}-${new Date().toISOString().slice(0, 10)}.json`, pkg)
}

// Abre o seletor de arquivos e devolve as páginas do pacote (sem inserir).
export function pickWikiImport(): Promise<WikiPage[] | null> {
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
          const pages: WikiPage[] = parsed?.kind === 'wiki-pages' && Array.isArray(parsed.pages)
            ? parsed.pages
            : Array.isArray(parsed) ? parsed : [parsed]
          resolve(pages)
        } catch { resolve(null) }
      }
      reader.readAsText(file)
    }
    input.click()
  })
}

// Insere páginas importadas como NOVAS páginas (ignora id/campaign/timestamps
// da origem para não colidir nem vazar entre campanhas). Devolve quantas criou.
export async function importWikiPages(pages: WikiPage[]): Promise<number> {
  if (!isSupabaseReady || !supabase) return 0
  let created = 0
  for (const p of pages) {
    const saved = await saveWikiPage({
      title:          p.title,
      category:       p.category,
      body:           p.body ?? '',
      avatar_url:     p.avatar_url ?? null,
      visibility:     p.visibility ?? 'hidden',
      // Não reaproveita vínculos de entidade — entidades diferem entre campanhas.
      linked_type:    null,
      linked_id:      null,
      status:         'approved',
      owner_tamer_id: null,
      content:        p.content ?? {},
    })
    if (saved) created++
  }
  return created
}

// ── Seed de páginas de personagens ────────────────────────────────────────────

const PC_TAMER_IDS = new Set(['t-naoki', 't-mori', 't-miki', 't-yuri', 't-eisuke', 't-sachi'])

// Ordem fixa de exibição dentro dos espaços de Humanos (sort_order semeado).
const TAMER_ORDER: string[] = [
  't-naoki', 't-eisuke', 't-miki', 't-yuri', 't-sachi', 't-mori',
  't-hare', 't-kanade', 't-shinra', 't-kumo', 't-emi', 't-hibito',
]
// Survivors: a maioria são páginas soltas (sem entidade), então ordena por
// primeiro nome do título. Ausentes caem no fim (999), depois alfabético.
const SURVIVOR_NAME_ORDER: string[] = [
  'yahiro', 'mei', 'hino', 'yui', 'makoto', 'kimimaro', 'ellen',
]
const orderFromList = (list: string[], key: string): number => {
  const i = list.indexOf(key)
  return i < 0 ? 999 : i
}

export async function seedWikiPages(state: AppState): Promise<{ created: number; skipped: number }> {
  if (!isSupabaseReady || !supabase) return { created: 0, skipped: 0 }

  const { data: existing } = await supabase
    .from('wiki_pages')
    .select('id, linked_type, linked_id, avatar_url')
    .eq('campaign_id', CAMPAIGN)

  type ExistingRow = { id: string; linked_type: string; linked_id: string; avatar_url: string | null }
  const existingRows: ExistingRow[] = (existing ?? []) as ExistingRow[]
  const existingMap = new Map(existingRows.map(r => [`${r.linked_type}:${r.linked_id}`, r]))

  // Build lookup: linkedKey → avatar URL from current state
  const avatarByKey = new Map<string, string | null>()
  for (const tamer of state.tamers) {
    const url = tamer.image && !tamer.image.startsWith('data:') ? tamer.image : null
    avatarByKey.set(`tamer:${tamer.id}`, url)
  }
  for (const sv of (state.survivors ?? [])) {
    const url = sv.image && !sv.image.startsWith('data:') ? sv.image : null
    avatarByKey.set(`survivor:${sv.id}`, url)
  }

  const toInsert: Record<string, unknown>[] = []
  const avatarUpdates: PromiseLike<unknown>[] = []

  for (const tamer of state.tamers) {
    const key = `tamer:${tamer.id}`
    const row = existingMap.get(key)
    const avatarUrl = avatarByKey.get(key) ?? null
    if (!row) {
      toInsert.push({
        campaign_id:    CAMPAIGN,
        title:          `${tamer.name} ${tamer.surname}`.trim(),
        category:       'humanos',
        sort_order:     orderFromList(TAMER_ORDER, tamer.id),
        body:           '',
        avatar_url:     avatarUrl,
        visibility:     'full',
        linked_type:    'tamer',
        linked_id:      tamer.id,
        status:         'approved',
        author_id:      null,
        owner_tamer_id: PC_TAMER_IDS.has(tamer.id) ? tamer.id : null,
      })
    } else if (avatarUrl && !row.avatar_url) {
      avatarUpdates.push(
        supabase.from('wiki_pages').update({ avatar_url: avatarUrl }).eq('id', row.id)
      )
    }
  }

  for (const line of state.bestiary) {
    if (!line.tamerId) continue
    const key = `digimon:${line.id}`
    const stage = line.stages[line.currentStage]
    const stageName = stage?.stageName ?? line.name
    const rawImage = stage?.image ?? line.image ?? null
    const avatarUrl = rawImage && !rawImage.startsWith('data:') ? rawImage : null
    const row = existingMap.get(key)
    if (!row) {
      toInsert.push({
        campaign_id:    CAMPAIGN,
        title:          stageName,
        category:       'digimons',
        body:           '',
        avatar_url:     avatarUrl,
        visibility:     'full',
        linked_type:    'digimon',
        linked_id:      line.id,
        status:         'approved',
        author_id:      null,
        owner_tamer_id: null,
      })
    } else if (avatarUrl && !row.avatar_url) {
      avatarUpdates.push(
        supabase.from('wiki_pages').update({ avatar_url: avatarUrl }).eq('id', row.id)
      )
    }
  }

  for (const survivor of (state.survivors ?? [])) {
    const key = `survivor:${survivor.id}`
    const row = existingMap.get(key)
    const avatarUrl = avatarByKey.get(key) ?? null
    if (!row) {
      toInsert.push({
        campaign_id:    CAMPAIGN,
        title:          `${survivor.name}${survivor.surname ? ' ' + survivor.surname : ''}`.trim(),
        category:       'humanos',
        sort_order:     orderFromList(SURVIVOR_NAME_ORDER, survivor.name.toLowerCase()),
        body:           '',
        avatar_url:     avatarUrl,
        visibility:     'full',
        linked_type:    'survivor',
        linked_id:      survivor.id,
        status:         'approved',
        author_id:      null,
        owner_tamer_id: null,
      })
    } else if (avatarUrl && !row.avatar_url) {
      avatarUpdates.push(
        supabase.from('wiki_pages').update({ avatar_url: avatarUrl }).eq('id', row.id)
      )
    }
  }

  if (avatarUpdates.length > 0) await Promise.all(avatarUpdates)

  const partnerCount = state.bestiary.filter(l => !!l.tamerId).length
  const survivorCount = (state.survivors ?? []).length
  const totalExpected = state.tamers.length + partnerCount + survivorCount

  if (toInsert.length === 0) {
    return { created: 0, skipped: totalExpected }
  }

  const { data } = await supabase.from('wiki_pages').insert(toInsert).select('id')
  const created = (data ?? []).length
  const skipped = totalExpected - created

  return { created, skipped }
}
