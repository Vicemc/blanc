import React, { useState, useMemo } from 'react'
import type { AppState, DigimonLine, Bug, Sign, SectorFolder, BugFolder as BugFolderType, TokenDef } from '../types'
import { BUG_COLORS, PORTRAIT_LIST } from '../types'
import { makeWildDigimon, makeBug, makeSign, DEFAULT_TOKEN_DEFS } from '../data/store'
import { PageHead } from '../components/PageHead'
import { GrainFill } from '../components/GrainFill'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import styles from './GogglePage.module.css'

interface Props { state: AppState; onUpdate: (s: AppState) => void; canEdit?: (tamerId?: string) => boolean; isGM?: boolean }

function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function importJson<T>(onLoad: (data: T) => void) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = e => { try { onLoad(JSON.parse(e.target?.result as string) as T) } catch { alert('Arquivo inválido.') } }
    reader.readAsText(file)
  }
  input.click()
}

// ── Cards ─────────────────────────────────────────────────────────────────────
function DigiCard({ d, onClick, onDelete, onExport, onImport }: {
  d: DigimonLine; onClick: () => void; onDelete?: (e: React.MouseEvent) => void
  onExport: (e: React.MouseEvent) => void; onImport: (e: React.MouseEvent) => void
}) {
  const s = d.stages[d.currentStage ?? 0] ?? d.stages[0]
  return (
    <div className={styles.card} onClick={onClick}>
      {onDelete && <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>}
      <div className={styles.cardActions}>
        <button className={styles.cardActionBtn} onClick={onExport} title="Exportar">↓</button>
        <button className={styles.cardActionBtn} onClick={onImport} title="Importar">↑</button>
      </div>
      <div className={`${styles.cardPortrait} fill-${s.portrait}`} style={{ position: 'relative' }}>
        <div className="grain" />
        {d.image && <img src={d.image} alt={d.name} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />}
      </div>
      <div className={styles.cardInfo}>
        <h4 className={styles.cardName}>{d.name.replace(' Line', '')}</h4>
        <div className={styles.cardMeta}>{s.level} · {s.type}</div>
        {d.tamerId && <div className={styles.cardTamer}>parceiro</div>}
      </div>
    </div>
  )
}

function BugCard({ b, onClick, onDelete, onExport, onImport }: {
  b: Bug; onClick: () => void; onDelete?: (e: React.MouseEvent) => void
  onExport: (e: React.MouseEvent) => void; onImport: (e: React.MouseEvent) => void
}) {
  return (
    <div className={styles.card} onClick={onClick}>
      {onDelete && <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>}
      <div className={styles.cardActions}>
        <button className={styles.cardActionBtn} onClick={onExport} title="Exportar">↓</button>
        <button className={styles.cardActionBtn} onClick={onImport} title="Importar">↑</button>
      </div>
      <div className={`${styles.cardPortrait} fill-bug-${b.color}`} style={{ position: 'relative' }}>
        <div className="grain grain-invert" />
        {b.image && <img src={b.image} alt={b.name} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />}
      </div>
      <div className={styles.cardInfo}>
        <h4 className={styles.cardName}>{b.name}</h4>
        <div className={styles.cardMeta}>{b.class}.{b.color}</div>
        {b.lore && <div className={styles.cardLore}>~ {b.lore} ~</div>}
      </div>
    </div>
  )
}

