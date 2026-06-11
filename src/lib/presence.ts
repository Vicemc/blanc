import { useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseReady } from './supabase'
import type { UserProfile } from './auth'

export interface PresenceState {
  user_id:      string
  display_name: string
  joined_at:    number
  active_stage?: string  // id do palco que está sendo visto, opcional
}

// Hook de presença em tempo real (Realtime Presence).
// `activeStage` (opcional) é o id do palco que o usuário está vendo agora;
// ao mudar, re-publica a presença para dar co-presença por palco no Teatro.
export function usePresence(profile: UserProfile | null, activeStage?: string): PresenceState[] {
  const [presences, setPresences] = useState<PresenceState[]>([])
  const activeStageRef = useRef<string | undefined>(activeStage)

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
      const seen = new Set<string>()
      const flat: PresenceState[] = []
      for (const arr of Object.values(raw)) {
        for (const p of arr) {
          if (!p?.user_id || seen.has(p.user_id)) continue
          seen.add(p.user_id)
          flat.push(p)
        }
      }
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
            active_stage: activeStageRef.current,
          } as PresenceState)
        }
      })

    return () => { void channel.unsubscribe() }
  }, [profile])

  // Re-publica o palco ativo no canal existente quando `activeStage` muda,
  // sem recriar o canal (evita flicker de join/leave).
  useEffect(() => {
    activeStageRef.current = activeStage
    if (!isSupabaseReady || !supabase || !profile) return
    const channel = supabase.getChannels()
      .find(c => c.topic === 'realtime:presence-midnight-summer')
    if (!channel) return
    void channel.track({
      user_id: profile.id,
      display_name: profile.display_name,
      joined_at: Date.now(),
      active_stage: activeStage,
    } as PresenceState)
  }, [activeStage, profile])

  return presences
}
