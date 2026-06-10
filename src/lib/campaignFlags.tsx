import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getAllCampaignConfig, setCampaignConfig, subscribeToCampaignConfig } from './db'

// Flags campaign-wide propagadas pelo DB (lidas no load + realtime).
// O GM liga/desliga para todos; default ausente = desligado.

export interface CampaignFlags {
  wiki_detailed_pages: boolean
}

const DEFAULTS: CampaignFlags = {
  wiki_detailed_pages: false,
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
  return {
    wiki_detailed_pages: raw.wiki_detailed_pages === true,
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