function SignCard({ sg, onClick, onDelete, onExport, onImport }: {
  sg: Sign; onClick: () => void; onDelete?: (e: React.MouseEvent) => void
  onExport: (e: React.MouseEvent) => void; onImport: (e: React.MouseEvent) => void
}) {
  return (
    <div className={styles.card} onClick={onClick}>
      {onDelete && <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>}
      <div className={styles.cardActions}>
        <button className={styles.cardActionBtn} onClick={onExport} title="Exportar">↓</button>
        <button className={styles.cardActionBtn} onClick={onImport} title="Importar">↑</button>
      </div>
      <div className={`${styles.cardPortrait} fill-indigo`} style={{ position: 'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div className="grain" />
        {sg.image
          ? <img src={sg.image} alt={sg.name} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
          : <span style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.12em', color:'rgba(246,242,233,0.7)', textTransform:'uppercase', zIndex:1 }}>{sg.code}</span>
        }
      </div>
      <div className={styles.cardInfo}>
        <h4 className={styles.cardName}>{sg.name}</h4>
        <div className={styles.cardMeta}>{sg.code}</div>
        {sg.lore && <div className={styles.cardLore}>~ {sg.lore} ~</div>}
      </div>
    </div>
  )
}

// ── Modal: Novo SIGN ──────────────────────────────────────────────────────────
function AddSignModal({ state, onSave, onClose }: { state: AppState; onSave: (s: AppState) => void; onClose: () => void }) {
  const signs = state.signs ?? []
  const nextNum = signs.length + 1
  const [code, setCode]   = useState(`SIGN ${String(nextNum).padStart(2,'0')}`)
  const [name, setName]   = useState('')
  const [lore, setLore]   = useState('')

  const submit = () => {
    if (!name.trim()) return
    const id = `sign-${code.toLowerCase().replace(/\s+/g,'-')}-${Date.now().toString(36)}`
    const newSign = makeSign(id, code.trim(), name.trim())
    newSign.lore = lore.trim()
    onSave({ ...state, signs: [...signs, newSign] })
    onClose()
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth:480 }} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <div className={styles.addForm}>
          <h2 className={styles.addTitle}>Novo SIGN</h2>
          {([
            ['Código', code, setCode, 'SIGN 01'],
            ['Nome', name, setName, 'Yahiro Saki'],
          ] as [string, string, (v:string)=>void, string][]).map(([lbl,val,set,ph]) => (
            <div key={lbl} className={styles.field}>
              <label className={styles.fieldLabel}>{lbl}</label>
              <input value={val} onChange={e=>set(e.target.value)} placeholder={ph} className={styles.fieldInput}/>
            </div>
          ))}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Lore</label>
            <textarea value={lore} onChange={e=>setLore(e.target.value)} className={styles.fieldInput} rows={2} style={{resize:'vertical'}} placeholder="Uma breve descrição..."/>
          </div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className={styles.btnSolid} onClick={submit}>Adicionar</button>
            <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Novo Digimon Selvagem ──────────────────────────────────────────────
function AddWildModal({ state, sectors, onSave, onClose }: { state: AppState; sectors: SectorFolder[]; onSave: (s: AppState) => void; onClose: () => void }) {
  const [name, setName]       = useState('')
  const [level, setLevel]     = useState('Adult (Lvl 4)')
  const [type, setType]       = useState('')
  const [lore, setLore]       = useState('')
  const [portrait, setPortrait] = useState<DigimonLine['stages'][0]['portrait']>('sage')
  const [sectorNums, setSectorNums] = useState<number[]>([])
  const toggle = (n: number) => setSectorNums(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n])
  const submit = () => {
    if (!name.trim()) return
    const id = `d-wild-${name.toLowerCase().replace(/\s+/g,'-')}-${Date.now().toString(36)}`
    onSave({ ...state, bestiary: [...state.bestiary, makeWildDigimon(id, name.trim(), level, type, portrait, sectorNums, lore)] })
    onClose()
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth:520 }} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <div className={styles.addForm}>
          <h2 className={styles.addTitle}>Novo Digimon Selvagem</h2>
          {([['Nome *', name, setName, 'Kuwagamon'], ['Nível', level, setLevel, 'Adult (Lvl 4)'], ['Tipo', type, setType, 'Insect']] as any[]).map(([lbl,val,set,ph]: any) => (
            <div key={lbl} className={styles.field}><label className={styles.fieldLabel}>{lbl}</label><input value={val} onChange={(e:any)=>set(e.target.value)} placeholder={ph} className={styles.fieldInput}/></div>
          ))}
          <div className={styles.field}><label className={styles.fieldLabel}>Lore</label><textarea value={lore} onChange={e=>setLore(e.target.value)} className={styles.fieldInput} rows={2} style={{resize:'vertical'}}/></div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Setores</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {sectors.map(s=><button key={s.n} onClick={()=>toggle(s.n)} style={{padding:'3px 10px',borderRadius:999,border:'1px solid var(--line)',background:sectorNums.includes(s.n)?'var(--ink)':'transparent',color:sectorNums.includes(s.n)?'var(--paper)':'var(--ink-soft)',cursor:'pointer',fontFamily:'var(--font-mono)',fontSize:11}}>Setor {s.n}{s.name?' — '+s.name:''}</button>)}
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Cor do retrato</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {PORTRAIT_LIST.map(p=>(
                <div key={p} onClick={()=>setPortrait(p)} style={{width:28,height:28,borderRadius:6,overflow:'hidden',cursor:'pointer',position:'relative',outline:portrait===p?'2px solid var(--ink)':'none',outlineOffset:2}}>
                  <GrainFill color={p}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className={styles.btnSolid} onClick={submit}>Adicionar</button>
            <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddBugModal({ state, onSave, onClose, defaultCls, defaultColor }: { state: AppState; onSave: (s: AppState) => void; onClose: () => void; defaultCls?: string; defaultColor?: Bug['color'] }) {
  const [name, setName]   = useState('')
  const [cls, setCls]     = useState(defaultCls ?? 'ledo')
  const [color, setColor] = useState<Bug['color']>(defaultColor ?? 'red')
  const [lore, setLore]   = useState('')
  const submit = () => {
    if (!name.trim()) return
    const id = `b-${cls}-${Date.now().toString(36)}`
    onSave({ ...state, bugs: [...state.bugs, makeBug(id, name.trim(), cls, color, [1,2,3,4,5], lore)] })
    onClose()
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <div className={styles.addForm}>
          <h2 className={styles.addTitle}>Novo BUG</h2>
          <div className={styles.field}><label className={styles.fieldLabel}>Nome *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="red.spindle" className={styles.fieldInput}/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className={styles.field}><label className={styles.fieldLabel}>Classe</label><input value={cls} onChange={e=>setCls(e.target.value)} className={styles.fieldInput} placeholder="ledo"/></div>
            <div className={styles.field}><label className={styles.fieldLabel}>Cor</label>
              <select value={color} onChange={e=>setColor(e.target.value as Bug['color'])} className={styles.fieldInput}>
                {BUG_COLORS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.field}><label className={styles.fieldLabel}>Lore</label><textarea value={lore} onChange={e=>setLore(e.target.value)} className={styles.fieldInput} rows={2} style={{resize:'vertical'}}/></div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className={styles.btnSolid} onClick={submit}>Adicionar</button>
            <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CRUD: Nova pasta de Setor ─────────────────────────────────────────────────
function AddSectorModal({ state, onSave, onClose }: { state: AppState; onSave: (s: AppState) => void; onClose: () => void }) {
  const maxN = Math.max(0, ...state.sectors.map(s => s.n))
  const [name, setName]   = useState('')
  const [bioma, setBioma] = useState('')
  const [color, setColor] = useState<SectorFolder['color']>('sage')
  const submit = () => {
    const n = maxN + 1
    const newSectors = [...state.sectors, { n, name: name.trim() || '—', bioma: bioma.trim() || '—', color }]
    onSave({ ...state, sectors: newSectors })
    onClose()
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <div className={styles.addForm}>
          <h2 className={styles.addTitle}>Nova Pasta de Setor</h2>
          <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--ink-mute)',marginBottom:14}}>Será criado como Setor {maxN + 1}</div>
          <div className={styles.field}><label className={styles.fieldLabel}>Nome</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Asgard" className={styles.fieldInput}/></div>
          <div className={styles.field}><label className={styles.fieldLabel}>Bioma</label><input value={bioma} onChange={e=>setBioma(e.target.value)} placeholder="Tundra" className={styles.fieldInput}/></div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Cor</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {PORTRAIT_LIST.map(p=>(
                <div key={p} onClick={()=>setColor(p)} style={{width:28,height:28,borderRadius:6,overflow:'hidden',cursor:'pointer',position:'relative',outline:color===p?'2px solid var(--ink)':'none',outlineOffset:2}}>
                  <GrainFill color={p}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className={styles.btnSolid} onClick={submit}>Criar Setor</button>
            <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddBugFolderModal({ state, onSave, onClose }: { state: AppState; onSave: (s: AppState) => void; onClose: () => void }) {
  const [cls, setCls]     = useState('')
  const [color, setColor] = useState<Bug['color']>('purple')
  const submit = () => {
    if (!cls.trim()) return
    if (state.bugFolders.some(f => f.cls === cls.trim() && f.color === color)) { alert('Pasta já existe.'); return }
    onSave({ ...state, bugFolders: [...state.bugFolders, { cls: cls.trim(), color }] })
    onClose()
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <div className={styles.addForm}>
          <h2 className={styles.addTitle}>Nova Pasta de BUG</h2>
          <div className={styles.field}><label className={styles.fieldLabel}>Classe</label><input value={cls} onChange={e=>setCls(e.target.value)} placeholder="haru" className={styles.fieldInput}/></div>
          <div className={styles.field}><label className={styles.fieldLabel}>Cor</label>
            <select value={color} onChange={e=>setColor(e.target.value as Bug['color'])} className={styles.fieldInput}>
              {BUG_COLORS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className={styles.btnSolid} onClick={submit}>Criar Pasta</button>
            <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Pasta de Setor ────────────────────────────────────────────────────────────
function SectorFolderComp({ sector, digimons, state, onUpdate, onOpen, onDeleteFolder, isGM }: {
  sector: SectorFolder; digimons: DigimonLine[];
  state: AppState; onUpdate: (s: AppState) => void;
  onOpen: (s: SheetSubject) => void; onDeleteFolder: () => void; isGM?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [addWild, setAddWild]   = useState(false)
  const deleteWild = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Remover?')) return
    onUpdate({ ...state, bestiary: state.bestiary.filter(d => d.id !== id) })
  }
  return (
    <div className={`${styles.folder} ${expanded ? styles.folderOpen : ''}`}>
      <div className={styles.folderTab} onClick={() => setExpanded(p => !p)}
        style={{ borderLeftColor: `var(--${sector.color})` }}>
        <div className={styles.folderNum} style={{ background: `var(--${sector.color})` }}>S{sector.n}</div>
        <div className={styles.folderName}>{sector.name}</div>
        <div className={styles.folderBioma}>{sector.bioma}</div>
        <div className={styles.folderCount}>{digimons.length} entrada{digimons.length !== 1 ? 's' : ''}</div>
        <div className={`${styles.folderChevron} ${expanded ? styles.chevronOpen : ''}`}>›</div>
      </div>
      {expanded && (
        <div className={styles.folderBody}>
          <div className={styles.folderToolbar}>
            {isGM && <button className={styles.btnGhost} style={{fontSize:11}} onClick={e=>{e.stopPropagation();setAddWild(true)}}>+ Digimon</button>}
            <button className={styles.btnGhost} style={{fontSize:11}} onClick={e=>{e.stopPropagation();const f=document.createElement('input');f.type='file';f.accept='.json';f.onchange=()=>{const file=f.files?.[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target?.result as string) as DigimonLine;const id=`d-wild-${Date.now().toString(36)}`;const nd={...d,id,tamerId:null,sectors:[...new Set([...d.sectors,sector.n])]};onUpdate({...state,bestiary:[...state.bestiary,nd]})}catch{alert('Arquivo inválido.')}};r.readAsText(file)};f.click()}}>↑ Importar</button>
            {isGM && <button className={styles.btnGhost} style={{fontSize:11,marginLeft:'auto',color:'var(--coral)'}} onClick={e=>{e.stopPropagation();if(!confirm(`Remover a pasta do Setor ${sector.n}? Os digimons do setor não serão apagados.`))return;onDeleteFolder()}}>× Pasta</button>}
          </div>
          {digimons.length === 0 && <div className={styles.empty}>~ nenhum digimon neste setor ~</div>}
          <div className={styles.cardGrid}>
            {digimons.map(d => (
              <DigiCard key={d.id} d={d}
                onClick={() => onOpen(d.tamerId ? { kind:'digimon', id: d.id } : { kind:'wild', id: d.id })}
                onDelete={isGM ? (e) => deleteWild(d.id, e) : undefined}
                onExport={(e) => { e.stopPropagation(); exportJson(d, `digimon-${d.id}-${new Date().toISOString().slice(0,10)}.json`) }}
                onImport={(e) => { e.stopPropagation(); importJson<DigimonLine>(imported => {
                  onUpdate({ ...state, bestiary: state.bestiary.map(x => x.id === d.id ? { ...imported, id: d.id } : x) })
                }) }} />
            ))}
          </div>
        </div>
      )}
      {addWild && <AddWildModal state={state} sectors={state.sectors} onSave={s=>{onUpdate(s);setAddWild(false)}} onClose={()=>setAddWild(false)} />}
    </div>
  )
}

// ── Pasta de BUG ─────────────────────────────────────────────────────────────
function BugFolderComp({ folder, bugs, state, onUpdate, onOpen, onDeleteFolder, isGM }: {
  folder: BugFolderType; bugs: Bug[];
  state: AppState; onUpdate: (s: AppState) => void;
  onOpen: (s: SheetSubject) => void; onDeleteFolder: () => void; isGM?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [addBug, setAddBug]     = useState(false)
  const deleteBug = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Remover?')) return
    onUpdate({ ...state, bugs: state.bugs.filter(b => b.id !== id) })
  }
  return (
    <div className={`${styles.folder} ${expanded ? styles.folderOpen : ''}`}>
      <div className={styles.folderTab} onClick={() => setExpanded(p => !p)}
        style={{ borderLeftColor: `var(--fill-bug-${folder.color}, var(--line))` }}>
        <div className={`${styles.bugDot} fill-bug-${folder.color}`} />
        <div className={styles.folderName} style={{ textTransform: 'uppercase' }}>{folder.cls}</div>
        <div className={styles.folderBioma}>{folder.color}</div>
        <div className={styles.folderCount}>{bugs.length} bug{bugs.length !== 1 ? 's' : ''}</div>
        <div className={`${styles.folderChevron} ${expanded ? styles.chevronOpen : ''}`}>›</div>
      </div>
      {expanded && (
        <div className={styles.folderBody}>
          <div className={styles.folderToolbar}>
            {isGM && <button className={styles.btnGhost} style={{fontSize:11}} onClick={e=>{e.stopPropagation();setAddBug(true)}}>+ BUG</button>}
            <button className={styles.btnGhost} style={{fontSize:11}} onClick={e=>{e.stopPropagation();const f=document.createElement('input');f.type='file';f.accept='.json';f.onchange=()=>{const file=f.files?.[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const b=JSON.parse(ev.target?.result as string) as Bug;const id=`b-${folder.cls}-${Date.now().toString(36)}`;onUpdate({...state,bugs:[...state.bugs,{...b,id,class:folder.cls,color:folder.color}]})}catch{alert('Arquivo inválido.')}};r.readAsText(file)};f.click()}}>↑ Importar</button>
            {isGM && <button className={styles.btnGhost} style={{fontSize:11,marginLeft:'auto',color:'var(--coral)'}} onClick={e=>{e.stopPropagation();if(!confirm(`Remover a pasta ${folder.cls}.${folder.color}? Os BUGs não serão apagados.`))return;onDeleteFolder()}}>× Pasta</button>}
          </div>
          {bugs.length === 0 && <div className={styles.empty}>~ nenhum bug desta classe registrado ~</div>}
          <div className={styles.cardGrid}>
            {bugs.map(b => (
              <BugCard key={b.id} b={b}
                onClick={() => onOpen({ kind:'bug', id: b.id })}
                onDelete={isGM ? (e) => deleteBug(b.id, e) : undefined}
                onExport={(e) => { e.stopPropagation(); exportJson(b, `bug-${b.id}-${new Date().toISOString().slice(0,10)}.json`) }}
                onImport={(e) => { e.stopPropagation(); importJson<Bug>(imported => {
                  onUpdate({ ...state, bugs: state.bugs.map(x => x.id === b.id ? { ...imported, id: b.id } : x) })
                }) }} />
            ))}
          </div>
        </div>
      )}
      {addBug && <AddBugModal state={state} defaultCls={folder.cls} defaultColor={folder.color} onSave={s=>{onUpdate(s);setAddBug(false)}} onClose={()=>setAddBug(false)} />}
    </div>
  )
}

// ── Aba SIGNs ─────────────────────────────────────────────────────────────────
function SignsTab({ state, onUpdate, onOpen, isGM }: { state: AppState; onUpdate: (s: AppState) => void; onOpen: (s: SheetSubject) => void; isGM?: boolean }) {
  const [addSign, setAddSign] = useState(false)
  const signs = state.signs ?? []

  const deleteSign = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Remover este SIGN?')) return
    onUpdate({ ...state, signs: signs.filter(sg => sg.id !== id) })
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionNote}>
        {signs.length} SIGN{signs.length !== 1 ? 's' : ''} registrado{signs.length !== 1 ? 's' : ''}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {isGM && <button className={styles.btnGhost} style={{fontSize:12}} onClick={() => setAddSign(true)}>
          + Novo SIGN
        </button>}
        <button className={styles.btnGhost} style={{fontSize:12}} onClick={() => {
          const f = document.createElement('input')
          f.type = 'file'; f.accept = '.json'
          f.onchange = () => {
            const file = f.files?.[0]; if (!file) return
            const r = new FileReader()
            r.onload = ev => {
              try {
                const sg = JSON.parse(ev.target?.result as string) as Sign
                const id = `sign-${Date.now().toString(36)}`
                onUpdate({ ...state, signs: [...signs, { ...sg, id }] })
              } catch { alert('Arquivo inválido.') }
            }
            r.readAsText(file)
          }
          f.click()
        }}>↑ Importar SIGN</button>
      </div>

      {signs.length === 0 && (
        <div className={styles.emptyState}>
          ~ nenhum SIGN registrado ~<br/>
          <small>Use "+ Novo SIGN" para adicionar.</small>
        </div>
      )}

      <div className={styles.cardGrid}>
        {signs.map(sg => (
          <SignCard key={sg.id} sg={sg}
            onClick={() => onOpen({ kind: 'sign', id: sg.id })}
            onDelete={isGM ? (e) => deleteSign(sg.id, e) : undefined}
            onExport={(e) => { e.stopPropagation(); exportJson(sg, `sign-${sg.id}-${new Date().toISOString().slice(0,10)}.json`) }}
            onImport={(e) => { e.stopPropagation(); importJson<Sign>(imported => {
              onUpdate({ ...state, signs: signs.map(x => x.id === sg.id ? { ...imported, id: sg.id } : x) })
            }) }}
          />
        ))}
      </div>

      {addSign && <AddSignModal state={state} onSave={s=>{onUpdate(s);setAddSign(false)}} onClose={()=>setAddSign(false)} />}
    </div>
  )
}

// ── Aba Tokens ────────────────────────────────────────────────────────────────

function TokensTab({ state, onUpdate, isGM }: {
  state: AppState; onUpdate: (s: AppState) => void; isGM: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<TokenDef>>({
    name: '', level: '', origin: '', hp: 1, defesa: 0, armadura: 0,
    deslocamento: '', type: 'Digimon', attribute: 'No Data',
    alcance: 'Corpo a Corpo - 1 Metro', dados: '', dano: 0, securityAttack: 0,
    effect: '', autoConditions: [], visible: false,
  })

  const tokens = state.tokenDefs ?? DEFAULT_TOKEN_DEFS
  const visible = isGM ? tokens : tokens.filter(t => t.visible)

  const saveToken = () => {
    if (!draft.name?.trim()) return
    const tok: TokenDef = {
      id:             editing ?? `token-${Date.now().toString(36)}`,
      name:           draft.name.trim(),
      level:          draft.level ?? '',
      origin:         draft.origin ?? '',
      hp:             draft.hp ?? 1,
      defesa:         draft.defesa ?? 0,
      armadura:       draft.armadura ?? 0,
      deslocamento:   draft.deslocamento ?? '',
      type:           draft.type ?? 'Digimon',
      attribute:      draft.attribute ?? 'No Data',
      alcance:        draft.alcance ?? '',
      dados:          draft.dados ?? '',
      dano:           draft.dano ?? 0,
      securityAttack: draft.securityAttack ?? 0,
      effect:         draft.effect ?? '',
      autoConditions: draft.autoConditions ?? [],
      visible:        draft.visible ?? false,
    }
    const existing = tokens.find(t => t.id === tok.id)
    const newDefs = existing
      ? tokens.map(t => t.id === tok.id ? tok : t)
      : [...tokens, tok]
    onUpdate({ ...state, tokenDefs: newDefs })
    setAdding(false); setEditing(null)
    setDraft({ name: '', level: '', origin: '', hp: 1, defesa: 0, armadura: 0,
      deslocamento: '', type: 'Digimon', attribute: 'No Data',
      alcance: 'Corpo a Corpo - 1 Metro', dados: '', dano: 0, securityAttack: 0,
      effect: '', autoConditions: [], visible: false })
  }

  const toggleVisible = (id: string) => {
    onUpdate({ ...state, tokenDefs: tokens.map(t => t.id === id ? { ...t, visible: !t.visible } : t) })
  }

  const deleteToken = (id: string) => {
    if (!confirm('Remover este token?')) return
    onUpdate({ ...state, tokenDefs: tokens.filter(t => t.id !== id) })
  }

  const COND_COLORS = ['coral','orange','blue','purple','teal','green','gold','indigo'] as const

  const inp = (label: string, val: string | number, set: (v: string) => void, ph = '') => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 3 }}>{label}</div>
      <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
        style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8,
          padding: '7px 12px', fontFamily: 'var(--font-body)', fontSize: 13,
          background: 'var(--paper)', color: 'var(--ink)' }} />
    </div>
  )

  return (
    <div className={styles.section}>
      <div className={styles.sectionNote}>
        {visible.length} token{visible.length !== 1 ? 's' : ''} definido{visible.length !== 1 ? 's' : ''}
      </div>

      {isGM && !adding && !editing && (
        <button className={styles.btnGhost} style={{ fontSize: 12, marginBottom: 16 }}
          onClick={() => setAdding(true)}>+ Novo Token</button>
      )}

      {/* Form de criação/edição */}
      {(adding || editing) && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '20px',
          background: 'var(--paper-deep)', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase',
            marginBottom: 16 }}>{editing ? 'Editar Token' : 'Novo Token'}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            {inp('Nome *', draft.name ?? '', v => setDraft(p => ({ ...p, name: v })), 'Silhouette Token')}
            {inp('Nível', draft.level ?? '', v => setDraft(p => ({ ...p, level: v })), 'Lv.3')}
          </div>
          {inp('Origem', draft.origin ?? '', v => setDraft(p => ({ ...p, origin: v })), 'Sachi — Puppet Theater')}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {(['hp','defesa','armadura','dano'] as const).map(f => (
              <div key={f}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 3 }}>{f}</div>
                <input type="number" min={0} value={draft[f] ?? 0}
                  onChange={e => setDraft(p => ({ ...p, [f]: parseInt(e.target.value) || 0 }))}
                  style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8,
                    padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 13,
                    background: 'var(--paper)', color: 'var(--ink)' }} />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            {inp('Deslocamento', draft.deslocamento ?? '', v => setDraft(p => ({ ...p, deslocamento: v })), 'Igual ao de Sachi')}
            {inp('Alcance', draft.alcance ?? '', v => setDraft(p => ({ ...p, alcance: v })), 'Corpo a Corpo - 1 Metro')}
          </div>
          {inp('Dados', draft.dados ?? '', v => setDraft(p => ({ ...p, dados: v })), 'Expressão de Sachi + Físico')}

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 3 }}>Efeito</div>
            <textarea value={draft.effect ?? ''} onChange={e => setDraft(p => ({ ...p, effect: e.target.value }))}
              rows={2} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8,
                padding: '7px 12px', fontFamily: 'var(--font-body)', fontSize: 13,
                background: 'var(--paper)', color: 'var(--ink)', resize: 'vertical' }} />
          </div>

          {/* Condições automáticas */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 6 }}>
              Condições automáticas ao invocar
            </div>
            {(draft.autoConditions ?? []).map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input value={c.label} onChange={e => setDraft(p => ({ ...p, autoConditions: (p.autoConditions??[]).map((x,j)=>j===i?{...x,label:e.target.value}:x) }))}
                  placeholder="Blocker" style={{ flex:2, border:'1px solid var(--line)', borderRadius:6, padding:'5px 8px', fontFamily:'var(--font-body)', fontSize:12, background:'var(--paper)' }} />
                <input type="number" min={1} max={20} value={c.filled} onChange={e => setDraft(p => ({ ...p, autoConditions: (p.autoConditions??[]).map((x,j)=>j===i?{...x,filled:parseInt(e.target.value)||1}:x) }))}
                  style={{ width:44, border:'1px solid var(--line)', borderRadius:6, padding:'5px 6px', fontFamily:'var(--font-mono)', fontSize:12, background:'var(--paper)', textAlign:'center' }} />
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-mute)' }}>/</span>
                <input type="number" min={1} max={20} value={c.max} onChange={e => setDraft(p => ({ ...p, autoConditions: (p.autoConditions??[]).map((x,j)=>j===i?{...x,max:parseInt(e.target.value)||3}:x) }))}
                  style={{ width:44, border:'1px solid var(--line)', borderRadius:6, padding:'5px 6px', fontFamily:'var(--font-mono)', fontSize:12, background:'var(--paper)', textAlign:'center' }} />
                <select value={c.color} onChange={e => setDraft(p => ({ ...p, autoConditions: (p.autoConditions??[]).map((x,j)=>j===i?{...x,color:e.target.value}:x) }))}
                  style={{ flex:1, border:'1px solid var(--line)', borderRadius:6, padding:'5px 8px', fontSize:12, background:'var(--paper)' }}>
                  {COND_COLORS.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
                <button onClick={() => setDraft(p => ({ ...p, autoConditions: (p.autoConditions??[]).filter((_,j)=>j!==i) }))}
                  style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--coral)', fontSize:16 }}>×</button>
              </div>
            ))}
            <button onClick={() => setDraft(p => ({ ...p, autoConditions: [...(p.autoConditions??[]), { label:'', filled:1, max:3, color:'coral' }] }))}
              style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', background:'transparent', border:'1px dashed var(--line)', borderRadius:6, padding:'3px 10px', cursor:'pointer', color:'var(--ink-mute)' }}>
              + condição
            </button>
          </div>

          <label style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)', letterSpacing:'0.08em', marginBottom:14, cursor:'pointer' }}>
            <input type="checkbox" checked={draft.visible ?? false} onChange={e => setDraft(p => ({ ...p, visible: e.target.checked }))} />
            Visível para players
          </label>

          <div style={{ display:'flex', gap:8 }}>
            <button className={styles.btnSolid} onClick={saveToken}>
              {editing ? 'Salvar' : 'Criar'}
            </button>
            <button className={styles.btnGhost} onClick={() => { setAdding(false); setEditing(null) }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de tokens */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visible.map(t => (
          <div key={t.id} style={{ border: `1px solid ${t.visible ? 'var(--line)' : 'var(--line-soft)'}`,
            borderRadius: 12, padding: '16px 20px', background: 'var(--paper)',
            opacity: t.visible ? 1 : 0.65 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, textTransform: 'uppercase' }}>
                    {t.name}
                  </span>
                  {t.level && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                      padding: '1px 7px', borderRadius: 999, background: 'var(--paper-deep)',
                      border: '1px solid var(--line)', color: 'var(--ink-mute)' }}>{t.level}</span>
                  )}
                  {isGM && !t.visible && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                      textTransform: 'uppercase', padding: '1px 7px', borderRadius: 999,
                      background: 'rgba(196,51,33,0.1)', color: 'var(--coral)',
                      border: '1px solid var(--coral)' }}>oculto</span>
                  )}
                </div>
                {t.origin && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)',
                    letterSpacing: '0.06em', marginBottom: 10 }}>↳ {t.origin}</div>
                )}

                {/* Stats */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {[['HP', t.hp], ['DEF', t.defesa], ['ARM', t.armadura], ['DANO', t.dano], ['SEC', t.securityAttack]].map(([k, v]) => (
                    <div key={k as string} style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                      padding: '3px 10px', borderRadius: 6, background: 'var(--paper-deep)',
                      border: '1px solid var(--line-soft)' }}>
                      <span style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.08em',
                        textTransform: 'uppercase' }}>{k} </span>
                      <span style={{ fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 10px',
                    borderRadius: 6, background: 'var(--paper-deep)', border: '1px solid var(--line-soft)',
                    color: 'var(--ink-mute)' }}>
                    🏃 {t.deslocamento}
                  </div>
                </div>

                {t.dados && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)',
                    marginBottom: 6 }}>📊 {t.dados} · alcance {t.alcance}</div>
                )}

                {t.effect && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>{t.effect}</div>
                )}

                {t.autoConditions.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {t.autoConditions.map((c, i) => (
                      <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 999, letterSpacing: '0.06em',
                        background: `rgba(var(--${c.color}-rgb, 100,100,100), 0.12)`,
                        color: `var(--${c.color})`, border: `1px solid var(--${c.color})` }}>
                        {c.label} ({c.filled}/{c.max})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Ações GM */}
              {isGM && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggleVisible(t.id)}
                    style={{ padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      border: `1px solid ${t.visible ? 'var(--teal)' : 'var(--line)'}`,
                      background: t.visible ? 'var(--teal)' : 'transparent',
                      color: t.visible ? '#f6f2e9' : 'var(--ink-mute)' }}>
                    {t.visible ? '👁 visível' : '👁 oculto'}
                  </button>
                  <button onClick={() => { setEditing(t.id); setDraft({ ...t }) }}
                    style={{ padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                      border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-mute)' }}>
                    ✎ editar
                  </button>
                  <button onClick={() => deleteToken(t.id)}
                    style={{ padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                      border: '1px solid var(--line)', background: 'transparent', color: 'var(--coral)' }}>
                    × remover
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GogglePage({ state, onUpdate, canEdit, isGM = false }: Props) {
  const [open,  setOpen]  = useState<SheetSubject | null>(null)
  const [modal, setModal] = useState<'sector'|'bugfolder'|null>(null)
  const [tab,   setTab]   = useState<'setores'|'bugs'|'signs'|'tokens'>('setores')

  const sectors    = state.sectors    ?? []
  const bugFolders = state.bugFolders ?? []
  const signs      = state.signs      ?? []

  const digimonsBySetor = useMemo(() => {
    const map = new Map<number, DigimonLine[]>()
    sectors.forEach(s => map.set(s.n, []))
    state.bestiary.forEach(d => {
      d.sectors.forEach(sn => {
        if (map.has(sn)) map.get(sn)!.push(d)
      })
    })
    return map
  }, [state.bestiary, sectors])

  const bugsByFolder = useMemo(() => {
    const map = new Map<string, Bug[]>()
    bugFolders.forEach(f => map.set(`${f.cls}.${f.color}`, []))
    state.bugs.forEach(b => {
      const key = `${b.class}.${b.color}`
      if (map.has(key)) map.get(key)!.push(b)
    })
    return map
  }, [state.bugs, bugFolders])

  const deleteSector    = (n: number) =>
    onUpdate({ ...state, sectors: state.sectors.filter(s => s.n !== n) })
  const deleteBugFolder = (cls: string, color: string) =>
    onUpdate({ ...state, bugFolders: state.bugFolders.filter(f => !(f.cls === cls && f.color === color)) })

  const wildCount      = state.bestiary.filter(d => !d.tamerId).length
  const tamerDigiCount = state.bestiary.filter(d => d.tamerId).length

  return (
    <div className={styles.page}>
      <PageHead title="Goggle Girl" tag="tudo que foi visto, anotado e catalogado" pageId="goggle" />

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={`${styles.tabBtn} ${tab==='setores'?styles.tabActive:''}`} onClick={()=>setTab('setores')}>
            Setores <span className={styles.tabCount}>{sectors.length}</span>
          </button>
          <button className={`${styles.tabBtn} ${tab==='bugs'?styles.tabActive:''}`} onClick={()=>setTab('bugs')}>
            BUGs <span className={styles.tabCount}>{bugFolders.length}</span>
          </button>
          <button className={`${styles.tabBtn} ${tab==='signs'?styles.tabActive:''}`} onClick={()=>setTab('signs')}>
            SIGNs <span className={styles.tabCount}>{signs.length}</span>
          </button>
          <button className={`${styles.tabBtn} ${tab==='tokens'?styles.tabActive:''}`} onClick={()=>setTab('tokens')}>
            Tokens <span className={styles.tabCount}>{(state.tokenDefs ?? []).length}</span>
          </button>
        </div>
        <div className={styles.actions}>
          {isGM && tab === 'setores' && <button className={styles.btnGhost} style={{fontSize:12}} onClick={()=>setModal('sector')}>+ Pasta de Setor</button>}
          {isGM && tab === 'bugs'    && <button className={styles.btnGhost} style={{fontSize:12}} onClick={()=>setModal('bugfolder')}>+ Pasta de BUG</button>}
        </div>
      </div>

      {tab === 'setores' && (
        <div className={styles.section}>
          <div className={styles.sectionNote}>
            {wildCount} selvagens · {tamerDigiCount} parceiros registrados
          </div>
          {sectors.map(s => (
            <SectorFolderComp key={s.n} sector={s}
              digimons={digimonsBySetor.get(s.n) ?? []}
              state={state} onUpdate={onUpdate} onOpen={setOpen}
              onDeleteFolder={() => deleteSector(s.n)} isGM={isGM} />
          ))}
          {sectors.length === 0 && (
            <div className={styles.emptyState}>~ nenhuma pasta de setor criada ~<br/><small>Use "+ Pasta de Setor" para começar.</small></div>
          )}
        </div>
      )}

      {tab === 'bugs' && (
        <div className={styles.section}>
          <div className={styles.sectionNote}>{state.bugs.length} bugs registrados</div>
          {bugFolders.map(f => (
            <BugFolderComp key={`${f.cls}.${f.color}`} folder={f}
              bugs={bugsByFolder.get(`${f.cls}.${f.color}`) ?? []}
              state={state} onUpdate={onUpdate} onOpen={setOpen}
              onDeleteFolder={() => deleteBugFolder(f.cls, f.color)} isGM={isGM} />
          ))}
          {bugFolders.length === 0 && (
            <div className={styles.emptyState}>~ nenhuma pasta de BUG criada ~<br/><small>Use "+ Pasta de BUG" para começar.</small></div>
          )}
        </div>
      )}

      {tab === 'signs' && (
        <SignsTab state={state} onUpdate={onUpdate} onOpen={setOpen} isGM={isGM} />
      )}

      {tab === 'tokens' && (
        <TokensTab state={state} onUpdate={onUpdate} isGM={isGM} />
      )}

      {open && <SheetModal subject={open} state={state} onSaveState={onUpdate} onClose={() => setOpen(null)}
        editable={canEdit ? canEdit() : true} isGM={isGM} />}
      {modal === 'sector'    && <AddSectorModal    state={state} onSave={s=>{onUpdate(s);setModal(null)}} onClose={()=>setModal(null)} />}
      {modal === 'bugfolder' && <AddBugFolderModal state={state} onSave={s=>{onUpdate(s);setModal(null)}} onClose={()=>setModal(null)} />}
    </div>
  )
}