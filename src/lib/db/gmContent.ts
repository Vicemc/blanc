import { supabase, isSupabaseReady } from '../supabase'

const CAMPAIGN = 'midnight-summer'

export interface GMNote {
  id?:          string
  title:        string
  content:      string
  entity_type?: string | null
  entity_id?:   string | null
}

export interface GMItem {
  id?:          string
  name:         string
  description:  string
  item_type:    string         // 'item' | 'weapon' | 'accessory' | 'key'
  assigned_to?: string | null  // character_id
  revealed:     boolean
}

// ── Notas do GM ───────────────────────────────────────────────────────────────

export async function listNotes(): Promise<GMNote[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase.from('gm_notes').select('*').eq('campaign', CAMPAIGN).order('updated_at', { ascending: false })
  return (data ?? []) as GMNote[]
}

export async function saveNote(note: GMNote): Promise<GMNote | null> {
  if (!isSupabaseReady || !supabase) return null
  if (note.id) {
    const { data } = await supabase.from('gm_notes').update({
      title: note.title, content: note.content,
      entity_type: note.entity_type ?? null, entity_id: note.entity_id ?? null,
    }).eq('id', note.id).select('*').single()
    return (data ?? null) as GMNote | null
  }
  const { data } = await supabase.from('gm_notes').insert({
    campaign: CAMPAIGN, title: note.title, content: note.content,
    entity_type: note.entity_type ?? null, entity_id: note.entity_id ?? null,
  }).select('*').single()
  return (data ?? null) as GMNote | null
}

export async function deleteNote(id: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('gm_notes').delete().eq('id', id)
}

// ── Itens do GM ───────────────────────────────────────────────────────────────

export async function listItems(): Promise<GMItem[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase.from('gm_items').select('*').eq('campaign', CAMPAIGN).order('updated_at', { ascending: false })
  return (data ?? []) as GMItem[]
}

export async function saveItem(item: GMItem): Promise<GMItem | null> {
  if (!isSupabaseReady || !supabase) return null
  const payload = {
    name: item.name, description: item.description, item_type: item.item_type,
    assigned_to: item.assigned_to ?? null, revealed: item.revealed,
  }
  if (item.id) {
    const { data } = await supabase.from('gm_items').update(payload).eq('id', item.id).select('*').single()
    return (data ?? null) as GMItem | null
  }
  const { data } = await supabase.from('gm_items').insert({ campaign: CAMPAIGN, ...payload }).select('*').single()
  return (data ?? null) as GMItem | null
}

export async function deleteItem(id: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('gm_items').delete().eq('id', id)
}

// Revela o item ao player dono (usa a RPC reveal_item; cai para update direto).
export async function revealItem(id: string, revealed = true): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  if (revealed) {
    const { error } = await supabase.rpc('reveal_item', { p_item_id: id })
    if (!error) return
  }
  await supabase.from('gm_items').update({ revealed }).eq('id', id)
}
