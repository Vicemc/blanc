import { supabase, isSupabaseReady } from '../supabase'
import type { WikiPage, WikiPageEdit, WikiRelation, WikiCategory, WikiVisibility, WikiLinkedType } from '../../types/wiki'

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
    linked_type: page.linked_type ?? null,
    linked_id:   page.linked_id ?? null,
    status:      page.status ?? 'approved',
    updated_at:  new Date().toISOString(),
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
