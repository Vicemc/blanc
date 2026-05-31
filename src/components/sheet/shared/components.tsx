import React, { useState, useContext, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  AttributeKey, Attributes, SkillSet, TamerSkill, DigimonSkill,
  PalcoCondition, PassiveToggleBonus,
} from '../../../types'
import { ATTRIBUTE_GROUPS, AFFINITY_KEYS } from '../../../types'
import { xpCostAttribute, xpCostSkill } from '../../../data/store'
import { ruleSlug } from '../../../data/rulesData'
import { useSettings } from '../../../lib/settings'
import { GrainFill } from '../../GrainFill'
import styles from '../../Sheet.module.css'
import { DisplayModeCtx, KeywordTipsCtx } from './contexts'
import type { StatEntry, TokenSpawn } from './types'
import { parseTokenSpawns, AFFINITY_ICONS, KEYWORD_TIPS } from './utils'

// ── utilidades inline ──────────────────────────────────────────────
export const inp = (val: string, set: (v: string) => void, ph = '', style?: React.CSSProperties) => (
  <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
    className={styles.formInput} style={style} />
)

// ── ValueDisplay: número ou bolinhas ─────────────────────────────
export function ValueDisplay({ value, max, pend = 0 }: { value: number; max: number; pend?: number }) {
  const mode = useContext(DisplayModeCtx)
  if (mode === 'dots') {
    const filled = Math.min(value, max)
    const pendFilled = Math.min(value + pend, max)
    return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: 1, userSelect: 'none', lineHeight: 1 }}>
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} style={{ color: i < pendFilled ? (i >= filled ? 'var(--coral)' : 'var(--ink)') : 'var(--ink-mute)', fontSize: i < pendFilled ? 12 : 11 }}>
            {i < pendFilled ? '●' : '◌'}
          </span>
        ))}
      </span>
    )
  }
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, minWidth: 16, textAlign: 'right' }}>
      {value}
    </span>
  )
}

