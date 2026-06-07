import { supabase, isSupabaseReady } from '../supabase'
import { loadState as localLoad, saveState as localSave, TAMER_DEFAULT_IMAGES, DIGIMON_DEFAULT_IMAGES, runMigrations } from '../../data/store'
import { DEFAULT_SURVIVORS } from '../../data/domain'
import type { AppState } from '../../types'

const CAMPAIGN = 'midnight-summer'
let _stateRowId: string | null = null
let _lastKnownUpdatedAt: string | null = null

export function setLastKnownUpdatedAt(ts: string | null): void {
  _lastKnownUpdatedAt = ts
}

export async function loadStateFromDB(): Promise<AppState> {
  if (!isSupabaseReady || !supabase) return localLoad()

  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('id, state, updated_at')
      .eq('campaign', CAMPAIGN)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return localLoad()

    _stateRowId = data.id
    _lastKnownUpdatedAt = data.updated_at
    let remoteState = data.state as AppState

    // Injetar survivors default que ainda não existam no estado remoto
    if (!remoteState.survivors?.length) {
      remoteState = { ...remoteState, survivors: DEFAULT_SURVIVORS }
    } else {
      const ids = new Set(remoteState.survivors.map(sv => sv.id))
      const missing = DEFAULT_SURVIVORS.filter(sv => !ids.has(sv.id))
      if (missing.length) remoteState = { ...remoteState, survivors: [...remoteState.survivors, ...missing] }
    }

    // Hidratar imagens do Storage (URLs públicas) + defaults estáticos
    const hydrated = await hydrateImagesFromStorage(remoteState)

    // Sincronizar localStorage como cache offline
    localSave(remoteState)
    return runMigrations(hydrated)
  } catch {
    return localLoad()
  }
}

// Hidrata imagens do Supabase Storage usando imageKey como path.
// Para imagens sem imageKey, cai para os assets est├íticos (TAMER_DEFAULT_IMAGES, etc.)
export async function hydrateImagesFromStorage(s: AppState): Promise<AppState> {
  if (!supabase) return s

  const hydrateTamer = (t: typeof s.tamers[0]) => {
    if (t.imageKey) return { ...t, image: storageUrl(BUCKET_PORTRAITS, t.imageKey) }
    if (TAMER_DEFAULT_IMAGES[t.id]) return { ...t, image: TAMER_DEFAULT_IMAGES[t.id] }
    return t
  }

  const hydrateDigimon = (d: typeof s.bestiary[0]) => {
    let result = d
    if (d.imageKey) result = { ...result, image: storageUrl(BUCKET_PORTRAITS, d.imageKey) }
    else if (!result.image) {
      const key = `${d.id}:${d.currentStage}`
      if (DIGIMON_DEFAULT_IMAGES[key]) result = { ...result, image: DIGIMON_DEFAULT_IMAGES[key] }
    }
    // Hidratar imagens de cada est├ígio
    const stages = result.stages.map((st, i) => {
      if (st.imageKey) return { ...st, image: storageUrl(BUCKET_PORTRAITS, st.imageKey) }
      const stageKey = `${d.id}:${i}`
      if (DIGIMON_DEFAULT_IMAGES[stageKey]) return { ...st, image: DIGIMON_DEFAULT_IMAGES[stageKey] }
      return st
    })
    return { ...result, stages }
  }

  const hydrateFn = (e: { imageKey?: string | null; image?: string | null; [k: string]: unknown }) => {
    if (e.imageKey) return { ...e, image: storageUrl(BUCKET_PORTRAITS, e.imageKey) }
    return e
  }

  return {
    ...s,
    tamers:    s.tamers.map(hydrateTamer),
    survivors: (s.survivors ?? []).map(hydrateFn as any),
    bestiary:  s.bestiary.map(hydrateDigimon),
    bugs:      s.bugs.map(hydrateFn as any),
    signs:     (s.signs ?? []).map(hydrateFn as any),
  }
}

