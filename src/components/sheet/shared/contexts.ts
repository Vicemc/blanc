import { createContext } from 'react'

export type DisplayMode = 'number' | 'dots'

export const DisplayModeCtx = createContext<DisplayMode>('number')

export const KeywordTipsCtx = createContext<Record<string, string>>({})
