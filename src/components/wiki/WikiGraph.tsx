import { useEffect, useRef, useMemo, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — d3-force-3d ships no types; forceCollide API matches d3-force
import { forceCollide } from 'd3-force-3d'
import type { WikiPage, WikiRelation } from '../../types/wiki'

interface Props {
  pages: WikiPage[]
  relations: WikiRelation[]
  isGM: boolean
  onNodeClick?: (page: WikiPage) => void
}

interface GraphNode {
  id: string
  name: string
  category: string
  visibility: string
  avatar?: string | null
  val: number
}

interface GraphLink {
  id: string
  source: string
  target: string
  label: string
}

const CATEGORY_COLORS: Record<string, string> = {
  humanos:    '#e25845',
  agentes:    '#3b3a5e',
  digimons:   '#4a9b9b',
  locais:     '#6e9d70',
  faccoes:    '#8a6ea0',
  eventos:    '#e87a2c',
  documentos: '#d9b974',
  itens:      '#d99fae',
  bugs:       '#c43321',
  signs:      '#6e8bb5',
  entidades:  '#8a8377',
}

// Paleta harmoniosa com o tema — cada label de relação recebe uma cor determinística
const LINK_PALETTE = [
  '#e25845',
  '#4a9b9b',
  '#6e9d70',
  '#8a6ea0',
  '#e87a2c',
  '#d9b974',
  '#6e8bb5',
  '#d99fae',
  '#3b3a5e',
]

function labelColor(label: string): string {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return LINK_PALETTE[h % LINK_PALETTE.length]
}

// Converte hex #rrggbb para rgba com opacidade
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function WikiGraph({ pages, relations, isGM, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef     = useRef<ForceGraphMethods<GraphNode, GraphLink>>()

  const visiblePages = useMemo(() => {
    if (isGM) return pages
    return pages.filter(p => p.visibility === 'name' || p.visibility === 'full')
  }, [pages, isGM])

  const visibleIds = useMemo(() => new Set(visiblePages.map(p => p.id)), [visiblePages])

  const graphData = useMemo(() => {
    // Grau de cada nó a partir das relações visíveis
    const degMap = new Map<string, number>()
    for (const r of relations) {
      if (visibleIds.has(r.from_id) && visibleIds.has(r.to_id)) {
        degMap.set(r.from_id, (degMap.get(r.from_id) ?? 0) + 1)
        degMap.set(r.to_id,   (degMap.get(r.to_id)   ?? 0) + 1)
      }
    }

    const nodes: GraphNode[] = visiblePages.map(p => ({
      id:         p.id,
      name:       p.title,
      category:   p.category,
      visibility: p.visibility,
      avatar:     p.avatar_url,
      val:        Math.max(4, Math.min(20, 4 + (degMap.get(p.id) ?? 0) * 2)),
    }))

    const links: GraphLink[] = relations
      .filter(r => visibleIds.has(r.from_id) && visibleIds.has(r.to_id))
      .map(r => ({
        id:     r.id,
        source: r.from_id,
        target: r.to_id,
        label:  r.label,
      }))

    return { nodes, links }
  }, [visiblePages, relations, visibleIds])

  // Aplica forças D3 sempre que os dados mudam
  useEffect(() => {
    const fg = graphRef.current
    if (!fg) return
    fg.d3Force('charge')?.strength?.(-120)
    fg.d3Force('collide', forceCollide(
      (node: any) => Math.sqrt(node.val ?? 4) * 4 + 12
    ))
  }, [graphData])

  const getNodeColor = useCallback((node: GraphNode) => {
    if (!isGM && node.visibility === 'name') return '#c8c0ad'
    return CATEGORY_COLORS[node.category] ?? '#8a8377'
  }, [isGM])

  const handleNodeClick = useCallback((node: GraphNode) => {
    const page = pages.find(p => p.id === node.id)
    if (page) onNodeClick?.(page)
  }, [pages, onNodeClick])

  const paintNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const r     = Math.sqrt(node.val) * 4
    const x     = (node as any).x as number
    const y     = (node as any).y as number
    const color = getNodeColor(node)

    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()

    if (!isGM && node.visibility === 'name') {
      ctx.strokeStyle = '#8a8377'
      ctx.lineWidth = 1.5 / globalScale
      ctx.stroke()
    }

    // Oculta labels quando afastado demais — evita borrão ilegível
    if (globalScale < 0.5) return

    const fontSize = Math.max(8, 12 / globalScale)
    ctx.font = `600 ${fontSize}px DM Sans, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'

    const label  = node.name
    const textW  = ctx.measureText(label).width
    const labelX = x
    const labelY = y + r + fontSize + 4

    // Pill de fundo arredondada
    const padX = 4, padY = 2, cr = 3
    const rx = labelX - textW / 2 - padX
    const ry = labelY - fontSize - padY
    const rw = textW + padX * 2
    const rh = fontSize + padY * 2

    ctx.fillStyle = 'rgba(26,24,20,0.75)'
    ctx.beginPath()
    ctx.moveTo(rx + cr, ry)
    ctx.lineTo(rx + rw - cr, ry)
    ctx.arcTo(rx + rw, ry, rx + rw, ry + cr, cr)
    ctx.lineTo(rx + rw, ry + rh - cr)
    ctx.arcTo(rx + rw, ry + rh, rx + rw - cr, ry + rh, cr)
    ctx.lineTo(rx + cr, ry + rh)
    ctx.arcTo(rx, ry + rh, rx, ry + rh - cr, cr)
    ctx.lineTo(rx, ry + cr)
    ctx.arcTo(rx, ry, rx + cr, ry, cr)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#e8e0d0'
    ctx.fillText(label, labelX, labelY)
  }, [getNodeColor, isGM])

  const paintLink = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const src = link.source as any
    const tgt = link.target as any
    if (!src?.x || !tgt?.x) return

    const color = labelColor(link.label)

    ctx.beginPath()
    ctx.moveTo(src.x, src.y)
    ctx.lineTo(tgt.x, tgt.y)
    ctx.strokeStyle = hexToRgba(color, 0.55)
    ctx.lineWidth = 1 / globalScale
    ctx.stroke()

    if (link.label && globalScale > 0.8) {
      const mx = (src.x + tgt.x) / 2
      const my = (src.y + tgt.y) / 2

      // Offset perpendicular para o label não ficar sobre a linha
      const dx  = tgt.x - src.x
      const dy  = tgt.y - src.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const nx  = -dy / len
      const ny  =  dx / len
      const labelX = mx + nx * 6
      const labelY = my + ny * 6

      const fontSize = Math.max(6, 9 / globalScale)
      ctx.font = `italic ${fontSize}px DM Sans, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'

      const textW = ctx.measureText(link.label).width
      const padX = 3, padY = 1

      ctx.fillStyle = 'rgba(26,24,20,0.7)'
      ctx.fillRect(
        labelX - textW / 2 - padX,
        labelY - fontSize - padY,
        textW + padX * 2,
        fontSize + padY * 2,
      )

      ctx.fillStyle = hexToRgba(color, 0.9)
      ctx.fillText(link.label, labelX, labelY)
    }
  }, [])

  const width  = containerRef.current?.clientWidth  ?? 800
  const height = containerRef.current?.clientHeight ?? 640

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 640, background: 'var(--paper-deep)', borderRadius: 'var(--radius)', overflow: 'hidden' }}
    >
      <ForceGraph2D
        ref={graphRef as any}
        graphData={graphData as any}
        width={width}
        height={height}
        nodeCanvasObject={paintNode as any}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={paintLink as any}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={handleNodeClick as any}
        nodeLabel={(n: any) => (n as GraphNode).name}
        cooldownTicks={200}
        warmupTicks={50}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.25}
      />
    </div>
  )
}
