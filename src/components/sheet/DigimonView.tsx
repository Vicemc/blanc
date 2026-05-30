import React, { useState, useMemo } from 'react'
import type {
  Tamer, DigimonLine, DigimonStage, DigimonStageStatus, Bug, Sign,
  AttributeKey, TamerSkill, DigimonSkill,
} from '../../types'
import {
  ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS, AFFINITY_KEYS, PORTRAIT_LIST, BUG_COLORS,
} from '../../types'
import {
  calcDigimonDerived, makeDefaultAttributes, DIGIMON_DEFAULT_IMAGES,
} from '../../data/store'
import { GrainFill } from '../GrainFill'
import { Toast } from '../Toast'
import styles from '../Sheet.module.css'
import {
  StatRow, AttributeGrid, WeaknessBox, AffinityGrid, SkillCard, AddSkillForm,
  SectionTitle, XpConfirmBar, inp,
} from './shared/components'
import { pendingCost } from './shared/utils'
import type { StatEntry } from './shared/types'

// ── Add Evolution Form ─────────────────────────────────────────────
function AddEvolutionForm({ onAdd, onCancel }: { onAdd: (s: DigimonStage) => void; onCancel: () => void }) {
  const [stageName, setStageName] = useState('')
  const [level, setLevel]     = useState('Adult (Lvl 4)')
  const [type, setType]       = useState('')
  const [cost, setCost]       = useState('−2 Memory')
  const [portrait, setPortrait] = useState<DigimonStage['portrait']>('indigo')
  const [status, setStatus] = useState<DigimonStageStatus>({ HP: 0, Deslocamento: 0, Iniciativa: 0, Defesa: 0, Armadura: 0 })
  const [attrs, setAttrs] = useState(makeDefaultAttributes())
  const handleAdd = () => {
    if (!stageName.trim()) return
    onAdd({ stageName, level, type, cost, portrait, size: 3, speed: 5, status, attributes: attrs, weakness: {}, affinity: {}, skills: [], locked: false })
  }
  return (
    <div className={styles.addSkillForm}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 }}>Registrar Nova Evolução</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {[['Nome *', stageName, setStageName, 'ex: Witchmon'], ['Nível', level, setLevel, 'ex: Adult (Lvl 4)'], ['Tipo', type, setType, 'ex: Demon Man'], ['Custo', cost, setCost, 'ex: −2 Memory']] .map(([lbl, val, setter, ph]: any) => (
          <div key={lbl}><label className={styles.formLabel}>{lbl}</label><input value={val} onChange={(e:any)=>setter(e.target.value)} className={styles.formInput} placeholder={ph}/></div>
        ))}
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className={styles.formLabel}>Cor do retrato</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {PORTRAIT_LIST.map(p => (
            <div key={p} onClick={() => setPortrait(p)} style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', position: 'relative', outline: portrait === p ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }}>
              <GrainFill color={p}/>
            </div>
          ))}
        </div>
      </div>
      <label className={styles.formLabel} style={{ display: 'block', marginBottom: 6 }}>Status</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
        {(['HP','Deslocamento','Iniciativa','Defesa','Armadura'] as (keyof DigimonStageStatus)[]).map(k => (
          <div key={k}><label className={styles.formLabel} style={{ fontSize: 9 }}>{k}</label>
            <input type="number" min={0} value={status[k]} onChange={e => setStatus(p => ({ ...p, [k]: parseInt(e.target.value)||0 }))} className={styles.formInput} /></div>
        ))}
      </div>
      <label className={styles.formLabel} style={{ display: 'block', marginBottom: 6 }}>Atributos</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 14 }}>
        {ATTRIBUTE_KEYS.map(k => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--paper)', border:'1px solid var(--line-soft)', borderRadius:6, padding:'4px 8px' }}>
            <span style={{ fontSize:11, color:'var(--ink-soft)' }}>{k.slice(0,4)}</span>
            <input type="number" min={1} max={10} value={attrs[k]} onChange={e => setAttrs(p => ({ ...p, [k]: parseInt(e.target.value)||1 }))} style={{ width:38, border:'none', fontFamily:'var(--font-mono)', fontSize:13, textAlign:'right', background:'transparent' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className={styles.btnSolid} onClick={handleAdd}>Registrar</button>
        <button className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Digimon info editor ────────────────────────────────────────────
function DigiInfoEditor({ line, stageIdx, onSaveLine }: {
  line: DigimonLine; stageIdx: number; onSaveLine: (l: DigimonLine) => void
}) {
  const stage = line.stages[stageIdx]
  const [d, setD] = useState(stage)
  const [lineStr, setLineStr] = useState(line.line)
  const changed = JSON.stringify(d) !== JSON.stringify(stage) || lineStr !== line.line
  const save = () => onSaveLine({ ...line, line: lineStr, stages: line.stages.map((s,i) => i===stageIdx ? d : s) })
  return (
    <div className={styles.infoEditor}>
      <div style={{ marginBottom: 10 }}>
        <label className={styles.formLabel}>Linha evolutiva (texto)</label>
        <input value={lineStr} onChange={e => setLineStr(e.target.value)}
          placeholder="??? ↔ Tinkermon (Child) / Armor ↔ Witchmon ↔ ??? ↔ ???"
          className={styles.formInput} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
        <div><label className={styles.formLabel}>Nome</label><input value={d.stageName} onChange={e => setD(st=>({...st,stageName:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Nível</label><input value={d.level} onChange={e => setD(st=>({...st,level:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Tipo</label><input value={d.type} onChange={e => setD(st=>({...st,type:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Custo</label><input value={d.cost} onChange={e => setD(st=>({...st,cost:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Size</label><input type="number" min={1} max={10} value={d.size} onChange={e=>setD(st=>({...st,size:parseInt(e.target.value)||1}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Speed</label><input type="number" min={1} max={20} value={d.speed} onChange={e=>setD(st=>({...st,speed:parseInt(e.target.value)||1}))} className={styles.formInput}/></div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label className={styles.formLabel}>Cor do retrato</label>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
          {PORTRAIT_LIST.map(p => (
            <div key={p} onClick={() => setD(st=>({...st,portrait:p}))}
              style={{ width:26, height:26, borderRadius:6, overflow:'hidden', cursor:'pointer', position:'relative',
                outline: d.portrait === p ? '2px solid var(--ink)' : 'none', outlineOffset:2 }}>
              <GrainFill color={p}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label className={styles.formLabel}>Atributos diretos</label>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5, marginTop:4 }}>
          {ATTRIBUTE_KEYS.map(k => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--paper)', border:'1px solid var(--line-soft)', borderRadius:6, padding:'4px 8px' }}>
              <span style={{ fontSize:11, color:'var(--ink-soft)' }}>{k.slice(0,4)}</span>
              <input type="number" min={1} max={10} value={d.attributes[k]}
                onChange={e => setD(st => ({ ...st, attributes: { ...st.attributes, [k]: parseInt(e.target.value)||1 } }))}
                style={{ width:38, border:'none', fontFamily:'var(--font-mono)', fontSize:13, textAlign:'right', background:'transparent' }} />
            </div>
          ))}
        </div>
      </div>
      {changed && (
        <div style={{ display:'flex', gap:8 }}>
          <button className={styles.btnSolid} style={{ fontSize:12 }} onClick={save}>Salvar</button>
          <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={() => setD(stage)}>Descartar</button>
        </div>
      )}
    </div>
  )
}

// ── Bug info editor ────────────────────────────────────────────────
function BugInfoEditor({ bug, onSave }: { bug: Bug; onSave: (b: Bug) => void }) {
  const [d, setD] = useState(bug)
  const changed = JSON.stringify(d) !== JSON.stringify(bug)
  return (
    <div className={styles.infoEditor}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div><label className={styles.formLabel}>Nome</label><input value={d.name} onChange={e=>setD(b=>({...b,name:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Classe</label><input value={d.class} onChange={e=>setD(b=>({...b,class:e.target.value}))} className={styles.formInput}/></div>
        <div><label className={styles.formLabel}>Cor</label>
          <select value={d.color} onChange={e=>setD(b=>({...b,color:e.target.value as Bug['color']}))} className={styles.formInput}>
            {BUG_COLORS.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className={styles.formLabel}>Lore</label><input value={d.lore} onChange={e=>setD(b=>({...b,lore:e.target.value}))} className={styles.formInput}/></div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label className={styles.formLabel}>Atributos</label>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5, marginTop:4 }}>
          {ATTRIBUTE_KEYS.map(k => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--paper)', border:'1px solid var(--line-soft)', borderRadius:6, padding:'4px 8px' }}>
              <span style={{ fontSize:11, color:'var(--ink-soft)' }}>{k.slice(0,4)}</span>
              <input type="number" min={1} max={10} value={d.attributes[k]}
                onChange={e => setD(b => ({ ...b, attributes: { ...b.attributes, [k]: parseInt(e.target.value)||1 } }))}
                style={{ width:38, border:'none', fontFamily:'var(--font-mono)', fontSize:13, textAlign:'right', background:'transparent' }} />
            </div>
          ))}
        </div>
      </div>
      {changed && (
        <div style={{ display:'flex', gap:8 }}>
          <button className={styles.btnSolid} style={{ fontSize:12 }} onClick={() => onSave(d)}>Salvar</button>
          <button className={styles.btnGhost} style={{ fontSize:12 }} onClick={() => setD(bug)}>Descartar</button>
        </div>
      )}
    </div>
  )
}

// ── StageDiff ──────────────────────────────────────────────────────
// Comparação de status e afinidades entre o estágio atual e o próximo revelado.
// Para digimons com tamer vinculado, usa o HP/Defesa/Iniciativa/Deslocamento derivados.
function StageDiff({ line, stageIdx, tamer }: { line: DigimonLine; stageIdx: number; tamer?: Tamer }) {
  const cur  = line.stages[stageIdx]
  const next = line.stages[stageIdx + 1]
  if (!cur || !next || next.locked) {
    return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)', padding: '8px 0' }}>
      ~ não há próximo estágio revelado para comparar ~
    </div>
  }

  const isDerived = !!tamer
  const tamerHP   = tamer ? tamer.status.HP.max : undefined
  const evBonusOf = (idx: number) => (idx > 1 ? idx - 1 : 0)

  const statusOf = (s: typeof cur, idx: number) => {
    const base = isDerived
      ? calcDigimonDerived(s.attributes, s.size, s.speed, evBonusOf(idx), tamerHP, s.level)
      : { HP: s.status.HP, Defesa: s.status.Defesa, Iniciativa: s.status.Iniciativa, Deslocamento: s.status.Deslocamento }
    return { ...base, Armadura: s.status.Armadura }
  }
  const curStatus  = statusOf(cur,  stageIdx)
  const nextStatus = statusOf(next, stageIdx + 1)

  const statusRows: { label: string; from: number; to: number }[] = [
    { label: 'HP',           from: curStatus.HP,           to: nextStatus.HP },
    { label: 'Deslocamento', from: curStatus.Deslocamento, to: nextStatus.Deslocamento },
    { label: 'Iniciativa',   from: curStatus.Iniciativa,   to: nextStatus.Iniciativa },
    { label: 'Defesa',       from: curStatus.Defesa,       to: nextStatus.Defesa },
    { label: 'Armadura',     from: curStatus.Armadura,     to: nextStatus.Armadura },
  ]

  const affinityRows = AFFINITY_KEYS
    .map(k => ({ label: k, from: cur.affinity[k] ?? 0, to: next.affinity[k] ?? 0 }))
    .filter(r => r.from !== 0 || r.to !== 0)

  const renderRow = (r: { label: string; from: number; to: number }) => {
    const d = r.to - r.from
    return (
      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 10, padding: '5px 12px', borderTop: '1px solid var(--line-soft)',
        fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <span style={{ color: 'var(--ink-soft)' }}>{r.label}</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--ink-mute)' }}>{r.from} → {r.to}</span>
          {d !== 0 && (
            <span style={{ fontWeight: 700, minWidth: 28, textAlign: 'right',
              color: d > 0 ? 'var(--green)' : 'var(--coral)' }}>{d > 0 ? `+${d}` : d}</span>
          )}
        </span>
      </div>
    )
  }

  const sectionHeader = (label: string) => (
    <div style={{ padding: '6px 12px', borderTop: '1px solid var(--line-soft)',
      background: 'var(--paper-deep)', fontFamily: 'var(--font-mono)', fontSize: 9,
      letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-mute)', fontWeight: 700 }}>
      {label}
    </div>
  )

  return (
    <div style={{ border: '1px solid var(--line-soft)', borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px',
        background: 'var(--paper-deep)', fontFamily: 'var(--font-mono)', fontSize: 9,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
        <span>{cur.stageName} → {next.stageName}</span>
      </div>

      {sectionHeader('Status')}
      {statusRows.map(renderRow)}

      {affinityRows.length > 0 && (
        <>
          {sectionHeader('Afinidades')}
          {affinityRows.map(renderRow)}
        </>
      )}
    </div>
  )
}

// ── DigimonStageView ───────────────────────────────────────────────
export function DigimonStageView({ line, stageIdx, tamer, editable, isGM, onSaveLine, onSaveTamer, onDeleteStage }: {
  line: DigimonLine; stageIdx: number; tamer?: Tamer; editable: boolean; isGM?: boolean
  onSaveLine: (l: DigimonLine) => void; onSaveTamer?: (t: Tamer) => void; onDeleteStage?: () => void
}) {
  const stage = line.stages[stageIdx]
  const [toast, setToast]    = useState<string|null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showEvo, setShowEvo] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [editInfo, setEditInfo] = useState(false)
  const [pendAttr, setPendAttr] = useState<Record<string, number>>({})
  // toggles das passivas: chave = índice da skill no array original, valor = { active, x }
  const [passiveToggles, setPassiveToggles] = useState<Record<number, { active: boolean; x: number }>>({})
  const [freeMode, setFreeMode] = useState(false)
  const pendCost = useMemo(() => pendingCost(pendAttr, stage?.attributes ?? {}, true), [pendAttr, stage])
  const hasPending = pendCost > 0
  const msg = (m: string) => setToast(m)

  if (!stage) return null
  if (stage.locked) return (
    <div style={{ textAlign:'center', padding:'48px 24px', color:'var(--ink-mute)' }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase' }}>Estágio bloqueado</div>
      <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:32, marginTop:8 }}>~ Ainda não revelado ~</div>
    </div>
  )

  const xpAvail = tamer?.xp ?? 0
  const evBonus = stageIdx > 1 ? stageIdx - 1 : 0

  // Para digimons parceiros: derivar HP a partir do tamer (regra do sistema)
  // Para selvagens e bugs: usar os valores absolutos do status — sem cálculo
  const isDerived = !!tamer
  const tamerHP = tamer ? tamer.status.HP.max : undefined
  const derived = isDerived
    ? calcDigimonDerived(stage.attributes, stage.size, stage.speed, evBonus, tamerHP, stage.level)
    : {
        HP:           stage.status.HP,
        Defesa:       stage.status.Defesa,
        Iniciativa:   stage.status.Iniciativa,
        Deslocamento: stage.status.Deslocamento,
      }

  // Calcular bônus acumulados de todas as passivas ativas (toggle)
  const activeStatusBonus = stage.skills.reduce((acc, sk, idx) => {
    if (!sk.toggleBonus?.statusBonus) return acc
    const t = passiveToggles[idx]
    if (!t?.active) return acc
    const multiplier = sk.toggleBonus.xBonus ? t.x : 1
    for (const [k, v] of Object.entries(sk.toggleBonus.statusBonus)) {
      acc[k] = (acc[k] ?? 0) + (v ?? 0) * multiplier
    }
    return acc
  }, {} as Record<string, number>)

  // alwaysOn: sempre ativo, sem toggle — inclui herança do Child para evoluções acima dele
  const childStageIdx = line.stages.findIndex(s => !s.locked && (s.level.includes('Lvl 3') || s.level.includes('Child')))
  const alwaysOnBonus = (() => {
    const acc: Record<string, number> = {}
    for (const sk of stage.skills) {
      if (!sk.alwaysOn?.statusBonus) continue
      for (const [k, v] of Object.entries(sk.alwaysOn.statusBonus)) acc[k] = (acc[k] ?? 0) + (v ?? 0)
    }
    if (childStageIdx >= 0 && stageIdx > childStageIdx) {
      for (const sk of line.stages[childStageIdx].skills) {
        if (!sk.alwaysOn?.statusBonus || !sk.alwaysOn.inheritable) continue
        for (const [k, v] of Object.entries(sk.alwaysOn.statusBonus)) acc[k] = (acc[k] ?? 0) + (v ?? 0)
      }
    }
    return acc
  })()

  const maxHPDigi = derived.HP + (stage.status.hpMaxBonus ?? 0) + (activeStatusBonus['HP'] ?? 0) + (alwaysOnBonus['HP'] ?? 0)
  const saveStageStatus = (patch: Partial<typeof stage.status>) => {
    const newStages = line.stages.map((s,i) => i===stageIdx ? { ...s, status: { ...s.status, ...patch } } : s)
    onSaveLine({ ...line, stages: newStages })
  }

  const statusEntries: StatEntry[] = [
    ['HP',
      `${stage.status.HP}/${maxHPDigi}`,
      (v: number) => saveStageStatus({ HP: Math.max(0, Math.min(v, maxHPDigi)) })
    ],
    ['Deslocamento', derived.Deslocamento + (activeStatusBonus['Deslocamento'] ?? 0) + (alwaysOnBonus['Deslocamento'] ?? 0)],
    ['Iniciativa',   derived.Iniciativa   + (activeStatusBonus['Iniciativa']   ?? 0) + (alwaysOnBonus['Iniciativa']   ?? 0)],
    ['Defesa',       derived.Defesa       + (activeStatusBonus['Defesa']       ?? 0) + (alwaysOnBonus['Defesa']       ?? 0)],
    ['Armadura',     stage.status.Armadura + (activeStatusBonus['Armadura']    ?? 0) + (alwaysOnBonus['Armadura']     ?? 0)],
    ...(activeStatusBonus['SecurityAttack'] ? [['Security Attack', `+${activeStatusBonus['SecurityAttack']}`] as [string,string]] : []),
    ...(tamer ? [['XP (tamer)', tamer.xp] as [string, number]] : []),
  ]

  const pendAttrUp = (k: AttributeKey) => {
    if ((stage.attributes[k] + (pendAttr[k]??0)) >= 10) return
    setPendAttr(p => ({ ...p, [k]: (p[k]??0)+1 }))
  }
  const pendAttrDown = (k: AttributeKey) => {
    if ((pendAttr[k]??0) <= 0) return
    setPendAttr(p => ({ ...p, [k]: p[k]-1 }))
  }
  const confirmXp = () => {
    if (!tamer || !onSaveTamer) { msg('Sem tamer vinculado.'); return }
    if (pendCost > tamer.xp) { msg('XP insuficiente!'); return }
    const attrs = { ...stage.attributes }
    for (const [k, d] of Object.entries(pendAttr)) if (d > 0) attrs[k as AttributeKey] += d
    onSaveTamer({ ...tamer, xp: tamer.xp - pendCost, xpSpent: tamer.xpSpent + pendCost })
    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, attributes: attrs } : s) })
    setPendAttr({}); msg(`−${pendCost} XP do tamer confirmado!`)
  }
  const cancelXp = () => { setPendAttr({}); msg('Cancelado.') }

  const onAddSkill = (sk: TamerSkill | DigimonSkill) => {
    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, skills:[...s.skills, sk as DigimonSkill] } : s) })
    setShowAdd(false); msg('Skill adicionada!')
  }
  const onDelSkill = (idx: number) => {
    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, skills:s.skills.filter((_,j)=>j!==idx) } : s) })
    msg('Skill removida.')
  }
  const onChangeSkill = (idx: number, sk: DigimonSkill) => {
    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, skills:s.skills.map((x,j)=>j===idx?sk:x) } : s) })
  }
  const onAddEvo = (evo: DigimonStage) => {
    const firstQ = line.stages.findIndex(s => s.stageName === '???' && !s.locked)
    if (firstQ === -1) { msg('Nenhum slot ??? disponível.'); return }
    onSaveLine({ ...line, stages: line.stages.map((s,i)=>i===firstQ?{...evo,locked:false}:s), line: line.line.replace('???', evo.stageName) })
    setShowEvo(false); msg(`${evo.stageName} registrado!`)
  }
  const onChangeWeakness = (w: Record<string,string>) =>
    onSaveLine({ ...line, stages: line.stages.map((s,i)=>i===stageIdx?{...s,weakness:w}:s) })
  const onChangeAffinity = (a: Partial<Record<string,number>>) =>
    onSaveLine({ ...line, stages: line.stages.map((s,i)=>i===stageIdx?{...s,affinity:a}:s) })

  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      <div style={{ display:'flex', gap:20, alignItems:'flex-start', marginBottom:16 }}>
        <div style={{ position:'relative', width:96, height:96, flexShrink:0 }}>
          <div style={{ width:96, height:96, borderRadius:14, overflow:'hidden', position:'relative' }}>
            <GrainFill color={stage.portrait} />
            {(() => {
              // Prioridade: imagem do estágio > imagem default > imagem da line
              const imgKey = `${line.id}:${stageIdx}`
              const defaultImg = DIGIMON_DEFAULT_IMAGES[imgKey] ?? null
              const img: string | null = stage.image ?? defaultImg ?? line.image ?? null
              return img ? <img src={img} alt={stage.stageName} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} /> : null
            })()}
          </div>
          {editable && (
            <label style={{ position:'absolute', inset:0, borderRadius:14, background:'rgba(0,0,0,0.35)',
              display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
              opacity:0, transition:'opacity 0.15s', fontSize:10, letterSpacing:'0.1em',
              textTransform:'uppercase', color:'white', fontFamily:'var(--font-mono)' }}
              onMouseEnter={e => (e.currentTarget.style.opacity='1')}
              onMouseLeave={e => (e.currentTarget.style.opacity='0')}>
              foto
              <input type="file" accept="image/*" style={{ display:'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader()
                  r.onload = ev => {
                    const dataUrl = ev.target?.result as string
                    onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, image: dataUrl } : s) })
                  }
                  r.readAsDataURL(f)
                }} />
            </label>
          )}
        </div>
        {/* Aviso de migração: line tem imagem mas estágio não */}
        {editable && line.image && !stage.image && (
          <div style={{ alignSelf:'center' }}>
            <button onClick={() => onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, image: line.image } : s) })}
              style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase',
                background:'transparent', border:'1px dashed var(--line)', borderRadius:6,
                padding:'3px 8px', cursor:'pointer', color:'var(--ink-mute)', whiteSpace:'nowrap' }}>
              ↙ usar foto da line
            </button>
          </div>
        )}
        <div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-mute)' }}>{stage.level} · {stage.type}</div>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:30, margin:'4px 0', textTransform:'uppercase', letterSpacing:'-0.02em' }}>{stage.stageName}</h3>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)' }}>CUSTO: {stage.cost}</div>
        </div>
      </div>

      {editable && editInfo && (
        <>
          <SectionTitle>Editar estágio</SectionTitle>
          <DigiInfoEditor line={line} stageIdx={stageIdx} onSaveLine={l => { onSaveLine(l); msg('Salvo!') }} />
        </>
      )}
      {editable && (
        <button className={styles.btnGhost} style={{ fontSize:11, marginBottom:12 }} onClick={() => setEditInfo(p=>!p)}>
          {editInfo ? '✕ Fechar' : '✎ Editar info do estágio'}
        </button>
      )}
      {editable && isGM && (
        <button className={styles.btnGhost} style={{ fontSize:11, marginBottom:12, marginLeft:6 }}
          onClick={() => onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, hidden: !s.hidden } : s) })}>
          {stage.hidden ? '👁 Revelar para players' : '🔒 Ocultar de players'}
        </button>
      )}
      {editable && isGM && onDeleteStage && (
        <button className={styles.btnGhost}
          style={{ fontSize:11, marginBottom:12, marginLeft:6, color:'var(--coral)', borderColor:'var(--coral)' }}
          onClick={() => { if (confirm(`Apagar o estágio "${stage.stageName}"?`)) onDeleteStage() }}>
          × Apagar estágio
        </button>
      )}
      {isGM && stage.hidden && (
        <div style={{ marginBottom:10, display:'inline-flex', alignItems:'center', gap:4,
          padding:'3px 10px', background:'rgba(196,51,33,0.10)', borderRadius:6,
          fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.12em',
          textTransform:'uppercase', color:'var(--coral)' }}>
          🔒 Oculto dos players
        </div>
      )}

      <StatRow entries={statusEntries} />

      {line.stages[stageIdx + 1] && !line.stages[stageIdx + 1].locked && (
        <div style={{ margin: '4px 0' }}>
          <button className={styles.btnGhost} style={{ fontSize: 11 }} onClick={() => setShowDiff(d => !d)}>
            {showDiff ? '✕ Ocultar comparação' : '⇄ Comparar com próximo estágio'}
          </button>
          {showDiff && <StageDiff line={line} stageIdx={stageIdx} tamer={tamer} />}
        </div>
      )}

      {editable && freeMode && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:12, padding:'8px 0 4px',
          fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span>HP máx:</span>
            <button className={styles.attrFreeBtn} onClick={() => saveStageStatus({ hpMaxBonus: (stage.status.hpMaxBonus ?? 0) - 1 })}>−</button>
            <span style={{ minWidth:24, textAlign:'center', color:'var(--ink)' }}>{maxHPDigi}</span>
            <button className={styles.attrFreeBtn} onClick={() => saveStageStatus({ hpMaxBonus: (stage.status.hpMaxBonus ?? 0) + 1 })}>+</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span>Armadura:</span>
            <button className={styles.attrFreeBtn} onClick={() => saveStageStatus({ Armadura: Math.max(0, stage.status.Armadura - 1) })}>−</button>
            <span style={{ minWidth:24, textAlign:'center', color:'var(--ink)' }}>{stage.status.Armadura}</span>
            <button className={styles.attrFreeBtn} onClick={() => saveStageStatus({ Armadura: stage.status.Armadura + 1 })}>+</button>
          </div>
        </div>
      )}

      <SectionTitle>Atributos</SectionTitle>
      <AttributeGrid attrs={stage.attributes} editable={editable} pending={pendAttr} onPend={pendAttrUp} onUnpend={pendAttrDown}
        freeMode={freeMode} onFreeModeChange={setFreeMode}
        onFreeEdit={(k, delta) => { onSaveLine({ ...line, stages: line.stages.map((s,i) => i===stageIdx ? { ...s, attributes: { ...s.attributes, [k]: Math.max(1, Math.min(10, s.attributes[k] + delta)) } } : s) }) }} />
      {hasPending && <XpConfirmBar cost={pendCost} xpAvail={xpAvail} onConfirm={confirmXp} onCancel={cancelXp} />}

      <SectionTitle>Weakness & Resistance</SectionTitle>
      <WeaknessBox weakness={stage.weakness} editable={editable} onChange={onChangeWeakness} />
      <SectionTitle>Affinity</SectionTitle>
      <AffinityGrid affinity={stage.affinity} editable={editable} onChange={onChangeAffinity} />

      <SectionTitle action={editable && !showAdd && (
        <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setShowAdd(true)}>+ Nova Skill</button>
      )}>Skills</SectionTitle>
      {[...stage.skills]
        .map((s, origIdx) => ({ s, origIdx }))
        .sort((a,b) => (a.s.type==="passive"?1:0)-(b.s.type==="passive"?1:0))
        .map(({ s, origIdx }) => (
          <SkillCard key={origIdx} s={s} editable={editable}
            onChange={sk => onChangeSkill(origIdx, sk as DigimonSkill)}
            onDelete={() => onDelSkill(origIdx)}
            onToggle={s.toggleBonus ? (active, x) =>
              setPassiveToggles(p => ({ ...p, [origIdx]: { active, x: x ?? 0 } }))
            : undefined}
            toggleActive={passiveToggles[origIdx]?.active ?? false}
            toggleX={passiveToggles[origIdx]?.x ?? 0}
          />
        ))
      }
      {showAdd && <AddSkillForm isTamer={false} onAdd={onAddSkill} onCancel={() => setShowAdd(false)} />}

      <SectionTitle>Digivolution Line</SectionTitle>
      <div style={{ padding:'14px 16px', background:'var(--paper-deep)', border:'1px solid var(--line-soft)', borderRadius:8, fontFamily:'var(--font-mono)', fontSize:13 }}>{line.line}</div>
      {editable && (
        <div style={{ marginTop:12 }}>
          {!showEvo
            ? <button className={styles.btnGhost} onClick={() => setShowEvo(true)}>+ Registrar nova evolução</button>
            : <AddEvolutionForm onAdd={onAddEvo} onCancel={() => setShowEvo(false)} />}
        </div>
      )}
    </div>
  )
}

