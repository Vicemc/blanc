import React, { createContext, useContext, useState, useCallback } from 'react'

export interface AppSettings {
  hideTaglines: { enabled: boolean; pages: string[] }
  roundPopup:   boolean
  sheetView:    'vertical' | 'horizontal'
}

const DEFAULT: AppSettings = {
  hideTaglines: { enabled: false, pages: ['all'] },
  roundPopup:   true,
  sheetView:    'vertical',
}

const KEY = 'survive_settings'

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT,
      ...parsed,
      hideTaglines: { ...DEFAULT.hideTaglines, ...(parsed.hideTaglines ?? {}) },
    }
  } catch {
    return DEFAULT
  }
}

interface Ctx {
  settings:        AppSettings
  update:          (patch: Partial<AppSettings>) => void
  isTaglineHidden: (pageId: string) => boolean
}

const Context = createContext<Ctx>({
  settings:        DEFAULT,
  update:          () => {},
  isTaglineHidden: () => false,
})

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(load)

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const isTaglineHidden = useCallback((pageId: string): boolean => {
    if (!settings.hideTaglines.enabled) return false
    const { pages } = settings.hideTaglines
    return pages.includes('all') || pages.includes(pageId)
  }, [settings.hideTaglines])

  return (
    <Context.Provider value={{ settings, update, isTaglineHidden }}>
      {children}
    </Context.Provider>
  )
}

export function useSettings() { return useContext(Context) }
