// Utilitários para o card de música da Wiki (YouTube, sem API key).

// Extrai o id de 11 caracteres de um link do YouTube em vários formatos:
// youtube.com/watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, ou o id puro.
export function parseYouTubeId(input: string): string | null {
  if (!input) return null
  const s = input.trim()

  // id puro (11 chars válidos)
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,        // watch?v=
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,   // youtu.be/
    /\/embed\/([a-zA-Z0-9_-]{11})/,     // /embed/
    /\/shorts\/([a-zA-Z0-9_-]{11})/,    // /shorts/
    /\/v\/([a-zA-Z0-9_-]{11})/,         // /v/
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) return m[1]
  }
  return null
}

export function youtubeThumb(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`
}
