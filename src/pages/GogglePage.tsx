import React, { useState, useMemo } from 'react'
import type { AppState, DigimonLine, Bug, Sign, SectorFolder, BugFolder as BugFolderType } from '../types'
import { BUG_COLORS, PORTRAIT_LIST } from '../types'
import { makeWildDigimon, makeBug, makeSign } from '../data/store'
import { PageHead } from '../components/PageHead'
import { GrainFill } from '../components/GrainFill'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import styles from './GogglePage.module.css'

interface Props { state: AppState; onUpdate: (s: AppState) => void }

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
  d: DigimonLine; onClick: () => void; onDelete: (e: React.MouseEvent) => void
  onExport: (e: React.MouseEvent) => void; onImport: (e: React.MouseEvent) => void
}) {
  const s = d.stages[d.currentStage ?? 0] ?? d.stages[0]
  return (
    <div className={styles.card} onClick={onClick}>
      <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>
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
  b: Bug; onClick: () => void; onDelete: (e: React.MouseEvent) => void
  onExport: (e: React.MouseEvent) => void; onImport: (e: React.MouseEvent) => void
}) {
  return (
    <div className={styles.card} onClick={onClick}>
      <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>
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
  sg: Sign; onClick: () => void; onDelete: (e: React.MouseEvent) => void
  onExport: (e: React.MouseEvent) => void; onImport: (e: React.MouseEvent) => void
}) {
  return (
    <div className={styles.card} onClick={onClick}>
      <button className={styles.cardDel} onClick={onDelete} title="Remover">×</button>
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
function SectorFolderComp({ sector, digimons, state, onUpdate, onOpen, onDeleteFolder }: {
  sector: SectorFolder; digimons: DigimonLine[];
  state: AppState; onUpdate: (s: AppState) => void;
  onOpen: (s: SheetSubject) => void; onDeleteFolder: () => void
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
            <button className={styles.btnGhost} style={{fontSize:11}} onClick={e=>{e.stopPropagation();setAddWild(true)}}>+ Digimon</button>
            <button className={styles.btnGhost} style={{fontSize:11}} onClick={e=>{e.stopPropagation();const f=document.createElement('input');f.type='file';f.accept='.json';f.onchange=()=>{const file=f.files?.[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target?.result as string) as DigimonLine;const id=`d-wild-${Date.now().toString(36)}`;const nd={...d,id,tamerId:null,sectors:[...new Set([...d.sectors,sector.n])]};onUpdate({...state,bestiary:[...state.bestiary,nd]})}catch{alert('Arquivo inválido.')}};r.readAsText(file)};f.click()}}>↑ Importar</button>
            <button className={styles.btnGhost} style={{fontSize:11,marginLeft:'auto',color:'var(--coral)'}} onClick={e=>{e.stopPropagation();if(!confirm(`Remover a pasta do Setor ${sector.n}? Os digimons do setor não serão apagados.`))return;onDeleteFolder()}}>× Pasta</button>
          </div>
          {digimons.length === 0 && <div className={styles.empty}>~ nenhum digimon neste setor ~</div>}
          <div className={styles.cardGrid}>
            {digimons.map(d => (
              <DigiCard key={d.id} d={d}
                onClick={() => onOpen(d.tamerId ? { kind:'digimon', id: d.id } : { kind:'wild', id: d.id })}
                onDelete={(e) => deleteWild(d.id, e)}
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
function BugFolderComp({ folder, bugs, state, onUpdate, onOpen, onDeleteFolder }: {
  folder: BugFolderType; bugs: Bug[];
  state: AppState; onUpdate: (s: AppState) => void;
  onOpen: (s: SheetSubject) => void; onDeleteFolder: () => void
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
            <button className={styles.btnGhost} style={{fontSize:11}} onClick={e=>{e.stopPropagation();setAddBug(true)}}>+ BUG</button>
            <button className={styles.btnGhost} style={{fontSize:11}} onClick={e=>{e.stopPropagation();const f=document.createElement('input');f.type='file';f.accept='.json';f.onchange=()=>{const file=f.files?.[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const b=JSON.parse(ev.target?.result as string) as Bug;const id=`b-${folder.cls}-${Date.now().toString(36)}`;onUpdate({...state,bugs:[...state.bugs,{...b,id,class:folder.cls,color:folder.color}]})}catch{alert('Arquivo inválido.')}};r.readAsText(file)};f.click()}}>↑ Importar</button>
            <button className={styles.btnGhost} style={{fontSize:11,marginLeft:'auto',color:'var(--coral)'}} onClick={e=>{e.stopPropagation();if(!confirm(`Remover a pasta ${folder.cls}.${folder.color}? Os BUGs não serão apagados.`))return;onDeleteFolder()}}>× Pasta</button>
          </div>
          {bugs.length === 0 && <div className={styles.empty}>~ nenhum bug desta classe registrado ~</div>}
          <div className={styles.cardGrid}>
            {bugs.map(b => (
              <BugCard key={b.id} b={b}
                onClick={() => onOpen({ kind:'bug', id: b.id })}
                onDelete={(e) => deleteBug(b.id, e)}
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
function SignsTab({ state, onUpdate, onOpen }: { state: AppState; onUpdate: (s: AppState) => void; onOpen: (s: SheetSubject) => void }) {
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
        <button className={styles.btnGhost} style={{fontSize:12}} onClick={() => setAddSign(true)}>
          + Novo SIGN
        </button>
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
            onDelete={(e) => deleteSign(sg.id, e)}
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GogglePage({ state, onUpdate }: Props) {
  const [open,  setOpen]  = useState<SheetSubject | null>(null)
  const [modal, setModal] = useState<'sector'|'bugfolder'|null>(null)
  const [tab,   setTab]   = useState<'setores'|'bugs'|'signs'>('setores')

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
      <PageHead title="Goggle Girl" tag="tudo que foi visto, anotado e catalogado" />

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
        </div>
        <div className={styles.actions}>
          {tab === 'setores' && <button className={styles.btnGhost} style={{fontSize:12}} onClick={()=>setModal('sector')}>+ Pasta de Setor</button>}
          {tab === 'bugs'    && <button className={styles.btnGhost} style={{fontSize:12}} onClick={()=>setModal('bugfolder')}>+ Pasta de BUG</button>}
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
              onDeleteFolder={() => deleteSector(s.n)} />
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
              onDeleteFolder={() => deleteBugFolder(f.cls, f.color)} />
          ))}
          {bugFolders.length === 0 && (
            <div className={styles.emptyState}>~ nenhuma pasta de BUG criada ~<br/><small>Use "+ Pasta de BUG" para começar.</small></div>
          )}
        </div>
      )}

      {tab === 'signs' && (
        <SignsTab state={state} onUpdate={onUpdate} onOpen={setOpen} />
      )}

      {open && <SheetModal subject={open} state={state} onSaveState={onUpdate} onClose={() => setOpen(null)} editable />}
      {modal === 'sector'    && <AddSectorModal    state={state} onSave={s=>{onUpdate(s);setModal(null)}} onClose={()=>setModal(null)} />}
      {modal === 'bugfolder' && <AddBugFolderModal state={state} onSave={s=>{onUpdate(s);setModal(null)}} onClose={()=>setModal(null)} />}
    </div>
  )
}