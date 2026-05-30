import { supabase, isSupabaseReady } from '../supabase'
import { idbSaveImage, idbLoadImage } from '../../data/store'

const BUCKET_PORTRAITS = 'portraits'

// Redimensiona e recodifica a imagem no cliente antes de subir/salvar.
// Reduz drasticamente o tamanho em Storage/IndexedDB e o uso de memória.
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function compressDataUrl(
  dataUrl: string,
  maxDim = 1024,
  quality = 0.82,
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl
  try {
    const img = await loadImageEl(dataUrl)
    const { width, height } = img
    if (!width || !height) return dataUrl
    const scale = Math.min(1, maxDim / Math.max(width, height))
    // Já pequena o bastante — não reprocessa
    if (scale >= 1 && dataUrl.length < 350_000) return dataUrl
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    const out = canvas.toDataURL('image/webp', quality)
    // Se por algum motivo ficou maior (imagem minúscula), mantém o original
    return out.length < dataUrl.length ? out : dataUrl
  } catch {
    return dataUrl
  }
}

export async function uploadImage(
  rawDataUrl: string,
  path: string,
  bucket = BUCKET_PORTRAITS,
): Promise<string | null> {
  const dataUrl = await compressDataUrl(rawDataUrl)

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

    // Timestamp no nome para garantir URL única a cada upload (evita cache do browser)
    const uniqueKey = `${path}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from(bucket)
      .upload(uniqueKey, blob, { upsert: true, contentType: blob.type })

    if (error) {
      console.warn('[db] upload falhou, usando IDB', error.message)
      await idbSaveImage(path, dataUrl)
      return dataUrl
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(uniqueKey)

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

