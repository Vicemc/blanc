// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  console.warn('[supabase] Variáveis de ambiente não configuradas — rodando em modo local.')
}

export const supabase = (url && key)
  ? createClient(url, key)
  : null

export const isSupabaseReady = !!supabase
