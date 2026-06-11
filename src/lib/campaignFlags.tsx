import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getAllCampaignConfig, setCampaignConfig, subscribeToCampaignConfig } from './db'

// Flags campaign-wide propagadas pelo DB (lidas no load + realtime).
// O GM liga/desliga para todos; default ausente = desligado.

export interface CampaignFlags {
  wiki_detailed_pages: boolean
  digizap_enabled:     boolean   // liga/desliga o Digi-Zap para todos
  maps_for_players:    boolean   // habilita a aba Mapas para os players
  spoiler_mode:        boolean   // oculta categorias sensíveis da Wiki dos players
}

const DEFAULTS: CampaignFlags = {
  wiki_detailed_pages: false,
  digizap_enabled:     true,   // ligado por padrão (comportamento atual)
  maps_for_players:    true,   // mapas já visíveis aos players por padrão
  spoiler_mode:        false,
}

interface Ctx {
  flags:   CampaignFlags
  loaded:  boolean
  setFlag: (key: keyof CampaignFlags, value: boolean) => Promise<void>
}

const Context = createContext<Ctx>({
  flags:   DEFAULTS,
  loaded:  false,
  setFlag: async () => {},
})

function coerce(raw: Record<string, unknown>): CampaignFlags {
  // Para flags que vêm ligadas por padrão, "ausente" deve preservar o default
  // (só desliga quando explicitamente false no DB).
  const boolOr = (v: unknown, fallback: boolean) =>
    v === undefined || v === null ? fallback : v === true
  return {
    wiki_detailed_pages: raw.wiki_detailed_pages === true,
    digizap_enabled:     boolOr(raw.digizap_enabled, DEFAULTS.digizap_enabled),
    maps_for_players:    boolOr(raw.maps_for_players, DEFAULTS.maps_for_players),
    spoiler_mode:        raw.spoiler_mode === true,
  }
}

export function CampaignFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags,  setFlags]  = useState<CampaignFlags>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const raw = await getAllCampaignConfig()
    setFlags(coerce(raw))
    setLoaded(true)
  }, [])

  useEffect(() => {
    refresh()
    const unsub = subscribeToCampaignConfig(refresh)
    return unsub
  }, [refresh])

  const setFlag = useCallback(async (key: keyof CampaignFlags, value: boolean) => {
    // Atualização otimista — realtime confirma depois
    setFlags(prev => ({ ...prev, [key]: value }))
    await setCampaignConfig(key, value)
  }, [])

  return (
    <Context.Provider value={{ flags, loaded, setFlag }}>
      {children}
    </Context.Provider>
  )
}

export function useCampaignFlags() { return useContext(Context) }
