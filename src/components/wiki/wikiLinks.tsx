import React from 'react'
import type { WikiPage } from '../../types/wiki'

// Renderiza markdown simples + hyperlinks internos da Wiki no formato [[Título]].
// Diferente do parseMarkdown antigo (que usava dangerouslySetInnerHTML), este
// produz nós React para que os [[links]] sejam clicáveis e naveguem in-app.

// Só permite esquemas seguros em links externos (evita javascript:, data:, etc.).
function safeHref(url: string): string | null {
  const u = url.trim()
  if (/^(https?:\/\/|mailto:|\/)/i.test(u)) return u
  // URL sem esquema (ex.: "exemplo.com/x") → assume https.
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) return `https://${u}`
  return null
}

// Markdown inline suportado: **negrito**, *itálico*, [[Título]] (link interno)
// e [texto](url) (link externo, abre em nova aba).
function renderInline(
  text: string,
  pagesByTitle: Map<string, WikiPage>,
  onOpenPage: (id: string) => void,
  keyPrefix: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Regex combinado: link externo [texto](url) | wiki-link [[Título]] | negrito | itálico.
  // O link externo vem primeiro para não conflitar com [[...]].
  const re = /\[([^\]]+)\]\(([^)]+)\)|\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined && m[2] !== undefined) {
      // [texto](url) — link externo (abre em nova aba). URL insegura → texto puro.
      const label = m[1]
      const href = safeHref(m[2])
      if (href) {
        nodes.push(
          <a
            key={`${keyPrefix}-x${i}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--teal)', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            {label}
          </a>,
        )
      } else {
        nodes.push(label)
      }
    } else if (m[3] !== undefined) {
      // [[Título]] — resolve por título (case-insensitive)
      const raw = m[3].trim()
      const page = pagesByTitle.get(raw.toLowerCase())
      if (page) {
        nodes.push(
          <a
            key={`${keyPrefix}-l${i}`}
            onClick={e => { e.preventDefault(); onOpenPage(page.id) }}
            style={{ color: 'var(--coral)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            {raw}
          </a>,
        )
      } else {
        // Título inexistente — texto inerte em itálico
        nodes.push(
          <span key={`${keyPrefix}-d${i}`} style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>
            {raw}
          </span>,
        )
      }
    } else if (m[4] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[4]}</strong>)
    } else if (m[5] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{m[5]}</em>)
    }
    last = re.lastIndex
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function renderWikiMarkdown(
  text: string,
  allPages: WikiPage[],
  onOpenPage: (id: string) => void,
): React.ReactNode {
  if (!text) return null
  const pagesByTitle = new Map<string, WikiPage>()
  for (const p of allPages) pagesByTitle.set(p.title.trim().toLowerCase(), p)

  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  lines.forEach((line, idx) => {
    const h3 = line.match(/^### (.+)$/)
    const h2 = line.match(/^## (.+)$/)
    const h1 = line.match(/^# (.+)$/)
    if (h1) {
      blocks.push(<h1 key={idx} style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: '16px 0 8px' }}>{renderInline(h1[1], pagesByTitle, onOpenPage, `h1-${idx}`)}</h1>)
    } else if (h2) {
      blocks.push(<h2 key={idx} style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '14px 0 6px' }}>{renderInline(h2[1], pagesByTitle, onOpenPage, `h2-${idx}`)}</h2>)
    } else if (h3) {
      blocks.push(<h3 key={idx} style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: '12px 0 4px' }}>{renderInline(h3[1], pagesByTitle, onOpenPage, `h3-${idx}`)}</h3>)
    } else if (line.trim() === '') {
      blocks.push(<br key={idx} />)
    } else {
      blocks.push(<p key={idx} style={{ margin: '0 0 8px', lineHeight: 1.7 }}>{renderInline(line, pagesByTitle, onOpenPage, `p-${idx}`)}</p>)
    }
  })
  return <>{blocks}</>
}
