// Web Push (PWA) para notificações do Digi-Zap.
// Gerencia permissão, inscrição (PushSubscription) e persistência no Supabase.
// Requer:
//   - VITE_VAPID_PUBLIC_KEY (chave pública VAPID) no .env
//   - tabela push_subscriptions (push_subscriptions_migration.sql)
//   - Service Worker com handler de 'push' (public/sw.js)
//   - Edge Function send-push (supabase/functions/send-push)

import { supabase, isSupabaseReady } from './supabase'

const VAPID_PUBLIC_KEY = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined

// Push só funciona com SW + Push API + chave VAPID configurada.
export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
    && !!VAPID_PUBLIC_KEY
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

// VAPID público vem em base64url; a Push API exige Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // Garante que o SW esteja registrado mesmo em dev (main.tsx só registra em PROD).
  try {
    const existing = await navigator.serviceWorker.getRegistration()
    if (existing) return existing
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

function subToRow(sub: PushSubscription) {
  const json = sub.toJSON()
  return {
    endpoint: sub.endpoint,
    p256dh:   json.keys?.p256dh ?? '',
    auth:     json.keys?.auth ?? '',
  }
}

// Pede permissão, inscreve e grava a inscrição no Supabase.
// Retorna true se a inscrição ficou ativa.
export async function enablePush(characterId: string | null): Promise<boolean> {
  if (!isPushSupported() || !isSupabaseReady || !supabase) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await getRegistration()
  if (!reg) return false

  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // O cast evita o conflito ArrayBufferLike vs ArrayBuffer das libs DOM.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
    })
  }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return false

  // upsert por endpoint (único) — evita duplicar a mesma inscrição.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, character_id: characterId, ...subToRow(sub) },
      { onConflict: 'endpoint' },
    )
  return !error
}

// Cancela a inscrição local e remove do Supabase.
export async function disablePush(): Promise<void> {
  const reg = await getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    if (isSupabaseReady && supabase) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    }
  }
}

// Existe uma inscrição ativa neste navegador?
export async function isPushEnabled(): Promise<boolean> {
  if (!isPushSupported()) return false
  const reg = await getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
}
