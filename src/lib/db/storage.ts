import { supabase, isSupabaseReady } from '../supabase'
import { idbSaveImage, idbLoadImage } from '../../data/store'

const BUCKET_PORTRAITS = 'portraits'
const BUCKET_ASSETS = 'assets'

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
    // Converter dataUrl ÔåÆ Blob
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

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Skill Tree
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

