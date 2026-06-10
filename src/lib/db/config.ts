import { supabase, isSupabaseReady } from '../supabase'

const CAMPAIGN = 'midnight-summer'

// Configurações/flags campaign-wide (chave → valor jsonb).
// Leitura pública; escrita só pelo GM (garantido por RLS no DB).

export async function getCampaignConfig<T = unknown>(key: string): Promise<T | null> {
  if (!isSupabaseReady || !supabase) return null
  const { data, error } = await supabase
    .from('campaign_config')
    .select('value')
    .eq('campaign_id', CAMPAIGN)
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return null
  return (data.value ?? null) as T | null
}

export async function getAllCampaignConfig(): Promise<Record<string, unknown>> {
  if (!isSupabaseReady || !supabase) return {}
  const { data } = await supabase
    .from('campaign_config')
    .select('key, value')
    .eq('campaign_id', CAMPAIGN)
  const out: Record<string, unknown> = {}
  for (const row of data ?? []) out[(row as { key: string }).key] = (row as { value: unknown }).value
  return out
}

export async function setCampaignConfig(key: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady || !supabase) return { ok: false, error: 'Supabase não configurado' }
  const { error } = await supabase
    .from('campaign_config')
    .upsert(
      { campaign_id: CAMPAIGN, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'campaign_id,key' },
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
