// Service Worker — Digimon Survive Companion
// Estratégia: network-first para HTML (sempre busca novo index.html para pegar
// hashes atualizados), cache-first para assets imutáveis (com hash no nome).

const CACHE = 'survive-cache-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
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
