import { useEffect, useRef, useMemo, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
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

export default function WikiGraph({ pages, relations, isGM, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const visiblePages = useMemo(() => {
    if (isGM) return pages
    return pages.filter(p => p.visibility === 'name' || p.visibility === 'full')
  }, [pages, isGM])

  const visibleIds = useMemo(() => new Set(visiblePages.map(p => p.id)), [visiblePages])

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = visiblePages.map(p => ({
      id:         p.id,
      name:       p.title,
      category:   p.category,
      visibility: p.visibility,
      avatar:     p.avatar_url,
      val:        6,
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

  const getNodeColor = useCallback((node: GraphNode) => {
    if (!isGM && node.visibility === 'name') return '#c8c0ad'
    return CATEGORY_COLORS[node.category] ?? '#8a8377'
  }, [isGM])

  const handleNodeClick = useCallback((node: GraphNode) => {
    const page = pages.find(p => p.id === node.id)
    if (page) onNodeClick?.(page)
  }, [pages, onNodeClick])

  const paintNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const r = Math.sqrt(node.val) * 4
    const x = (node as any).x as number
    const y = (node as any).y as number
    const color = getNodeColor(node)

    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()

    if (!isGM && node.visibility === 'name') {
      ctx.strokeStyle = '#8a8377'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    const fontSize = Math.max(8, 12 / globalScale)
    ctx.font = `${fontSize}px DM Sans, sans-serif`
    ctx.fillStyle = '#1a1814'
    ctx.textAlign = 'center'
    ctx.fillText(node.name, x, y + r + fontSize + 2)
  }, [getNodeColor, isGM])

  const paintLink = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const src = link.source as any
    const tgt = link.target as any
    if (!src?.x || !tgt?.x) return

    ctx.beginPath()
    ctx.moveTo(src.x, src.y)
    ctx.lineTo(tgt.x, tgt.y)
    ctx.strokeStyle = 'rgba(200,192,173,0.7)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    if (link.label && globalScale > 0.6) {
      const mx = (src.x + tgt.x) / 2
      const my = (src.y + tgt.y) / 2
      const fontSize = Math.max(7, 10 / globalScale)
      ctx.font = `${fontSize}px DM Sans, sans-serif`
      ctx.fillStyle = '#8a8377'
      ctx.textAlign = 'center'
      ctx.fillText(link.label, mx, my - 3)
    }
  }, [])

  const width  = containerRef.current?.clientWidth  ?? 800
  const height = containerRef.current?.clientHeight ?? 500

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 520, background: 'var(--paper-deep)', borderRadius: 'var(--radius)', overflow: 'hidden' }}
    >
      <ForceGraph2D
        graphData={graphData as any}
        width={width}
        height={height}
        nodeCanvasObject={paintNode as any}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={paintLink as any}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={handleNodeClick as any}
        nodeLabel={(n: any) => (n as GraphNode).name}
        cooldownTicks={120}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.3}
      />
    </div>
  )
}