// ── StatRow ────────────────────────────────────────────────────────
export function StatRow({ entries }: { entries: StatEntry[] }) {
  return (
    <div className={styles.statRow}>
      {(entries as StatEntry[]).map(([k, v, onEdit]) => (
        <div key={k} className={styles.statCell}>
          <span className={styles.statKey}>{k}</span>
          {onEdit ? (
            <div style={{ display:'flex', alignItems:'center', gap:3 }}>
              <button onClick={() => (onEdit as (v: number) => void)(
                  parseInt(String(v).split('/')[0]) - 1
                )}
                style={{ background:'transparent', border:'none', cursor:'pointer',
                  fontFamily:'var(--font-mono)', fontSize:15, color:'var(--ink-mute)', padding:'0 1px', lineHeight:1 }}>−</button>
              <span className={styles.statVal}>{v}</span>
              <button onClick={() => (onEdit as (v: number) => void)(
                  parseInt(String(v).split('/')[0]) + 1
                )}
                style={{ background:'transparent', border:'none', cursor:'pointer',
                  fontFamily:'var(--font-mono)', fontSize:15, color:'var(--ink-mute)', padding:'0 1px', lineHeight:1 }}>+</button>
            </div>
          ) : (
            <span className={styles.statVal}>{v}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// Chip "máx" exibido quando um atributo/skill atinge o limite (5).
const MAX_CHIP_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--ink-mute)',
  border: '1px solid var(--line)', borderRadius: 999, padding: '0 6px', lineHeight: '16px',
}

// ── AttributeGrid editável com staging ────────────────────────────
export function AttributeGrid({ attrs, editable, pending, onPend, onUnpend, onFreeEdit, freeMode: freeModeExternal, onFreeModeChange }: {
  attrs: Attributes | Record<string, number>
  editable?: boolean
  pending?: Record<string, number>
  onPend?: (k: AttributeKey) => void
  onUnpend?: (k: AttributeKey) => void
  onFreeEdit?: (k: AttributeKey, delta: 1 | -1) => void
  freeMode?: boolean
  onFreeModeChange?: (v: boolean) => void
}) {
  const [freeModeInternal, setFreeModeInternal] = useState(false)
  const freeMode = freeModeExternal !== undefined ? freeModeExternal : freeModeInternal
  const setFreeMode = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(freeMode) : v
    setFreeModeInternal(next)
    onFreeModeChange?.(next)
  }
  const { settings } = useSettings()
  const attrView = settings.attrView
  const displayMode = useContext(DisplayModeCtx)

  const attrCell = (k: AttributeKey) => {
    const base = attrs[k] ?? 0
    const pend = pending?.[k] ?? 0
    const displayed = base + pend
    return (
      <div key={k} className={styles.attrRow}>
        <span className={styles.attrName}>{k}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <ValueDisplay value={base} max={5} pend={pend} />
          {displayMode === 'number' && pend > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', fontWeight: 700 }}>
              +{pend}
            </span>
          )}
          {editable && freeMode && (
            <>
              <button onClick={() => onFreeEdit?.(k, 1)} className={styles.attrFreeBtn} title={`${k} +1 (sem XP)`} disabled={base >= 5}>+</button>
              <button onClick={() => onFreeEdit?.(k, -1)} className={styles.attrFreeBtn} title={`${k} -1 (sem XP)`} disabled={base <= 1}>−</button>
            </>
          )}
          {editable && !freeMode && displayed < 5 && (
            <button onClick={() => onPend?.(k)} className={styles.pendBtn}
              title={`+1 ${k} (custa ${xpCostAttribute(displayed + 1)} XP)`}>+</button>
          )}
          {editable && !freeMode && displayed >= 5 && (
            <span style={MAX_CHIP_STYLE} title="Limite máximo atingido">máx</span>
          )}
          {editable && !freeMode && pend > 0 && (
            <button onClick={() => onUnpend?.(k)} className={styles.pendBtnUndo} title="Desfazer">−</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {editable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setFreeMode(p => !p)}
            className={freeMode ? styles.pendBtn : styles.pendBtnUndo}
            style={{ width: 'auto', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
            title="Editar atributos diretamente, sem custo de XP (para corrigir erros ou testes)">
            {freeMode ? '✓ Modo livre ativo' : 'Modo livre (sem XP)'}
          </button>
          {freeMode && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em' }}>edição direta · sem custo</span>}
        </div>
      )}
      {attrView === 'classica' ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {ATTRIBUTE_GROUPS.map((g, gi) => (
            <div key={g.label} style={{
              display: 'grid', gridTemplateColumns: '76px repeat(3, 1fr)',
              borderBottom: gi < ATTRIBUTE_GROUPS.length - 1 ? '1px solid var(--line-soft)' : undefined,
              padding: '8px 0',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--ink-mute)',
                display: 'flex', alignItems: 'center', paddingRight: 8 }}>
                {g.label}
              </div>
              {g.keys.map(k => {
                const base = attrs[k] ?? 0
                const pend = pending?.[k] ?? 0
                const displayed = base + pend
                return (
                  <div key={k} style={{ padding: '0 6px' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12,
                      color: 'var(--ink)', marginBottom: 4 }}>{k}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <ValueDisplay value={base} max={5} pend={pend} />
                      {displayMode === 'number' && pend > 0 && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', fontWeight: 700 }}>+{pend}</span>
                      )}
                      {editable && freeMode && (
                        <>
                          <button onClick={() => onFreeEdit?.(k, 1)} className={styles.attrFreeBtn} title={`${k} +1`} disabled={base >= 5}>+</button>
                          <button onClick={() => onFreeEdit?.(k, -1)} className={styles.attrFreeBtn} title={`${k} -1`} disabled={base <= 1}>−</button>
                        </>
                      )}
                      {editable && !freeMode && displayed < 5 && (
                        <button onClick={() => onPend?.(k)} className={styles.pendBtn}
                          title={`+1 ${k} (custa ${xpCostAttribute(displayed + 1)} XP)`}>+</button>
                      )}
                      {editable && !freeMode && displayed >= 5 && (
                        <span style={MAX_CHIP_STYLE} title="Limite máximo atingido">máx</span>
                      )}
                      {editable && !freeMode && pend > 0 && (
                        <button onClick={() => onUnpend?.(k)} className={styles.pendBtnUndo} title="Desfazer">−</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.attrGrid}>
          {ATTRIBUTE_GROUPS.map(g => (
            <div key={g.label} className={styles.attrGroup}>
              <div className={styles.attrGroupLabel}>{g.label}</div>
              {g.keys.map(k => attrCell(k))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SkillGrid editável com staging ────────────────────────────────
export function SkillGrid({ skills, editable, freeMode, pending, onPend, onUnpend, onFreeEdit }: {
  skills: SkillSet
  editable?: boolean
  freeMode?: boolean
  pending?: Record<string, number>
  onPend?: (cat: keyof SkillSet, name: string) => void
  onUnpend?: (cat: keyof SkillSet, name: string) => void
  onFreeEdit?: (cat: keyof SkillSet, name: string, delta: number) => void
}) {
  const displayMode = useContext(DisplayModeCtx)
  return (
    <div className={styles.skillsWrap}>
      {(Object.entries(skills) as [keyof SkillSet, Record<string, number>][]).map(([cat, sk]) => (
        <div key={cat} className={styles.skillBlock}>
          <h4 className={styles.skillCat}>{cat}</h4>
          <div className={styles.skillGrid}>
            {Object.entries(sk).map(([name, val]) => {
              const pend = pending?.[name] ?? 0
              const displayed = val + pend
              return (
                <div key={name} className={styles.skillRow}>
                  <span>{name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ValueDisplay value={val} max={5} pend={pend} />
                    {displayMode === 'number' && pend > 0 && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', fontWeight: 700 }}>+{pend}</span>
                    )}
                    {editable && freeMode && (
                      <>
                        <button onClick={() => onFreeEdit?.(cat, name, 1)} className={styles.attrFreeBtn} disabled={val >= 5}>+</button>
                        <button onClick={() => onFreeEdit?.(cat, name, -1)} className={styles.attrFreeBtn} disabled={val <= 0}>−</button>
                      </>
                    )}
                    {editable && !freeMode && displayed < 5 && (
                      <button onClick={() => onPend?.(cat, name)} className={styles.pendBtn}
                        title={`+1 ${name} (custa ${xpCostSkill(displayed + 1)} XP)`}>+</button>
                    )}
                    {editable && !freeMode && displayed >= 5 && (
                      <span style={MAX_CHIP_STYLE} title="Limite máximo atingido">máx</span>
                    )}
                    {editable && !freeMode && pend > 0 && (
                      <button onClick={() => onUnpend?.(cat, name)} className={styles.pendBtnUndo} title="Desfazer">−</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Weakness editable ─────────────────────────────────────────────
export function WeaknessBox({ weakness, editable, onChange }: {
  weakness: Record<string, string>
  editable?: boolean
  onChange?: (w: Record<string, string>) => void
}) {
  const [addKey, setAddKey] = useState('')
  const [addVal, setAddVal] = useState('')
  if (!editable && !Object.keys(weakness).length) return null
  return (
    <div className={styles.weaknessBox}>
      {Object.entries(weakness).map(([k, v]) => (
        <div key={k} className={styles.weaknessRow}>
          {editable ? (
            <>
              <input value={k} readOnly className={styles.weaknessKeyInput} style={{ width: 140 }} />
              <input value={v}
                onChange={e => onChange?.({ ...weakness, [k]: e.target.value })}
                className={styles.weaknessValInput} />
              <button onClick={() => { const w = { ...weakness }; delete w[k]; onChange?.(w) }}
                className={styles.cardDel} style={{ position: 'static', opacity: 1, marginLeft: 4 }}>×</button>
            </>
          ) : (
            <>
              <span className={styles.weaknessKey}>{k}</span>
              <span className={styles.weaknessVal}>{v}</span>
            </>
          )}
        </div>
      ))}
      {editable && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={addKey} onChange={e => setAddKey(e.target.value)} placeholder="ex: Letal (+2)"
            className={styles.formInput} style={{ flex: '0 0 160px', fontSize: 12 }} />
          <input value={addVal} onChange={e => setAddVal(e.target.value)} placeholder="ex: Vacina"
            className={styles.formInput} style={{ flex: 1, fontSize: 12 }} />
          <button onClick={() => {
            if (!addKey.trim()) return
            onChange?.({ ...weakness, [addKey.trim()]: addVal.trim() })
            setAddKey(''); setAddVal('')
          }} className={styles.btnGhost} style={{ fontSize: 12, padding: '5px 10px' }}>+ Add</button>
        </div>
      )}
    </div>
  )
}

// ── AffinityGrid editable ─────────────────────────────────────────
export function AffinityGrid({ affinity, editable, freeMode, onChange, pending, onPend, onUnpend }: {
  affinity: Partial<Record<string, number>>
  editable?: boolean
  freeMode?: boolean
  onChange?: (a: Partial<Record<string, number>>) => void
  pending?: Record<string, number>
  onPend?: (k: string) => void
  onUnpend?: (k: string) => void
}) {
  const mode = useContext(DisplayModeCtx)
  const xpMode = !!(pending && onPend && onUnpend)
  return (
    <div className={styles.affinityGrid}>
      {(() => {
        const renderCell = (k: string) => {
          const base = affinity[k] ?? 0
          const pend = pending?.[k] ?? 0
          const displayed = base + pend
          return (
          <div key={k} className={styles.affinityRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
              <span className={styles.affinityIcon}>
                {AFFINITY_ICONS[k]
                  ? <img src={AFFINITY_ICONS[k]} alt={k} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 1 }} />
                  : <span style={{ fontSize: 12 }}>{k}</span>
                }
                <span className={styles.affinityTooltip}>{k}</span>
              </span>
              {mode === 'number' && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <ValueDisplay value={base} max={10} pend={pend} />
              {mode === 'number' && pend > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)', fontWeight: 700 }}>+{pend}</span>
              )}
              {(editable || freeMode) && xpMode && (
                <>
                  {displayed < 10 && (
                    <button onClick={() => onPend!(k)} className={styles.pendBtn}
                      title={`+1 ${k} (custa ${xpCostSkill(displayed + 1)} XP)`}>+</button>
                  )}
                  {displayed >= 10 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-mute)', padding: '2px 6px', border: '1px solid var(--line-soft)', borderRadius: 4 }}>máx</span>
                  )}
                  {pend > 0 && (
                    <button onClick={() => onUnpend!(k)} className={styles.pendBtnUndo} title="Desfazer">−</button>
                  )}
                </>
              )}
              {(editable || freeMode) && !xpMode && (
                <>
                  <button onClick={() => onChange?.({ ...affinity, [k]: Math.min(10, (affinity[k] ?? 0) + 1) })}
                    className={freeMode ? styles.attrFreeBtn : styles.pendBtn}>+</button>
                  <button onClick={() => onChange?.({ ...affinity, [k]: Math.max(0, (affinity[k] ?? 0) - 1) })}
                    className={freeMode ? styles.attrFreeBtn : styles.pendBtnUndo}>−</button>
                </>
              )}
            </div>
          </div>
          )
        }

        // Grid 4 colunas: 14 items + 2 células vazias na linha 3
        const ALL = AFFINITY_KEYS
        const cells: (string | null)[] = [
          ...ALL.slice(0, 10),
          null, null,
          ...ALL.slice(10),
        ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 16px' }}>
            {cells.map((k, i) =>
              k ? renderCell(k) : <div key={`e-${i}`} />
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ── KwTooltip ─────────────────────────────────────────────────────
// Tooltip posicionado via JS para nunca sair da tela.
// Se `navKey` for fornecido, clicar leva à regra correspondente no Sistema.
function KwTooltip({ label, tip, navKey }: { label: string; tip: string; navKey?: string }) {
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)
  const navigate = useNavigate()
  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tipW = 260
    const margin = 12
    let left = rect.left + rect.width / 2 - tipW / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin))
    const top = rect.top - 8
    setPos({ top, left })
  }
  const handleClick = navKey
    ? (e: React.MouseEvent) => { e.stopPropagation(); navigate(`/sistema?kw=${encodeURIComponent(navKey)}`) }
    : undefined
  return (
    <span className="kwTip" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      <span className="kwTipLabel" onClick={handleClick}
        style={navKey ? { cursor: 'pointer' } : undefined}
        title={navKey ? 'Ver regra no Sistema' : undefined}>{label}</span>
      {pos && (
        <span className="kwTipBox" style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          transform: 'translateY(-100%)',
        }}>{tip}{navKey ? <span style={{ display:'block', marginTop:6, opacity:0.7, fontSize:10 }}>clique para ver no Sistema →</span> : null}</span>
      )}
    </span>
  )
}

// ── EffectText ───────────────────────────────────────────────────
// Parser que transforma [Keyword] em spans com tooltip
export function EffectText({ text }: { text: string }) {
  const tips = useContext(KeywordTipsCtx)
  const parts = text.split(/(\[[^\]]+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          const key = part.slice(1, -1)
          const tip = tips[key] ?? KEYWORD_TIPS[key]
          if (tip) return <KwTooltip key={i} label={part} tip={tip} navKey={ruleSlug(key)} />
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </>
  )
}

// ── SkillCard ───────────────────────────────────────────────────
export function SkillCard({ s, editable, onDelete, onChange, onToggle, toggleActive, toggleX, onSpawnToken }: {
  s: TamerSkill | DigimonSkill
  editable?: boolean
  onDelete?: () => void
  onChange?: (s: TamerSkill | DigimonSkill) => void
  onToggle?: (active: boolean, x?: number) => void
  toggleActive?: boolean
  toggleX?: number
  onSpawnToken?: (token: TokenSpawn) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s)
  const isPassive = s.type === 'passive'
  const isTamer = 'target' in s
  const hasToggle = isPassive && !!s.toggleBonus
  const ds = s as DigimonSkill
  const ts = s as TamerSkill

  if (editing) {
    const dd = draft as DigimonSkill
    const dt = draft as TamerSkill
    return (
      <div className={`${styles.skillCard} ${styles.editing}`}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value as any }))} className={styles.formInput} style={{ flex: '0 0 auto' }}>
            <option value="action">Ação</option>
            <option value="reaction">Reação</option>
            <option value="passive">Passiva</option>
          </select>
          <input value={draft.keyword} onChange={e => setDraft(d => ({ ...d, keyword: e.target.value }))} placeholder="Palavra-chave" className={styles.formInput} style={{ flex: 1 }} />
        </div>
        <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Nome *" className={styles.formInput} style={{ marginBottom: 6, width: '100%' }} />
        {isTamer ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <input value={dt.target ?? ''} onChange={e => setDraft(d => ({ ...d, target: e.target.value }))} placeholder="Alvo" className={styles.formInput} />
              <input value={dt.custo ?? ''} onChange={e => setDraft(d => ({ ...d, custo: e.target.value }))} placeholder="Custo (ex: -2 Memory, Cooldown 3)" className={styles.formInput} />
            </div>
            <input value={dt.dados ?? ''} onChange={e => setDraft(d => ({ ...d, dados: e.target.value }))} placeholder="Dados (ex: Int + Folclore)" className={styles.formInput} style={{ marginBottom: 6, width: '100%' }} />
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
            <input value={dd.alcance ?? ''} onChange={e => setDraft(d => ({ ...d, alcance: e.target.value }))} placeholder="Alcance" className={styles.formInput} />
            <input value={dd.custo ?? ''} onChange={e => setDraft(d => ({ ...d, custo: e.target.value }))} placeholder="Custo (ex: -2 Memory, Cooldown 3)" className={styles.formInput} />
            <input value={dd.dados ?? ''} onChange={e => setDraft(d => ({ ...d, dados: e.target.value }))} placeholder="Dados" className={styles.formInput} />
          </div>
        )}
        <textarea value={draft.effect} onChange={e => setDraft(d => ({ ...d, effect: e.target.value }))} placeholder="Efeito" className={styles.formInput} rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={styles.btnSolid} style={{ fontSize: 12 }} onClick={() => { onChange?.(draft); setEditing(false) }}>Salvar</button>
          <button className={styles.btnGhost} style={{ fontSize: 12 }} onClick={() => { setDraft(s); setEditing(false) }}>Cancelar</button>
        </div>
      </div>
    )
  }

  // Linha de rolagem
  const dadosLine = isTamer
    ? [ts.target && `Alvo: ${ts.target}`, ts.custo && `Custo: ${ts.custo}`, ts.dados && `Dados: ${ts.dados}`].filter(Boolean).join(' · ')
    : [ds.alcance, ds.custo !== undefined && ds.custo !== '' && `Custo: ${ds.custo}`, ds.dados && `Dados: ${ds.dados}`].filter(Boolean).join(' · ')

  const isActive = toggleActive ?? false
  const xVal    = toggleX ?? 0

  return (
    <div className={`${styles.skillCard} ${isPassive ? styles.passive : ''} ${isActive ? styles.passiveActive : ''}`}>
      {/* Botões de ação — topo direito, sem sobreposição */}
      {editable && (
        <div className={styles.cardActions}>
          {onChange && <button className={styles.cardEdit} onClick={() => setEditing(true)} title="Editar">✎</button>}
          {onDelete && <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', paddingRight: editable ? 80 : 0 }}>
        <span className={`${styles.cardTag} ${isPassive ? styles.tagPassive : s.type === 'reaction' ? styles.tagReaction : ''}`}>
          {isPassive ? 'Passiva' : s.type === 'reaction' ? 'Reação' : 'Ação'}
        </span>
        {s.keyword && <span className={styles.cardKeyword}>[{s.keyword}]</span>}
      </div>

      <h5 className={styles.cardTitle}>{s.title}</h5>

      {dadosLine && <div className={styles.cardDados}>{dadosLine}</div>}

      {s.effect && s.effect !== '—' && <p className={styles.cardEffect}><EffectText text={s.effect} /></p>}

      {/* Toggle de passiva com bônus */}
      {hasToggle && onToggle && (
        <div className={styles.passiveToggleRow}>
          <button
            className={`${styles.passiveToggleBtn} ${isActive ? styles.passiveToggleOn : ''}`}
            onClick={() => onToggle(!isActive, xVal)}
            title={isActive ? 'Desativar' : 'Ativar'}
          >
            {isActive ? '● Ativa' : '○ Inativa'}
          </button>
          {/* Selector de X para skills com bônus variável */}
          {isActive && s.toggleBonus?.xBonus && (
            <div className={styles.passiveXRow}>
              <span className={styles.passiveXLabel}>{s.toggleBonus.xBonus.label}:</span>
              {Array.from({ length: s.toggleBonus.xBonus.xMax + 1 }, (_, i) => i).map(i => (
                <button
                  key={i}
                  className={`${styles.passiveXBtn} ${xVal === i ? styles.passiveXBtnActive : ''}`}
                  onClick={() => onToggle(true, i)}
                >{i}</button>
              ))}
            </div>
          )}
          {/* Resumo dos bônus ativos */}
          {isActive && s.toggleBonus?.statusBonus && (
            <div className={styles.passiveBonusSummary}>
              {Object.entries(s.toggleBonus.statusBonus).map(([k, v]) => {
                const val = (s.toggleBonus?.xBonus ? xVal : 1) * (v ?? 0)
                return val !== 0 ? (
                  <span key={k} className={styles.passiveBonusChip}>
                    {k} {val > 0 ? `+${val}` : val}
                  </span>
                ) : null
              })}
            </div>
          )}
        </div>
      )}

      {/* Botões de invocar token no palco */}
      {onSpawnToken && s.effect && parseTokenSpawns(s.effect).map((tk, i) => (
        <button key={i} onClick={() => onSpawnToken(tk)}
          style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', background: 'transparent',
            border: '1px solid var(--teal)', borderRadius: 6,
            padding: '3px 10px', cursor: 'pointer', color: 'var(--teal)',
            transition: 'all 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal)'; e.currentTarget.style.color = '#f6f2e9' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--teal)' }}>
          ⊕ Invocar {tk.qty > 1 ? `${tk.qty}× ` : ''}{tk.name}{tk.level ? ` (${tk.level})` : ''} no Palco
        </button>
      ))}
    </div>
  )
}

// ── Add Skill Form ─────────────────────────────────────────────────
const PALCO_STATUS_KEYS = ['Defesa','Deslocamento','Iniciativa','Armadura','HP','SecurityAttack'] as const
const PALCO_COND_COLORS = ['coral','orange','blue','purple','teal','green','gold','indigo'] as const

function ConditionBuilder({ label, conditions, onChange }: {
  label: string
  conditions: PalcoCondition[]
  onChange: (c: PalcoCondition[]) => void
}) {
  const add = () => onChange([...conditions, { label: '', filled: 1, max: 3, color: 'coral' }])
  const remove = (i: number) => onChange(conditions.filter((_,j) => j !== i))
  const update = (i: number, patch: Partial<PalcoCondition>) =>
    onChange(conditions.map((c,j) => j === i ? { ...c, ...patch } : c))

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
          textTransform:'uppercase', color:'var(--ink-mute)', flex:1 }}>{label}</span>
        <button type="button" onClick={add}
          style={{ fontFamily:'var(--font-mono)', fontSize:10, background:'transparent',
            border:'1px solid var(--line)', borderRadius:999, padding:'2px 8px',
            cursor:'pointer', color:'var(--ink-mute)' }}>+ condição</button>
      </div>
      {conditions.map((c, i) => (
        <div key={i} style={{ display:'flex', gap:6, marginBottom:4, flexWrap:'wrap', alignItems:'center' }}>
          <input value={c.label} onChange={e => update(i, { label: e.target.value })}
            placeholder="Blocker, Burn..." className={styles.formInput} style={{ flex:2, minWidth:80 }} />
          <input type="number" min={1} max={20} value={c.filled}
            onChange={e => update(i, { filled: parseInt(e.target.value)||1 })}
            className={styles.formInput} style={{ width:44 }} title="Cargas iniciais" />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)' }}>/</span>
          <input type="number" min={1} max={20} value={c.max}
            onChange={e => update(i, { max: parseInt(e.target.value)||3 })}
            className={styles.formInput} style={{ width:44 }} title="Máximo de cargas" />
          <select value={c.color} onChange={e => update(i, { color: e.target.value })}
            className={styles.formInput} style={{ flex:1, minWidth:70 }}>
            {PALCO_COND_COLORS.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
          <button type="button" onClick={() => remove(i)}
            style={{ background:'transparent', border:'none', cursor:'pointer',
              color:'var(--coral)', fontFamily:'var(--font-mono)', fontSize:14 }}>×</button>
        </div>
      ))}
    </div>
  )
}

export function AddSkillForm({ isTamer, onAdd, onCancel }: {
  isTamer: boolean; onAdd: (s: TamerSkill | DigimonSkill) => void; onCancel: () => void
}) {
  const [type, setType]       = useState<'action' | 'reaction' | 'passive'>('action')
  const [keyword, setKeyword] = useState('')
  const [title, setTitle]     = useState('')
  const [target, setTarget]   = useState('')
  const [cost, setCost]       = useState('')
  const [dados, setDados]     = useState('')
  const [alcance, setAlcance] = useState('')
  const [effect, setEffect]   = useState('')

  // Toggle no Palco
  const [hasPalcoToggle, setHasPalcoToggle] = useState(false)
  const [palcoLabel, setPalcoLabel]         = useState('')
  const [durationRounds, setDurationRounds] = useState('')
  // statusBonus
  const [statusBonusKeys, setStatusBonusKeys] = useState<string[]>([])
  const [statusBonusVals, setStatusBonusVals] = useState<Record<string,string>>({})
  // xBonus
  const [hasXBonus, setHasXBonus]   = useState(false)
  const [xMax, setXMax]             = useState('3')
  const [xLabel, setXLabel]         = useState('X (Memory gasto)')
  // condições
  const [selfConds, setSelfConds]   = useState<PalcoCondition[]>([])
  const [targetConds, setTargetConds] = useState<PalcoCondition[]>([])
  // memória
  const [memoryDelta, setMemoryDelta] = useState('')

  const toggleStatusKey = (k: string) =>
    setStatusBonusKeys(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])

  const buildToggleBonus = (): PassiveToggleBonus | undefined => {
    if (!hasPalcoToggle) return undefined
    const sb: Record<string,number> = {}
    statusBonusKeys.forEach(k => { const v = parseInt(statusBonusVals[k]); if (!isNaN(v) && v !== 0) sb[k] = v })
    return {
      ...(Object.keys(sb).length ? { statusBonus: sb as any } : {}),
      ...(hasXBonus ? { xBonus: { xMax: parseInt(xMax)||3, label: xLabel } } : {}),
      ...(selfConds.length   ? { selfConditions:   selfConds }   : {}),
      ...(targetConds.length ? { targetConditions: targetConds } : {}),
      ...(memoryDelta && !isNaN(parseInt(memoryDelta)) ? { memoryDelta: parseInt(memoryDelta) } : {}),
      ...(palcoLabel.trim() ? { palcoLabel: palcoLabel.trim() } : {}),
      ...(durationRounds && !isNaN(parseInt(durationRounds)) ? { durationRounds: parseInt(durationRounds) } : {}),
    }
  }

  const handleAdd = () => {
    if (!title.trim()) return
    const toggleBonus = buildToggleBonus()
    if (isTamer) onAdd({ type, keyword, title, target: target||undefined, custo: cost||undefined, dados: dados||undefined, effect, ...(toggleBonus ? { toggleBonus } : {}) } as TamerSkill)
    else         onAdd({ type, keyword, title, alcance: alcance||undefined, custo: cost||undefined, dados: dados||undefined, effect, ...(toggleBonus ? { toggleBonus } : {}) } as DigimonSkill)
  }

  return (
    <div className={styles.addSkillForm}>
      {/* Linha 1: tipo + keyword */}
      <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
        <select value={type} onChange={e => setType(e.target.value as any)} className={styles.formInput} style={{ flex:'0 0 auto' }}>
          <option value="action">Ação</option>
          <option value="reaction">Reação</option>
          <option value="passive">Passiva</option>
        </select>
        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Palavra-chave" className={styles.formInput} style={{ flex:1 }} />
      </div>

      {/* Nome */}
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome *" className={styles.formInput} style={{ marginBottom:6, width:'100%' }} />

      {/* Campos específicos por tipo de personagem */}
      {isTamer ? (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Alvo" className={styles.formInput} />
            <input value={cost} onChange={e => setCost(e.target.value)} placeholder="Custo (ex: -2 Memory)" className={styles.formInput} />
          </div>
          <input value={dados} onChange={e => setDados(e.target.value)} placeholder="Dados (ex: Int + Folclore)" className={styles.formInput} style={{ marginBottom:6, width:'100%' }} />
        </>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:6 }}>
          <input value={alcance} onChange={e => setAlcance(e.target.value)} placeholder="Alcance" className={styles.formInput} />
          <input value={cost} onChange={e => setCost(e.target.value)} placeholder="Custo" className={styles.formInput} />
          <input value={dados} onChange={e => setDados(e.target.value)} placeholder="Dados" className={styles.formInput} />
        </div>
      )}

      {/* Efeito */}
      <textarea value={effect} onChange={e => setEffect(e.target.value)} placeholder="Efeito" className={styles.formInput} rows={3} style={{ width:'100%', resize:'vertical', marginBottom:8 }} />

      {/* ── Toggle no Palco ── */}
      <div style={{ border:'1px solid var(--line-soft)', borderRadius:10, overflow:'hidden', marginBottom:8 }}>
        <button type="button"
          onClick={() => setHasPalcoToggle(p => !p)}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
            background: hasPalcoToggle ? 'var(--paper-deep)' : 'transparent',
            border:'none', cursor:'pointer', fontFamily:'var(--font-mono)',
            fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase',
            color: hasPalcoToggle ? 'var(--ink)' : 'var(--ink-mute)', textAlign:'left' }}>
          <span style={{ width:16, height:16, borderRadius:4, border:'1.5px solid var(--line)',
            background: hasPalcoToggle ? 'var(--teal)' : 'transparent', flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#f6f2e9', fontSize:11 }}>
            {hasPalcoToggle ? '✓' : ''}
          </span>
          Ativável no Palco
          <span style={{ fontFamily:'var(--font-body)', fontWeight:400, fontSize:11,
            color:'var(--ink-mute)', textTransform:'none', letterSpacing:0 }}>
            — botão aparece no chip durante combate
          </span>
        </button>

        {hasPalcoToggle && (
          <div style={{ padding:'14px 16px', borderTop:'1px solid var(--line-soft)', display:'flex', flexDirection:'column', gap:12 }}>

            {/* Label e duração */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:8 }}>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                  textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:4 }}>
                  Label do botão (opcional)
                </div>
                <input value={palcoLabel} onChange={e => setPalcoLabel(e.target.value)}
                  placeholder={`⊕ ${title || 'Nome da skill'}`} className={styles.formInput} />
              </div>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                  textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:4 }}>
                  Duração (rounds)
                </div>
                <input type="number" min={0} value={durationRounds} onChange={e => setDurationRounds(e.target.value)}
                  placeholder="—" className={styles.formInput} />
              </div>
            </div>

            {/* Bônus de status */}
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:8 }}>
                Bônus de status (no ativador)
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {PALCO_STATUS_KEYS.map(k => (
                  <button key={k} type="button" onClick={() => toggleStatusKey(k)}
                    style={{ padding:'3px 10px', borderRadius:999, cursor:'pointer',
                      fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.08em',
                      border:`1px solid ${statusBonusKeys.includes(k) ? 'var(--teal)' : 'var(--line)'}`,
                      background: statusBonusKeys.includes(k) ? 'var(--teal)' : 'transparent',
                      color: statusBonusKeys.includes(k) ? '#f6f2e9' : 'var(--ink-mute)' }}>
                    {k}
                  </button>
                ))}
              </div>
              {statusBonusKeys.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {statusBonusKeys.map(k => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-soft)' }}>{k}</span>
                      <span style={{ color:'var(--ink-mute)' }}>+</span>
                      <input type="number" value={statusBonusVals[k] ?? '1'}
                        onChange={e => setStatusBonusVals(p => ({ ...p, [k]: e.target.value }))}
                        className={styles.formInput} style={{ width:52 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* xBonus */}
            <div>
              <button type="button" onClick={() => setHasXBonus(p => !p)}
                style={{ display:'flex', alignItems:'center', gap:8, background:'transparent',
                  border:'none', cursor:'pointer', fontFamily:'var(--font-mono)',
                  fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase',
                  color: hasXBonus ? 'var(--ink)' : 'var(--ink-mute)', padding:0, marginBottom: hasXBonus ? 8 : 0 }}>
                <span style={{ width:14, height:14, borderRadius:3, border:'1.5px solid var(--line)',
                  background: hasXBonus ? 'var(--teal)' : 'transparent', flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#f6f2e9', fontSize:10 }}>{hasXBonus ? '✓' : ''}</span>
                Valor variável (X)
              </button>
              {hasXBonus && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)', marginBottom:3 }}>X máximo</div>
                    <input type="number" min={1} max={10} value={xMax} onChange={e => setXMax(e.target.value)} className={styles.formInput} />
                  </div>
                  <div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)', marginBottom:3 }}>Label do X</div>
                    <input value={xLabel} onChange={e => setXLabel(e.target.value)} placeholder="X (Memory gasto)" className={styles.formInput} />
                  </div>
                </div>
              )}
            </div>

            {/* Memória */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em',
                textTransform:'uppercase', color:'var(--ink-mute)', minWidth:80 }}>
                Memória
              </div>
              <input type="number" value={memoryDelta} onChange={e => setMemoryDelta(e.target.value)}
                placeholder="0" className={styles.formInput} style={{ width:64 }}
                title="Ajuste de Memory ao ativar (+N ou −N)" />
              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)' }}>
                {memoryDelta && parseInt(memoryDelta) !== 0
                  ? (parseInt(memoryDelta) > 0 ? `+${memoryDelta} Memory ao ativador` : `${memoryDelta} Memory ao ativador`)
                  : 'sem ajuste de Memory'}
              </span>
            </div>

            {/* Condições no ativador */}
            <ConditionBuilder
              label="Condições no ativador"
              conditions={selfConds}
              onChange={setSelfConds} />

            {/* Condições no alvo */}
            <ConditionBuilder
              label="Condições em alvo (pede seleção no palco)"
              conditions={targetConds}
              onChange={setTargetConds} />

            {/* Preview */}
            {(statusBonusKeys.length > 0 || selfConds.length > 0 || targetConds.length > 0 || memoryDelta) && (
              <div style={{ padding:'10px 12px', background:'rgba(74,155,155,0.08)',
                border:'1px solid rgba(74,155,155,0.3)', borderRadius:8,
                fontFamily:'var(--font-mono)', fontSize:11, color:'var(--teal)' }}>
                <div style={{ marginBottom:4, fontWeight:700 }}>Preview do botão:</div>
                <div>⊕ {palcoLabel || title || 'Nome da skill'}</div>
                {statusBonusKeys.length > 0 && (
                  <div style={{ marginTop:4, color:'var(--ink-soft)' }}>
                    {statusBonusKeys.map(k => `${k} +${statusBonusVals[k]??1}`).join(' · ')}
                    {hasXBonus ? ` × X (0–${xMax})` : ''}
                  </div>
                )}
                {selfConds.length > 0 && (
                  <div style={{ marginTop:2, color:'var(--ink-soft)' }}>
                    Condições: {selfConds.map(c => `${c.label} (${c.filled}/${c.max})`).join(', ')}
                  </div>
                )}
                {targetConds.length > 0 && (
                  <div style={{ marginTop:2, color:'var(--ink-soft)' }}>
                    No alvo: {targetConds.map(c => `${c.label} (${c.filled}/${c.max})`).join(', ')}
                  </div>
                )}
                {memoryDelta && parseInt(memoryDelta) !== 0 && (
                  <div style={{ marginTop:2, color:'var(--ink-soft)' }}>
                    Memory {parseInt(memoryDelta) > 0 ? `+${memoryDelta}` : memoryDelta}
                  </div>
                )}
                {durationRounds && parseInt(durationRounds) > 0 && (
                  <div style={{ marginTop:2, color:'var(--ink-soft)' }}>
                    Duração: {durationRounds} rounds
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button className={styles.btnSolid} onClick={handleAdd}>Adicionar</button>
        <button className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Image upload zone ──────────────────────────────────────────────
export function ImageUploadZone({ image, onUpload, size = 80 }: { image: string | null; onUpload: (d: string) => void; size?: number }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div style={{ width:size, height:size, borderRadius:14, overflow:'hidden', cursor:'pointer', position:'relative', flexShrink:0 }}
      onClick={() => ref.current?.click()} title="Trocar imagem">
      <GrainFill color="sage" image={image} />
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', opacity:0, transition:'opacity 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>
        <span style={{ background:'rgba(255,255,255,0.85)', borderRadius:6, padding:'3px 8px', fontSize:11, fontFamily:'var(--font-mono)', color:'var(--ink)' }}>trocar</span>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
        const f = e.target.files?.[0]; if (!f) return
        const r = new FileReader(); r.onload = ev => onUpload(ev.target?.result as string); r.readAsDataURL(f)
      }} />
    </div>
  )
}

// ── Section title ──────────────────────────────────────────────────
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={styles.sectionTitle}>
      <span>◼</span><span>{children}</span>
      {action && <span style={{ marginLeft:'auto' }}>{action}</span>}
      <span style={{ flex: action ? 0 : 1, height:1, background:'var(--line)', alignSelf:'center', marginLeft:8 }} />
    </div>
  )
}

// ── XP Confirmation Bar ────────────────────────────────────────────
export function XpConfirmBar({ cost, xpAvail, onConfirm, onCancel }: {
  cost: number; xpAvail: number; onConfirm: () => void; onCancel: () => void
}) {
  const ok = cost <= xpAvail
  return (
    <div className={styles.xpConfirmBar}>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>
        {ok
          ? <>Custo: <b style={{ color:'var(--coral)' }}>{cost} XP</b> · Restará: <b>{xpAvail - cost} XP</b></>
          : <span style={{ color:'var(--coral)' }}>XP insuficiente ({cost} necessário, {xpAvail} disponível)</span>
        }
      </span>
      <div style={{ display:'flex', gap:8 }}>
        <button className={styles.btnSolid} style={{ fontSize:12 }} disabled={!ok} onClick={onConfirm}>✓ Confirmar</button>
        <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={onCancel}>Cancelar tudo</button>
      </div>
    </div>
  )
}
