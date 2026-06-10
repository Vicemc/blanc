import type { WikiPage } from '../../types/wiki'

// Slug legível derivado do título da página (calculado em runtime, sem coluna no DB).
// Ex: "Hino Ogami" → "hino-ogami". Quando dois títulos geram o mesmo slug base,
// desempata anexando um sufixo curto do UUID para garantir unicidade.

export function slugifyTitle(title: string): string {
  return title
    .normalize('NFD')                    // separa base + diacríticos
    .replace(/[̀-ͯ]/g, '')     // remove os diacríticos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')         // não-alfanumérico → hífen
    .replace(/^-+|-+$/g, '')             // tira hífens das pontas
    || 'pagina'
}

// Conta quantas páginas compartilham um mesmo slug base.
function baseSlugCounts(pages: WikiPage[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of pages) {
    const base = slugifyTitle(p.title)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  return counts
}

// Slug único de uma página dentro do conjunto. Sem colisão → slug base.
// Com colisão → "base-<4 primeiros chars do id>".
export function pageSlug(page: WikiPage, allPages: WikiPage[]): string {
  const base = slugifyTitle(page.title)
  const counts = baseSlugCounts(allPages)
  if ((counts.get(base) ?? 0) <= 1) return base
  return `${base}-${page.id.slice(0, 4)}`
}

// Resolve um parâmetro de rota (slug OU uuid) para a página correspondente.
// Tenta: id exato → slug único → slug base (primeira correspondência).
export function resolvePageParam(param: string, allPages: WikiPage[]): WikiPage | null {
  if (!param) return null
  const byId = allPages.find(p => p.id === param)
  if (byId) return byId

  const lower = param.toLowerCase()
  const exactSlug = allPages.find(p => pageSlug(p, allPages) === lower)
  if (exactSlug) return exactSlug

  const byBase = allPages.find(p => slugifyTitle(p.title) === lower)
  return byBase ?? null
}

// True se o parâmetro parece um UUID (para sabermos quando redirecionar ao slug).
export function looksLikeUuid(param: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param)
}
