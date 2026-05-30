import { supabase, isSupabaseReady } from '../supabase'
import { loadStagesFromDB, hydrateImagesFromStorage, setLastKnownUpdatedAt } from './state'
import type { AppState } from '../../types'

export function subscribeToState(
  onUpdate: (state: AppState) => void,
): () => void {
  if (!isSupabaseReady || !supabase) return () => {}

  const channel = supabase
    .channel('app_state_changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'app_state' },
      payload => {
        if (payload.new?.state) {
          if (payload.new.updated_at) setLastKnownUpdatedAt(payload.new.updated_at)
          hydrateImagesFromStorage(payload.new.state as AppState).then(onUpdate)
        }
      },
    )
    .subscribe()

  return () => { supabase?.removeChannel(channel) }
}

export function subscribeToStages(
  onUpdate: (stages: unknown[]) => void,
): () => void {
  if (!isSupabaseReady || !supabase) return () => {}

  const channel = supabase
    .channel('stages_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stages' },
      async () => {
        const data = await loadStagesFromDB()
        if (data) onUpdate(data)
      },
    )
    .subscribe()

  return () => { supabase?.removeChannel(channel) }
}

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Migra├º├úo ÔÇö dados locais ÔåÆ Supabase
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

