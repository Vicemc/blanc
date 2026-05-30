import { useEffect, useState } from 'react'
import { supabase, isSupabaseReady } from './supabase'
import type { UserProfile } from './auth'

export interface PresenceState {
  user_id:      string
  display_name: string
  joined_at:    number
  active_stage?: string  // id do palco que está sendo visto, opcional
}

// Hook de presença em tempo real (Realtime Presence).
export function usePresence(profile: UserProfile | null): PresenceState[] {
  const [presences, setPresences] = useState<PresenceState[]>([])

  useEffect(() => {
    if (!isSupabaseReady || !supabase || !profile) {
      setPresences([])
      return
    }
    const channel = supabase.channel('presence-midnight-summer', {
      config: { presence: { key: profile.id } },
    })

    const compile = () => {
      const raw = channel.presenceState() as Record<string, PresenceState[]>
      const flat: PresenceState[] = []
      for (const arr of Object.values(raw)) for (const p of arr) flat.push(p)
      setPresences(flat)
    }

    channel
      .on('presence', { event: 'sync' },  compile)
      .on('presence', { event: 'join' },  compile)
      .on('presence', { event: 'leave' }, compile)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: profile.id,
            display_name: profile.display_name,
            joined_at: Date.now(),
          } as PresenceState)
        }
      })

    return () => { void channel.unsubscribe() }
  }, [profile])

  return presences
}
