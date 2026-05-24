import { supabase, isSupabaseReady } from '../supabase'
import { loadState as localLoad, saveState as localSave, idbSaveImage, idbLoadImage, idbListImageKeys, loadStateAsync, TAMER_DEFAULT_IMAGES, DIGIMON_DEFAULT_IMAGES } from '../../data/store'
import type { AppState } from '../../types'

const CAMPAIGN = 'midnight-summer'
let _stateRowId: string | null = null

export async function loadStateFromDB(): Promise<AppState> {
  if (!isSupabaseReady || !supabase) return localLoad()

  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('id, state')
      .eq('campaign', CAMPAIGN)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return localLoad()

    _stateRowId = data.id
    const remoteState = data.state as AppState

    // Hidratar imagens do Storage (URLs p├║blicas) + defaults est├íticos
    const hydrated = await hydrateImagesFromStorage(remoteState)

    // Sincronizar localStorage como cache offline
    localSave(remoteState)
    return hydrated
  } catch {
    return localLoad()
  }
}

// Hidrata imagens do Supabase Storage usando imageKey como path.
// Para imagens sem imageKey, cai para os assets est├íticos (TAMER_DEFAULT_IMAGES, etc.)
async function hydrateImagesFromStorage(s: AppState): Promise<AppState> {
  if (!supabase) return s

  const storageUrl = (bucket: string, key: string) => {
    const { data } = supabase!.storage.from(bucket).getPublicUrl(key)
    return data?.publicUrl ?? null
  }

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
    tamers:   s.tamers.map(hydrateTamer),
    bestiary: s.bestiary.map(hydrateDigimon),
    bugs:     s.bugs.map(hydrateFn as any),
    signs:    (s.signs ?? []).map(hydrateFn as any),
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
      await supabase
        .from('app_state')
        .update({ state: slim, updated_at: new Date().toISOString() })
        .eq('id', _stateRowId)
    } else {
      const { data } = await supabase
        .from('app_state')
        .insert({ campaign: CAMPAIGN, state: slim })
        .select('id')
        .single()
      if (data) _stateRowId = data.id
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

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Imagens ÔÇö Supabase Storage
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

const BUCKET_PORTRAITS = 'portraits'
const BUCKET_ASSETS    = 'assets'

function stripImages(s: AppState): AppState {
  return {
    ...s,
    tamers:   s.tamers.map(t    => ({ ...t, image: null })),
    bestiary: s.bestiary.map(d  => ({
      ...d, image: null,
      stages: d.stages.map(st => ({ ...st, image: null })),
    })),
    bugs:     s.bugs.map(b     => ({ ...b, image: null })),
    signs:    (s.signs ?? []).map(sg => ({ ...sg, image: null })),
  }
}
