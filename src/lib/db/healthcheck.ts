import { supabase, isSupabaseReady } from '../supabase'

export interface HealthCheck {
  label:   string
  ok:      boolean
  detail?: string
}

const TABLES = [
  'profiles', 'app_state', 'stages', 'signs',
  'digivices', 'digi_zap_groups', 'digi_zap_messages', 'skill_tree_phases',
]

// Diagnóstico do setup do Supabase: tabelas, buckets e seed do Digi-Zap.
export async function runHealthcheck(): Promise<HealthCheck[]> {
  if (!isSupabaseReady || !supabase) {
    return [{ label: 'Supabase configurado', ok: false, detail: 'Variáveis de ambiente ausentes — rodando em modo local.' }]
  }

  const checks: HealthCheck[] = []

  for (const t of TABLES) {
    try {
      const { error } = await supabase.from(t).select('*', { head: true, count: 'exact' }).limit(1)
      checks.push({ label: `Tabela ${t}`, ok: !error, detail: error?.message })
    } catch (e) {
      checks.push({ label: `Tabela ${t}`, ok: false, detail: String(e) })
    }
  }

  // Buckets de Storage
  try {
    const { data, error } = await supabase.storage.listBuckets()
    const names = (data ?? []).map(b => b.name)
    checks.push({ label: "Bucket 'portraits'", ok: names.includes('portraits'), detail: error?.message })
    checks.push({ label: "Bucket 'assets'",    ok: names.includes('assets'),    detail: error?.message })
  } catch (e) {
    checks.push({ label: 'Storage buckets', ok: false, detail: String(e) })
  }

  // Seed dos grupos do Digi-Zap
  try {
    const { count, error } = await supabase.from('digi_zap_groups').select('*', { head: true, count: 'exact' })
    checks.push({
      label: 'Grupos do Digi-Zap (seed)',
      ok: !error && (count ?? 0) > 0,
      detail: error?.message ?? `${count ?? 0} grupo(s) encontrado(s)`,
    })
  } catch (e) {
    checks.push({ label: 'Grupos do Digi-Zap (seed)', ok: false, detail: String(e) })
  }

  return checks
}
