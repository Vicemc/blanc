import { supabase, isSupabaseReady } from '../supabase'
import { loadStateAsync, idbListImageKeys, idbLoadImage } from '../../data/store'
import type { AppState } from '../../types'

const CAMPAIGN = 'midnight-summer'
const BUCKET_PORTRAITS = 'portraits'

export async function migrateLocalToSupabase(): Promise<{
  ok: boolean
  error?: string
  imagesMigrated: number
}> {
  if (!isSupabaseReady || !supabase) {
    return { ok: false, error: 'Supabase n├úo configurado.', imagesMigrated: 0 }
  }

  try {
    // 1. Carregar estado j├í hidratado (com data URLs em mem├│ria)

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

    // 3. Tamb├®m pegar imagens que estejam no IDB mas n├úo no estado hidratado
    const idbKeys = await idbListImageKeys()

    // 4. Montar estado atualizado com imageKeys corretos
    const updatedTamers = await Promise.all(localState.tamers.map(async t => {
      // Tenta imagem do estado hidratado primeiro
      let path = await uploadEntityImage(t.id, t.image)
      // Se n├úo achou, tenta pelo imageKey existente via IDB
      if (!path && t.imageKey) {
        const dataUrl = await idbLoadImage(t.imageKey)
        path = await uploadEntityImage(t.imageKey, dataUrl)
      }
      // Tenta pela key padr├úo do IDB
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
      // Hidratar est├ígios
      const stages = await Promise.all(d.stages.map(async (st, i) => {
        if (!st.image && !st.imageKey) return { ...st, image: null }
        const stPath = await uploadEntityImage(`${d.id}-stage-${i}`, st.image ?? null)
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

    return { ok: true, imagesMigrated }
  } catch (e) {
    return { ok: false, error: String(e), imagesMigrated: 0 }
  }
}

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Helpers internos
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

