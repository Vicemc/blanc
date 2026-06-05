import { supabase, isSupabaseReady } from '../supabase'
import type { WikiPage, WikiRelation, WikiCategory, WikiVisibility, WikiLinkedType } from '../../types/wiki'

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