export async function saveStateToDB(s: AppState): Promise<void> {
  // Salvar sempre localmente primeiro (zero lat├¬ncia na UI)
  localSave(s)

  if (!isSupabaseReady || !supabase) return

  try {
    // Estado sem data URLs inline (imagens ficam no Storage)
    const slim = stripImages(s)

    if (_stateRowId) {
      // Optimistic concurrency: só atualiza se updated_at não mudou desde o último load.
      let q = supabase
        .from('app_state')
        .update({ state: slim, updated_at: new Date().toISOString() })
        .eq('id', _stateRowId)
      if (_lastKnownUpdatedAt) q = q.eq('updated_at', _lastKnownUpdatedAt)
      const { data, error } = await q.select('updated_at').single()

      if (error || !data) {
        // Conflito detectado: outro cliente atualizou primeiro.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('app:save-conflict'))
        }
        // Busca o updated_at atual e tenta salvar com timestamp atualizado.
        // Evita force-save cego com estado potencialmente desatualizado.
        const { data: current } = await supabase
          .from('app_state')
          .select('updated_at')
          .eq('id', _stateRowId)
          .single()
        if (current) {
          _lastKnownUpdatedAt = current.updated_at
          const { data: retried } = await supabase
            .from('app_state')
            .update({ state: slim, updated_at: new Date().toISOString() })
            .eq('id', _stateRowId)
            .eq('updated_at', current.updated_at)
            .select('updated_at')
            .single()
          if (retried) _lastKnownUpdatedAt = retried.updated_at
        }
      } else {
        _lastKnownUpdatedAt = data.updated_at
      }
    } else {
      const { data } = await supabase
        .from('app_state')
        .insert({ campaign: CAMPAIGN, state: slim })
        .select('id, updated_at')
        .single()
      if (data) {
        _stateRowId = data.id
        _lastKnownUpdatedAt = data.updated_at
      }
    }
  } catch (e) {
    console.warn('[db] saveStateToDB falhou, usando localStorage como fallback', e)
  }
}

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Palcos (acesso independente para Realtime)
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

export async function loadStagesFromDB() {
  if (!isSupabaseReady || !supabase) return null

  const { data } = await supabase
    .from('stages')
    .select('*')
    .eq('campaign', CAMPAIGN)
    .order('created_at', { ascending: false })

  return data ?? null
}

export async function saveStage(stage: Record<string, unknown>) {
  if (!isSupabaseReady || !supabase) return

  await supabase
    .from('stages')
    .upsert({ ...stage, campaign: CAMPAIGN }, { onConflict: 'id' })
}

export async function deleteStage(id: string) {
  if (!isSupabaseReady || !supabase) return

  await supabase.from('stages').delete().eq('id', id)
}

// Atualiza atomicamente apenas o tamer do player no JSONB do app_state
// via RPC (sem sobrescrever o estado inteiro). Requer a função SQL
// `update_my_tamer` (ver supabase_player_writes.sql).
export async function updateMyTamer(tamer: import('../../types').Tamer): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady || !supabase) return { ok: false, error: 'Supabase não configurado' }
  // Não envia data URLs inline
  const slim = { ...tamer, image: null }
  const { data, error } = await supabase.rpc('update_my_tamer', { p_tamer: slim })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; reason?: string }
  return res?.ok ? { ok: true } : { ok: false, error: res?.reason }
}

// Atualiza atomicamente tamer + linha de digimon do player num único UPDATE.
// Substitui updateMyTamer nos fluxos de edição de ficha para que mudanças
// no digimon também sejam persistidas sem sobrescrever o estado inteiro.
export async function updateMyTamerAndLine(
  tamer: import('../../types').Tamer,
  line: import('../../types').DigimonLine | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady || !supabase) return { ok: false, error: 'Supabase não configurado' }
  const slimTamer = { ...tamer, image: null }
  const slimLine = line
    ? { ...line, image: null, stages: line.stages.map(st => ({ ...st, image: null })) }
    : null
  const { data, error } = await supabase.rpc('update_my_tamer_and_line', {
    p_tamer: slimTamer,
    p_line: slimLine,
  })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; reason?: string }
  return res?.ok ? { ok: true } : { ok: false, error: res?.reason }
}

// Atualiza atomicamente só a linha de digimon (sem tamer) — para wilds e digimons de guests.
// Só o GM pode chamar (verificado no SQL via is_gm()).
export async function updateDigimonLine(
  line: import('../../types').DigimonLine,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseReady || !supabase) return { ok: false, error: 'Supabase não configurado' }
  const slimLine = { ...line, image: null, stages: line.stages.map(st => ({ ...st, image: null })) }
  const { data, error } = await supabase.rpc('update_digimon_line', { p_line: slimLine })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; reason?: string }
  return res?.ok ? { ok: true } : { ok: false, error: res?.reason }
}

const BUCKET_PORTRAITS = 'portraits'

const _urlCache = new Map<string, string>()
function storageUrl(bucket: string, key: string): string | null {
  const cacheKey = `${bucket}:${key}`
  if (_urlCache.has(cacheKey)) return _urlCache.get(cacheKey)!
  const { data } = supabase!.storage.from(bucket).getPublicUrl(key)
  const url = data?.publicUrl ?? null
  if (url) _urlCache.set(cacheKey, url)
  return url
}

function stripImages(s: AppState): AppState {
  return {
    ...s,
    tamers:    s.tamers.map(t    => ({ ...t, image: null })),
    survivors: (s.survivors ?? []).map(sv => ({ ...sv, image: null })),
    bestiary:  s.bestiary.map(d  => ({
      ...d, image: null,
      stages: d.stages.map(st => ({ ...st, image: null })),
    })),
    bugs:      s.bugs.map(b     => ({ ...b, image: null })),
    signs:     (s.signs ?? []).map(sg => ({ ...sg, image: null })),
  }
}
