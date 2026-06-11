import type { WikiContent, WikiBlock, WikiBlockType } from '../../types/wiki'

let _uid = 0
export function newBlockId(): string {
  return `wb-${Date.now()}-${_uid++}`
}

// Factory de blocos vazios por tipo.
export function newBlock(type: WikiBlockType): WikiBlock {
  const id = newBlockId()
  switch (type) {
    case 'infobox': return { id, type: 'infobox', width: 'half', title: '', fields: [] }
    case 'text':    return { id, type: 'text',    width: 'full', title: '', body: '' }
    case 'image':   return { id, type: 'image',   width: 'half', url: null, caption: '' }
    case 'gallery': return { id, type: 'gallery', width: 'full', title: '', images: [] }
    case 'divider': return { id, type: 'divider', width: 'full' }
  }
}

// Bloco de texto sem título derivado do "Sobre" (page.body), exibido como texto
// puro antes dos demais blocos. Retorna [] se o body estiver vazio.
function bodyBlock(body?: string): WikiBlock[] {
  return body && body.trim()
    ? [{ id: 'wb-body', type: 'text', width: 'full', title: '', body }]
    : []
}

// Converte um WikiContent (possivelmente legado) numa lista de blocos.
// O "Sobre" (page.body) é sempre renderizado como texto puro (sem cabeçalho)
// antes dos blocos inseridos pelo usuário. Se já houver blocks, prefixa o body;
// senão deriva da estrutura antiga (infobox → sobre → seções → galeria).
export function toBlocks(content: WikiContent | null | undefined, body?: string): WikiBlock[] {
  if (content?.blocks && content.blocks.length > 0) {
    return [...bodyBlock(body), ...content.blocks]
  }

  const out: WikiBlock[] = [...bodyBlock(body)]

  const infobox = content?.infobox ?? []
  if (infobox.length > 0) {
    out.push({ id: newBlockId(), type: 'infobox', width: 'full', title: '', fields: infobox })
  }

  for (const s of content?.sections ?? []) {
    out.push({ id: newBlockId(), type: 'text', width: 'full', title: s.heading, body: s.body })
  }

  const gallery = content?.gallery ?? []
  if (gallery.length > 0) {
    out.push({ id: newBlockId(), type: 'gallery', width: 'full', title: 'Galeria', images: gallery })
  }

  return out
}

// Agrupa blocos em linhas para a grade de 2 colunas:
// - um bloco 'full' ocupa a linha inteira (sozinho)
// - dois 'half' consecutivos formam uma linha de 2 colunas
// - um 'half' órfão (sem par) ocupa a linha sozinho
export function groupIntoRows(blocks: WikiBlock[]): WikiBlock[][] {
  const rows: WikiBlock[][] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    if (b.width === 'half' && blocks[i + 1]?.width === 'half') {
      rows.push([b, blocks[i + 1]])
      i += 2
    } else {
      rows.push([b])
      i += 1
    }
  }
  return rows
}

// Conta o total de imagens usadas (blocos image + somatório das galerias).
export function countImages(blocks: WikiBlock[]): number {
  let n = 0
  for (const b of blocks) {
    if (b.type === 'image' && b.url) n += 1
    else if (b.type === 'gallery') n += b.images.length
  }
  return n
}
