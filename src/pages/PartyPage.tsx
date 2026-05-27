import { useState, useCallback } from 'react'
import type { AppState, Tamer, Survivor } from '../types'
import { PORTRAIT_LIST } from '../types'
import { findDigimon, makeTamer, makeSlimLine } from '../data/store'
import { makeSurvivor } from '../data/domain'
import { uploadImage, saveStateToDB } from '../lib/db'
import { PageHead } from '../components/PageHead'
import { GrainFill } from '../components/GrainFill'
import { SheetModal } from '../components/Sheet'
import type { SheetSubject } from '../components/Sheet'
import { useSettings } from '../lib/settings'
import styles from './PartyPage.module.css'

interface Props {
  state: AppState
  onUpdate: (s: AppState) => void
  canEdit?: (tamerId?: string) => boolean
  isGM?: boolean
}

function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function importJson<T>(onLoad: (data: T) => void) {
  const input    = document.createElement('input')
  input.type     = 'file'; input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = e => { try { onLoad(JSON.parse(e.target?.result as string) as T) } catch { alert('Arquivo inválido.') } }
    reader.readAsText(file)
  }
  input.click()
}

// ── XP Global Panel ────────────────────────────────────────────────
function XpGlobalPanel({ state, onUpdate }: Props) {
  const [open, setOpen]     = useState(false)
  const [amount, setAmount] = useState('')
  const [custom, setCustom] = useState<Record<string, string>>({})

  const val = parseInt(amount) || 0

  const distribute = () => {
    if (val <= 0) return
    const newTamers = state.tamers.map(t => ({
      ...t, xp: t.xp + (parseInt(custom[t.id]) >= 0 ? parseInt(custom[t.id]) : val)
    }))
    onUpdate({ ...state, tamers: newTamers })
    setAmount(''); setCustom({}); setOpen(false)
  }

  if (!open) return (
    <button className={styles.xpGlobalBtn} onClick={() => setOpen(true)}>
      ✦ Distribuir XP para a party
    </button>
  )

  return (
    <div className={styles.xpPanel}>
      <div className={styles.xpPanelHead}>
        <h3 className={styles.xpPanelTitle}>Distribuição de XP</h3>
        <button className={styles.closeSmall} onClick={() => setOpen(false)}>×</button>
      </div>

      <div className={styles.xpPanelRow}>
        <div>
          <label className={styles.fieldLabel}>XP base (para todos)</label>
          <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="ex: 5" className={styles.fieldInput} style={{ width: 100 }} />
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)', paddingBottom:8 }}>
          O digimon usa o XP do seu tamer.
        </div>
      </div>

      {val > 0 && (
        <div className={styles.xpMemberGrid}>
          <div className={styles.xpMemberHeader}>
            <span>Tamer</span><span>XP atual</span><span>Recebe</span>
          </div>
          {state.tamers.map(t => (
            <div key={t.id} className={styles.xpMemberRow}>
              <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:16, height:16, borderRadius:4, overflow:'hidden', position:'relative', flexShrink:0 }}>
                  <div className={`fill-${t.portrait}`} style={{ position:'absolute', inset:0 }}/>
                  <div className="grain" style={{ position:'absolute', inset:0 }}/>
                </div>
                {t.name}
                {t.digimonId && <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--ink-mute)' }}>+ digimon</span>}
              </span>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{t.xp}</span>
              <input type="number" min={0}
                value={custom[t.id] !== undefined ? custom[t.id] : val}
                onChange={e => setCustom(p => ({ ...p, [t.id]: e.target.value }))}
                className={styles.xpCustomInput} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <button className={styles.btnSolid} onClick={distribute} disabled={val <= 0}>
          Distribuir {val > 0 ? `+${val} XP` : ''}
        </button>
        <button className={styles.btnGhost} onClick={() => { setAmount(''); setCustom({}); setOpen(false) }}>Cancelar</button>
        {val > 0 && <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)' }}>
          {state.tamers.length} tamers · total ~{val * state.tamers.length} XP
        </span>}
      </div>
    </div>
  )
}

// ── Add Tamer Modal ────────────────────────────────────────────────
function AddTamerModal({ state, onSave, onClose }: { state: AppState; onSave: (s: AppState) => void; onClose: () => void }) {
  const [name, setName]       = useState('')
  const [surname, setSurname] = useState('')
  const [tagline, setTagline] = useState('')
  const [portrait, setPortrait] = useState<Tamer['portrait']>('sage')
  const [age, setAge]         = useState('17')
  const [height, setHeight]   = useState('170')
  const [sign, setSign]       = useState('')
  const [birthday, setBirthday] = useState('')
  const [voice, setVoice]     = useState('')
  const [digiName, setDigiName] = useState('')
  const [digiType, setDigiType] = useState('')

  const handleSubmit = () => {
    if (!name.trim()) return
    const id = `t-${name.toLowerCase().replace(/\s+/g,'-')}-${Date.now().toString(36)}`
    let digimonId: string | null = null
    let newBestiary = state.bestiary
    if (digiName.trim()) {
      const did = `d-${digiName.toLowerCase().replace(/\s+/g,'-')}-${Date.now().toString(36)}`
      digimonId = did
      newBestiary = [...state.bestiary, makeSlimLine(did, id, digiName.trim(), portrait, digiType || '—')]
    }
    const tamer: Tamer = {
      ...makeTamer(id, name.toUpperCase(), surname, portrait, parseInt(age)||17, parseInt(height)||170, sign||'—', digimonId),
      tagline, birthday: birthday||'—', voice: voice||'—',
    }
    onSave({ ...state, tamers: [...state.tamers, tamer], bestiary: newBestiary })
    onClose()
  }

  const inp = (lbl: string, val: string, set: (v:string)=>void, ph = '') => (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{lbl}</label>
      <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className={styles.fieldInput} />
    </div>
  )

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth:580 }} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <div className={styles.addForm}>
          <h2 className={styles.addTitle}>Novo Tamer</h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {inp('Nome *', name, setName, 'NAOKI')}
            {inp('Sobrenome', surname, setSurname, 'Mochizuki')}
          </div>
          {inp('Tagline', tagline, setTagline, 'Minha alma ruge.')}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            {inp('Idade', age, setAge, '17')}
            {inp('Altura (cm)', height, setHeight, '175')}
            {inp('Signo', sign, setSign, 'Capricórnio')}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {inp('Aniversário', birthday, setBirthday, '25 de Dezembro')}
            {inp('Voz', voice, setVoice, 'Yuuki Ono')}
          </div>
          <div style={{ background:'var(--paper-deep)', border:'1px solid var(--line-soft)', borderRadius:10, padding:'14px 16px', margin:'4px 0 12px' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--ink-mute)', marginBottom:10 }}>Digimon parceiro (opcional)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {inp('Nome do Digimon', digiName, setDigiName, 'Tinkermon')}
              {inp('Tipo', digiType, setDigiType, 'Fairy')}
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Cor do retrato</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
              {PORTRAIT_LIST.map(p => (
                <div key={p} onClick={() => setPortrait(p)}
                  style={{ width:30, height:30, borderRadius:6, overflow:'hidden', cursor:'pointer', position:'relative',
                    outline: portrait===p ? '2px solid var(--ink)' : 'none', outlineOffset:2 }}>
                  <GrainFill color={p} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button className={styles.btnSolid} onClick={handleSubmit}>Criar</button>
            <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Survivor Modal ─────────────────────────────────────────────
function AddSurvivorModal({ state, onSave, onClose }: { state: AppState; onSave: (s: AppState) => void; onClose: () => void }) {
  const [name, setName]         = useState('')
  const [surname, setSurname]   = useState('')
  const [tagline, setTagline]   = useState('')
  const [age, setAge]           = useState('')
  const [sign, setSign]         = useState('')
  const [birthday, setBirthday] = useState('')
  const [voice, setVoice]       = useState('')
  const [portrait, setPortrait] = useState<Survivor['portrait']>('rose')

  const handleSubmit = () => {
    if (!name.trim()) return
    const id = `sv-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`
    const sv: Survivor = {
      ...makeSurvivor(id, name.trim(), portrait),
      surname:  surname  || undefined,
      tagline:  tagline  || undefined,
      age:      age      || undefined,
      sign:     sign     || undefined,
      birthday: birthday || undefined,
      voice:    voice    || undefined,
    }
    onSave({ ...state, survivors: [...(state.survivors ?? []), sv] })
    onClose()
  }

  const inp = (lbl: string, val: string, set: (v: string) => void, ph = '') => (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{lbl}</label>
      <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className={styles.fieldInput} />
    </div>
  )

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <div className={styles.addForm}>
          <h2 className={styles.addTitle}>Novo Survivor</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {inp('Nome *', name, setName, 'Yahiro')}
            {inp('Sobrenome', surname, setSurname, 'Akugetsu')}
          </div>
          {inp('Tagline', tagline, setTagline, 'Aquela que carrega as cerejeiras')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {inp('Idade', age, setAge, '17')}
            {inp('Signo', sign, setSign, 'Áries')}
            {inp('Aniversário', birthday, setBirthday, '25 de Março')}
          </div>
          {inp('Voz', voice, setVoice, 'Yui Ishikawa')}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Cor do retrato</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {PORTRAIT_LIST.map(p => (
                <div key={p} onClick={() => setPortrait(p)}
                  style={{ width: 30, height: 30, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', position: 'relative',
                    outline: portrait === p ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }}>
                  <GrainFill color={p} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className={styles.btnSolid} onClick={handleSubmit}>Criar</button>
            <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PartyPage ──────────────────────────────────────────────────────
export default function PartyPage({ state, onUpdate, canEdit, isGM }: Props) {
  const [open, setOpen]         = useState<SheetSubject | null>(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [showAddSv, setShowAddSv] = useState(false)
  const { settings, update: updateSettings } = useSettings()
  const compactGrid = settings.partyCompact
  const setCompactGrid = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(compactGrid) : v
    updateSettings({ partyCompact: next })
  }

  const handleImageUpload = useCallback(async (tamerId: string, dataUrl: string) => {
    const url = await uploadImage(dataUrl, tamerId)
    const uploadedToStorage = url != null && !url.startsWith('data:')
    const ext = dataUrl.match(/data:image\/([^;]+);/)?.[1] ?? 'webp'
    const imageKey = uploadedToStorage ? `${tamerId}.${ext}` : null
    const newState = { ...state, tamers: state.tamers.map(t => t.id === tamerId ? { ...t, image: url ?? dataUrl, imageKey } : t) }
    onUpdate(newState)
    if (uploadedToStorage) void saveStateToDB(newState)
  }, [state, onUpdate])

  return (
    <div className={styles.page}>
      <PageHead title="Party" tag="Aqueles que carregam o sonho" pageId="party" />

      <div className={styles.toolbar}>
        <span className={styles.eyebrow}>{state.tamers.length} tamers · {state.bestiary.filter(d => d.tamerId).length} digimons · {(state.survivors ?? []).length} survivors</span>
        <div style={{ display:'flex', gap:8 }}>
          <button
            className={compactGrid ? styles.btnSolid : styles.btnGhost}
            style={{ fontSize:11, padding:'6px 14px' }}
            onClick={() => setCompactGrid(p => !p)}
            title="Alternar entre grid compacto (6 colunas) e grid normal">
            {compactGrid ? '⊞ Compacto' : '⊟ Normal'}
          </button>
          {isGM && <button className={styles.btnGhost} onClick={() => setShowAdd(true)}>+ Novo Tamer</button>}
          {isGM && <button className={styles.btnGhost} onClick={() => setShowAddSv(true)}>+ Survivor</button>}
        </div>
      </div>

      {/* Painel XP global */}
      {isGM && (
        <div style={{ padding:'0 56px 16px' }}>
          <XpGlobalPanel state={state} onUpdate={onUpdate} />
        </div>
      )}

      <div className={compactGrid ? styles.gridCompact : styles.grid}>
        {state.tamers.map(t => {
          const digi = t.digimonId ? findDigimon(state, t.digimonId) : null
          const cur  = digi ? (digi.stages[digi.currentStage] ?? digi.stages[1] ?? digi.stages[0]) : null
          return (
            <div key={t.id} className={styles.card} onClick={() => setOpen({ kind:'tamer', id:t.id })}>
              <div className={`${styles.portrait} fill-${t.portrait}`}>
                {t.image
                  ? <img key={t.image} src={t.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  : <div className="grain" />}
                <label className={styles.uploadHint} onClick={e => e.stopPropagation()}>
                  trocar foto
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                    const f = e.target.files?.[0]; if (!f) return
                    const r = new FileReader(); r.onload = ev => { handleImageUpload(t.id, ev.target?.result as string) }; r.readAsDataURL(f)
                  }} />
                </label>
              </div>
              <div className={styles.cardActions}>
                <button className={styles.cardActionBtn} title="Exportar ficha"
                  onClick={e => { e.stopPropagation(); exportJson(t, `tamer-${t.id}-${new Date().toISOString().slice(0,10)}.json`) }}>↓</button>
                <button className={styles.cardActionBtn} title="Importar ficha"
                  onClick={e => { e.stopPropagation(); importJson<typeof t>(imported => {
                    onUpdate({ ...state, tamers: state.tamers.map(x => x.id === t.id ? { ...imported, id: t.id } : x) })
                  }) }}>↑</button>
              </div>
              <div className={styles.info}>
                <h3 className={styles.name}>{t.name}</h3>
                <div className={styles.meta}>{t.age} anos · {t.sign} · {t.height} cm</div>
                <div className={styles.tagline}>~ {t.tagline} ~</div>
                <div className={styles.xpBar}>
                  <span className={styles.xpPill}>XP livre: <b>{t.xp}</b></span>
                </div>
                {digi ? (
                  <div className={styles.digiStrip}>
                    <div className={`${styles.mini} fill-${cur?.portrait ?? 'sage'}`} style={{ position:'relative', overflow:'hidden' }}>
                      {digi.image
                        ? <img src={digi.image} alt={digi.name} style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0 }} />
                        : <div className="grain" />}
                    </div>
                    <span className={styles.digiName}>{digi.name.replace(' Line','')} <span className={styles.dim}>· {digi.stages.length - 1} estágios</span></span>
                  </div>
                ) : (
                  <div className={styles.noDigi}>~ ainda sem digimon vinculado ~</div>
                )}
              </div>
            </div>
          )
        })}
        {/* Survivor cards */}
        {(state.survivors ?? []).map(sv => (
          <div key={sv.id} className={styles.card} onClick={() => setOpen({ kind: 'survivor', id: sv.id })}>
            <div className={`${styles.portrait} fill-${sv.portrait}`}>
              {sv.image
                ? <img key={sv.image} src={sv.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                : <div className="grain" />}
            </div>
            <div className={styles.info}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 2 }}>Survivor</div>
              <h3 className={styles.name}>{sv.name}</h3>
              {(sv.age || sv.sign) && <div className={styles.meta}>{[sv.age && `${sv.age} anos`, sv.sign].filter(Boolean).join(' · ')}</div>}
              {sv.tagline && <div className={styles.tagline}>~ {sv.tagline} ~</div>}
              <div className={styles.xpBar} style={{ display: 'flex', gap: 8 }}>
                <span className={styles.xpPill}>HP: <b>{sv.status.HP.v}/{sv.status.HP.max}</b></span>
                <span className={styles.xpPill}>DS: <b>{sv.status.Digisoul.v}/{sv.status.Digisoul.max}</b></span>
              </div>
            </div>
          </div>
        ))}
        {isGM && <div className={styles.addCard} onClick={() => setShowAdd(true)}>+ Novo Tamer</div>}
      </div>

      {open && <SheetModal subject={open} state={state} onSaveState={onUpdate} onClose={() => setOpen(null)}
        editable={canEdit ? canEdit(open.kind === 'tamer' ? (open as any).id : undefined) : true} isGM={isGM} />}
      {showAdd && <AddTamerModal state={state} onSave={s => { onUpdate(s); setShowAdd(false) }} onClose={() => setShowAdd(false)} />}
      {showAddSv && <AddSurvivorModal state={state} onSave={s => { onUpdate(s); setShowAddSv(false) }} onClose={() => setShowAddSv(false)} />}
    </div>
  )
}
