// src/lib/db.ts
// Camada de persistência — Supabase primeiro, localStorage como fallback.
// O app continua funcional sem Supabase configurado (modo local).

import { supabase, isSupabaseReady } from './supabase'
import {
  loadState as localLoad,
  saveState as localSave,
  idbSaveImage,
  idbLoadImage,
  idbListImageKeys,
} from '../data/store'
import type { AppState } from '../types'

const CAMPAIGN = 'midnight-summer'

// ─────────────────────────────────────────────────────────────────────────────
// Estado da campanha
// ─────────────────────────────────────────────────────────────────────────────

// Cache local do ID da linha no Supabase (evita SELECT a cada save)
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

    // Hidratar imagens do Storage (URLs públicas) + defaults estáticos
    const hydrated = await hydrateImagesFromStorage(remoteState)

    // Sincronizar localStorage como cache offline
    localSave(remoteState)
    return hydrated
  } catch {
    return localLoad()
  }
}

// Hidrata imagens do Supabase Storage usando imageKey como path.
// Para imagens sem imageKey, cai para os assets estáticos (TAMER_DEFAULT_IMAGES, etc.)
async function hydrateImagesFromStorage(s: AppState): Promise<AppState> {
  if (!supabase) return s

  const { TAMER_DEFAULT_IMAGES, DIGIMON_DEFAULT_IMAGES } = await import('../data/store')

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
    // Hidratar imagens de cada estágio
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
  // Salvar sempre localmente primeiro (zero latência na UI)
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

// ─────────────────────────────────────────────────────────────────────────────
// Palcos (acesso independente para Realtime)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Imagens — Supabase Storage
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET_PORTRAITS = 'portraits'
const BUCKET_ASSETS    = 'assets'

export async function uploadImage(
  dataUrl: string,
  path: string,
  bucket = BUCKET_PORTRAITS,
): Promise<string | null> {
  if (!isSupabaseReady || !supabase) {
    // Fallback: salvar no IDB com path como key
    await idbSaveImage(path, dataUrl)
    return dataUrl
  }

  try {
    // Converter dataUrl → Blob
    const res  = await fetch(dataUrl)
    const blob = await res.blob()
    const ext  = blob.type.split('/')[1] || 'webp'

    const { error } = await supabase.storage
      .from(bucket)
      .upload(`${path}.${ext}`, blob, { upsert: true, contentType: blob.type })

    if (error) {
      console.warn('[db] upload falhou, usando IDB', error.message)
      await idbSaveImage(path, dataUrl)
      return dataUrl
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(`${path}.${ext}`)

    return urlData.publicUrl
  } catch (e) {
    console.warn('[db] uploadImage exception', e)
    await idbSaveImage(path, dataUrl)
    return dataUrl
  }
}

export async function getImageUrl(
  path: string,
  bucket = BUCKET_PORTRAITS,
): Promise<string | null> {
  if (!isSupabaseReady || !supabase) {
    return idbLoadImage(path)
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)

  return data?.publicUrl ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill Tree
// ─────────────────────────────────────────────────────────────────────────────

export async function loadSkillTree(tamerId?: string) {
  if (!isSupabaseReady || !supabase) return null

  const q = supabase
    .from('skill_tree_phases')
    .select('*')
    .eq('campaign', CAMPAIGN)
    .order('phase_num', { ascending: true })

  if (tamerId) q.eq('tamer_id', tamerId)

  const { data } = await q
  return data ?? null
}

export async function saveSkillPhase(phase: Record<string, unknown>) {
  if (!isSupabaseReady || !supabase) return

  await supabase
    .from('skill_tree_phases')
    .upsert({ ...phase, campaign: CAMPAIGN }, { onConflict: 'id' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Realtime — subscrições
// ─────────────────────────────────────────────────────────────────────────────

export function subscribeToState(
  onUpdate: (state: AppState) => void,
): () => void {
  if (!isSupabaseReady || !supabase) return () => {}

  const channel = supabase
    .channel('app_state_changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'app_state' },
      payload => {
        if (payload.new?.state) onUpdate(payload.new.state as AppState)
      },
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

export function subscribeToStages(
  onUpdate: (stages: unknown[]) => void,
): () => void {
  if (!isSupabaseReady || !supabase) return () => {}

  const channel = supabase
    .channel('stages_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stages' },
      async () => {
        // Re-fetch completo ao detectar mudança
        const data = await loadStagesFromDB()
        if (data) onUpdate(data)
      },
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Migração — dados locais → Supabase
// ─────────────────────────────────────────────────────────────────────────────

export async function migrateLocalToSupabase(): Promise<{
  ok: boolean
  error?: string
  imagesMigrated: number
}> {
  if (!isSupabaseReady || !supabase) {
    return { ok: false, error: 'Supabase não configurado.', imagesMigrated: 0 }
  }

  try {
    // 1. Carregar estado já hidratado (com data URLs em memória)
    const { loadStateAsync } = await import('../data/store')
    const localState = await loadStateAsync()

    // 2. Para cada entidade com imagem, fazer upload direto da data URL
    // e guardar o path no imageKey
    let imagesMigrated = 0

    const uploadEntityImage = async (
      id: string,
      dataUrl: string | null,
    ): Promise<string | null> => {
      if (!dataUrl || !dataUrl.startsWith('data:')) return null
      try {
        const res  = await fetch(dataUrl)
        const blob = await res.blob()
        const ext  = blob.type.split('/')[1] || 'webp'
        const path = `${id}.${ext}`
        const { error } = await supabase!.storage
          .from(BUCKET_PORTRAITS)
          .upload(path, blob, { upsert: true, contentType: blob.type })
        if (error) { console.warn('[migrate] upload falhou:', id, error.message); return null }
        imagesMigrated++
        return path
      } catch (e) {
        console.warn('[migrate] upload exception:', id, e)
        return null
      }
    }

    // 3. Também pegar imagens que estejam no IDB mas não no estado hidratado
    const idbKeys = await idbListImageKeys()

    // 4. Montar estado atualizado com imageKeys corretos
    const updatedTamers = await Promise.all(localState.tamers.map(async t => {
      // Tenta imagem do estado hidratado primeiro
      let path = await uploadEntityImage(t.id, t.image)
      // Se não achou, tenta pelo imageKey existente via IDB
      if (!path && t.imageKey) {
        const dataUrl = await idbLoadImage(t.imageKey)
        path = await uploadEntityImage(t.imageKey, dataUrl)
      }
      // Tenta pela key padrão do IDB
      if (!path) {
        const stdKey = `img-${t.id}`
        if (idbKeys.includes(stdKey)) {
          const dataUrl = await idbLoadImage(stdKey)
          path = await uploadEntityImage(stdKey, dataUrl)
        }
      }
      return { ...t, image: null, imageKey: path ?? t.imageKey ?? null }
    }))

    const updatedBestiary = await Promise.all(localState.bestiary.map(async d => {
      let path = await uploadEntityImage(d.id, d.image)
      if (!path && d.imageKey) {
        const dataUrl = await idbLoadImage(d.imageKey)
        path = await uploadEntityImage(d.imageKey, dataUrl)
      }
      if (!path) {
        const stdKey = `img-${d.id}`
        if (idbKeys.includes(stdKey)) {
          const dataUrl = await idbLoadImage(stdKey)
          path = await uploadEntityImage(stdKey, dataUrl)
        }
      }
      // Hidratar estágios
      const stages = await Promise.all(d.stages.map(async (st, i) => {
        if (!st.image && !st.imageKey) return { ...st, image: null }
        const stPath = await uploadEntityImage(`${d.id}-stage-${i}`, st.image)
        return { ...st, image: null, imageKey: stPath ?? st.imageKey ?? null }
      }))
      return { ...d, image: null, imageKey: path ?? d.imageKey ?? null, stages }
    }))

    const updatedBugs = await Promise.all(localState.bugs.map(async b => {
      let path = await uploadEntityImage(b.id, b.image)
      if (!path && b.imageKey) {
        const dataUrl = await idbLoadImage(b.imageKey)
        path = await uploadEntityImage(b.imageKey, dataUrl)
      }
      return { ...b, image: null, imageKey: path ?? b.imageKey ?? null }
    }))

    const updatedSigns = await Promise.all((localState.signs ?? []).map(async sg => {
      const path = await uploadEntityImage(sg.id, sg.image)
      return { ...sg, image: null, imageKey: path ?? sg.imageKey ?? null }
    }))

    const updatedState: AppState = {
      ...localState,
      tamers:   updatedTamers,
      bestiary: updatedBestiary,
      bugs:     updatedBugs,
      signs:    updatedSigns,
    }

    // 5. Salvar estado atualizado no Supabase
    const { data, error } = await supabase
      .from('app_state')
      .insert({ campaign: CAMPAIGN, state: updatedState })
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message, imagesMigrated }
    _stateRowId = data?.id ?? null

    return { ok: true, imagesMigrated }
  } catch (e) {
    return { ok: false, error: String(e), imagesMigrated: 0 }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

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