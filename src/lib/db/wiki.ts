import { supabase, isSupabaseReady } from '../supabase'
import type { WikiPage, WikiPageEdit, WikiRelation, WikiCategory, WikiVisibility, WikiLinkedType } from '../../types/wiki'
import type { AppState } from '../../types'

const CAMPAIGN = 'midnight-summer'

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
    body:        page.body ?? '',
    avatar_url:  page.avatar_url ?? null,
    visibility:  page.visibility ?? 'hidden',
    linked_type:    page.linked_type ?? null,
    linked_id:      page.linked_id ?? null,
    status:         page.status ?? 'approved',
    owner_tamer_id: page.owner_tamer_id ?? null,
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
  page: { title: string; category: WikiCategory; body: string }
): Promise<WikiPage | null> {
  if (!isSupabaseReady || !supabase) return null
  const { data } = await supabase
    .from('wiki_pages')
    .insert({
      campaign_id: CAMPAIGN,
      title:       page.title,
      category:    page.category,
      body:        page.body,
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
  edit: { page_id: string; title: string; body: string; category: WikiCategory }
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
      status:      'pending',
    })
    .select('*')
    .single()
  return (data ?? null) as WikiPageEdit | null
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
      .update({ title: edit.title, body: edit.body, category: edit.category, updated_at: new Date().toISOString() })
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

// ── Seed de páginas de personagens ────────────────────────────────────────────

const PC_TAMER_IDS = new Set(['t-naoki', 't-mori', 't-miki', 't-yuri', 't-eisuke', 't-sachi'])

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
    if (existingMap.has(`digimon:${line.id}`)) continue
    const stageName = line.stages[line.currentStage]?.stageName ?? line.name
    toInsert.push({
      campaign_id:    CAMPAIGN,
      title:          stageName,
      category:       'digimons',
      body:           '',
      avatar_url:     null,
      visibility:     'full',
      linked_type:    'digimon',
      linked_id:      line.id,
      status:         'approved',
      author_id:      null,
      owner_tamer_id: null,
    })
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
