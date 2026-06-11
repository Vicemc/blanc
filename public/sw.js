// Service Worker — Digimon Survive Companion
// Estratégia: network-first para HTML (sempre busca novo index.html para pegar
// hashes atualizados), cache-first para assets imutáveis (com hash no nome).
//
// Precache no install: ícones, app shell e sprites do elenco principal são
// gravados já no primeiro acesso, para o app abrir offline sem depender de
// visitas anteriores. Falhas individuais não abortam a instalação.

const CACHE = 'survive-cache-v2'

// Assets críticos same-origin garantidos no primeiro acesso.
const PRECACHE_URLS = [
  '/index.html',
  '/manifest.webmanifest',
  '/Blanc_Icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  // Sprites do elenco principal (PCs) — abrem a Party offline de cara.
  '/tamers/Naoki.png',
  '/tamers/Eisuke.png',
  '/tamers/Miki.png',
  '/tamers/Mori.png',
  '/tamers/Sachi.png',
  '/tamers/Yurieta.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // addAll é atômico (falha tudo se um 404). Adiciona um a um e ignora falhas.
      Promise.all(PRECACHE_URLS.map(u =>
        cache.add(u).catch(() => {})
      ))
    ).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// ── Web Push (Digi-Zap) ───────────────────────────────────────────────────────
// Recebe a notificação enviada pela Edge Function e a exibe. O payload é JSON:
// { title, body, tag, url }.
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'Digi-Zap'
  const options = {
    body:  data.body || 'Nova mensagem',
    tag:   data.tag || 'digizap',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    data:  { url: data.url || '/digizap' },
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Ao clicar na notificação: foca uma aba aberta ou abre o Digi-Zap.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/digizap'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {})
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Google Fonts (cross-origin) → cache-first em runtime para fontes offline.
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const fresh = await fetch(req)
          if (fresh.ok) cache.put(req, fresh.clone())
          return fresh
        } catch {
          return cached || new Response('', { status: 504 })
        }
      })
    )
    return
  }

  if (url.origin !== location.origin) return

  // HTML / navegação → network-first com fallback ao cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone()
        caches.open(CACHE).then(c => c.put('/index.html', copy)).catch(() => {})
        return resp
      }).catch(() => caches.match('/index.html').then(r => r || new Response('Offline', { status: 503 })))
    )
    return
  }

  // Demais assets → cache-first
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req)
      if (cached) return cached
      try {
        const fresh = await fetch(req)
        if (fresh.ok) cache.put(req, fresh.clone())
        return fresh
      } catch {
        return cached || new Response('', { status: 504 })
      }
    })
  )
})