// ── BugView ────────────────────────────────────────────────────────
export function BugView({ bug: b, editable, onSave }: { bug: Bug; editable: boolean; onSave: (b: Bug) => void }) {
  const [toast, setToast]    = useState<string|null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editInfo, setEditInfo] = useState(false)
  const msg = (m: string) => setToast(m)
  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {editable && editInfo && (
        <>
          <SectionTitle>Editar BUG</SectionTitle>
          <BugInfoEditor bug={b} onSave={nb => { onSave(nb); msg('Salvo!') }} />
        </>
      )}
      {editable && (
        <button className={styles.btnGhost} style={{ fontSize:11, marginBottom:12 }} onClick={() => setEditInfo(p=>!p)}>
          {editInfo ? '✕ Fechar' : '✎ Editar info'}
        </button>
      )}
      <StatRow entries={[['HP',b.status.HP],['Deslocamento',b.status.Deslocamento],['Iniciativa',b.status.Iniciativa],['Defesa',b.status.Defesa],['Armadura',b.status.Armadura]]} />
      <SectionTitle>Atributos</SectionTitle>
      <div className={styles.attrGrid}>
        {ATTRIBUTE_GROUPS.map(g => (
          <div key={g.label} className={styles.attrGroup}>
            <div className={styles.attrGroupLabel}>{g.label}</div>
            {g.keys.map(k => (
              <div key={k} className={styles.attrRow}>
                <span className={styles.attrName}>{k}</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, minWidth: 16, textAlign: 'right' }}>{b.attributes[k]??0}</span>
                  {editable && (
                    <>
                      <button onClick={() => onSave({ ...b, attributes:{ ...b.attributes,[k]:Math.min(10,(b.attributes[k]??0)+1) } })} className={styles.pendBtn}>+</button>
                      <button onClick={() => onSave({ ...b, attributes:{ ...b.attributes,[k]:Math.max(1,(b.attributes[k]??0)-1) } })} className={styles.pendBtnUndo}>−</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <SectionTitle>Weakness & Resistance</SectionTitle>
      <WeaknessBox weakness={b.weakness} editable={editable} onChange={w => onSave({ ...b, weakness:w })} />
      <SectionTitle>Affinity</SectionTitle>
      <AffinityGrid affinity={b.affinity} editable={editable} onChange={a => onSave({ ...b, affinity:a })} />
      <SectionTitle action={editable && !showAdd && (
        <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setShowAdd(true)}>+ Nova Skill</button>
      )}>Skills</SectionTitle>
      {b.skills.map((s,i) => (
        <SkillCard key={i} s={s} editable={editable}
          onChange={sk => onSave({ ...b, skills:b.skills.map((x,j)=>j===i?sk as DigimonSkill:x) })}
          onDelete={() => { onSave({ ...b, skills:b.skills.filter((_,j)=>j!==i) }); msg('Skill removida.') }} />
      ))}
      {showAdd && <AddSkillForm isTamer={false} onAdd={sk => { onSave({ ...b, skills:[...b.skills, sk as DigimonSkill] }); setShowAdd(false); msg('Skill adicionada!') }} onCancel={() => setShowAdd(false)} />}
    </div>
  )
}

// ── SignView ───────────────────────────────────────────────────────
export function SignView({ sign: sg, editable, onSave }: { sign: Sign; editable: boolean; onSave: (s: Sign) => void }) {
  const [toast, setToast]    = useState<string|null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const msg = (m: string) => setToast(m)
  return (
    <div>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      {editable && (
        <div className={styles.infoEditor} style={{ marginBottom:16 }}>
          <div className={styles.formRow}>
            <span className={styles.formLabel}>Código</span>
            {inp(sg.code, v => onSave({ ...sg, code: v }))}
          </div>
          <div className={styles.formRow}>
            <span className={styles.formLabel}>Nome</span>
            {inp(sg.name, v => onSave({ ...sg, name: v }))}
          </div>
          <div className={styles.formRow}>
            <span className={styles.formLabel}>Lore</span>
            <textarea value={sg.lore} onChange={e => onSave({ ...sg, lore: e.target.value })}
              className={styles.formInput} rows={2} style={{ resize:'vertical' }} />
          </div>
        </div>
      )}
      {!editable && sg.lore && (
        <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:15, color:'var(--ink-soft)', marginBottom:16 }}>
          ~ {sg.lore} ~
        </div>
      )}
      <StatRow entries={[['HP',sg.status.HP],['Deslocamento',sg.status.Deslocamento],['Iniciativa',sg.status.Iniciativa],['Defesa',sg.status.Defesa],['Armadura',sg.status.Armadura]]} />
      <SectionTitle>Atributos</SectionTitle>
      <div className={styles.attrGrid}>
        {ATTRIBUTE_GROUPS.map(g => (
          <div key={g.label} className={styles.attrGroup}>
            <div className={styles.attrGroupLabel}>{g.label}</div>
            {g.keys.map(k => (
              <div key={k} className={styles.attrRow}>
                <span className={styles.attrName}>{k}</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:15, minWidth:16, textAlign:'right' }}>{sg.attributes[k]??0}</span>
                  {editable && (
                    <>
                      <button onClick={() => onSave({ ...sg, attributes:{ ...sg.attributes,[k]:Math.min(10,(sg.attributes[k]??0)+1) } })} className={styles.pendBtn}>+</button>
                      <button onClick={() => onSave({ ...sg, attributes:{ ...sg.attributes,[k]:Math.max(0,(sg.attributes[k]??0)-1) } })} className={styles.pendBtnUndo}>−</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <SectionTitle>Weakness & Resistance</SectionTitle>
      <WeaknessBox weakness={sg.weakness} editable={editable} onChange={w => onSave({ ...sg, weakness:w })} />
      <SectionTitle>Affinity</SectionTitle>
      <AffinityGrid affinity={sg.affinity} editable={editable} onChange={a => onSave({ ...sg, affinity:a })} />
      <SectionTitle action={editable && !showAdd && (
        <button className={styles.btnGhost} style={{ fontSize:11 }} onClick={() => setShowAdd(true)}>+ Nova Skill</button>
      )}>Skills</SectionTitle>
      {sg.skills.map((s,i) => (
        <SkillCard key={i} s={s} editable={editable}
          onChange={sk => onSave({ ...sg, skills:sg.skills.map((x,j)=>j===i?sk as DigimonSkill:x) })}
          onDelete={() => { onSave({ ...sg, skills:sg.skills.filter((_,j)=>j!==i) }); msg('Skill removida.') }} />
      ))}
      {showAdd && <AddSkillForm isTamer={false} onAdd={sk => { onSave({ ...sg, skills:[...sg.skills, sk as DigimonSkill] }); setShowAdd(false); msg('Skill adicionada!') }} onCancel={() => setShowAdd(false)} />}
    </div>
  )
}
