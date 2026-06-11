import { supabase, isSupabaseReady } from '../supabase'
import type { AppState } from '../../types'

const CAMPAIGN = 'midnight-summer'

export interface SnapshotRow {
  id:         string
  updated_at: string
  label?:     string
}

// Remove imagens inline antes de salvar como snapshot.
function stripImages(s: AppState): AppState {
  return {
    ...s,
    tamers:    s.tamers.map(t => ({ ...t, image: null })),
    survivors: (s.survivors ?? []).map(sv => ({ ...sv, image: null })),
    bestiary:  s.bestiary.map(d => ({
      ...d, image: null,
      stages: d.stages.map(st => ({ ...st, image: null })),
    })),
    bugs:      s.bugs.map(b => ({ ...b, image: null })),
    signs:     (s.signs ?? []).map(sg => ({ ...sg, image: null })),
  }
}

export async function listSnapshots(limit = 25): Promise<SnapshotRow[]> {
  if (!isSupabaseReady || !supabase) return []
  const { data } = await supabase
    .from('app_state')
    .select('id, updated_at, label')
    .eq('campaign', CAMPAIGN)
    .order('updated_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as SnapshotRow[]
}

export async function createSnapshot(state: AppState, label?: string): Promise<SnapshotRow | null> {
  if (!isSupabaseReady || !supabase) return null
  const { data } = await supabase
    .from('app_state')
    .insert({
      campaign:   CAMPAIGN,
      state:      stripImages(state),
      label:      label?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select('id, updated_at, label')
    .single()
  return (data ?? null) as SnapshotRow | null
}

// Renomeia (rotula) um snapshot existente.
export async function labelSnapshot(id: string, label: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('app_state').update({ label: label.trim() || null }).eq('id', id)
}

export async function loadSnapshot(id: string): Promise<AppState | null> {
  if (!isSupabaseReady || !supabase) return null
  const { data } = await supabase.from('app_state').select('state').eq('id', id).single()
  return (data?.state as AppState) ?? null
}

export async function deleteSnapshot(id: string): Promise<void> {
  if (!isSupabaseReady || !supabase) return
  await supabase.from('app_state').delete().eq('id', id)
}
