import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

export interface AppSettings {
  hideTaglines:  { enabled: boolean; pages: string[] }
  roundPopup:    boolean
  sheetView:     'vertical' | 'horizontal'
  sheetDotMode:  'number' | 'dots'
  partyCompact:  boolean
  attrView:      'blanc' | 'classica'
  digizapSound:  boolean
  theme:         'light' | 'dark'
}

// Por padrão, as taglines ficam ocultas em todos os lugares — exceto na Party
// (e no Palco, que não usa taglines via PageHead). O usuário pode reativá-las
// individualmente em Configurações.
const TAGLINE_HIDDEN_DEFAULT = ['goggle', 'sistema', 'teatro', 'backstage', 'wiki', 'mapas', 'configuracoes']

const DEFAULT: AppSettings = {
  hideTaglines:  { enabled: true, pages: TAGLINE_HIDDEN_DEFAULT },
  roundPopup:    true,
  sheetView:     'vertical',
  sheetDotMode:  'number',
  partyCompact:  false,
  attrView:      'blanc',
  digizapSound:  true,
  theme:         'light',
}

const KEY = 'survive_settings'
// Bump quando mudamos os defaults de taglines e queremos reaplicá-los uma vez
// a usuários que já têm settings salvos (sem sobrescrever escolhas posteriores).
const TAGLINE_DEFAULT_VERSION = 2
const TAGLINE_VERSION_KEY = 'survive_tagline_default_v'

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      try { localStorage.setItem(TAGLINE_VERSION_KEY, String(TAGLINE_DEFAULT_VERSION)) } catch {}
      return DEFAULT
    }
    const parsed = JSON.parse(raw)

    // Migração única: reaplica o default atual de taglines aos usuários antigos.
    const seenVersion = Number(localStorage.getItem(TAGLINE_VERSION_KEY) ?? '0')
    if (seenVersion < TAGLINE_DEFAULT_VERSION) {
      localStorage.setItem(TAGLINE_VERSION_KEY, String(TAGLINE_DEFAULT_VERSION))
      const migrated = { ...DEFAULT, ...parsed, hideTaglines: DEFAULT.hideTaglines }
      try { localStorage.setItem(KEY, JSON.stringify(migrated)) } catch {}
      return migrated
    }

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

  // Aplica o tema no <html> sempre que mudar
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme === 'dark' ? 'dark' : 'light'
  }, [settings.theme])

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
