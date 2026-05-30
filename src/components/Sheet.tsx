import React, { useState, useMemo } from 'react'
import type { AppState, Tamer, DigimonLine, Bug, Sign, Survivor } from '../types'
import { BASE_KEYWORDS, BASE_CONDITIONS, getEffectiveClimas } from '../data/rulesData'
import {
  findTamer, findDigimon, findBug,
  makeEmptyStage, DIGIMON_DEFAULT_IMAGES, getVisLevel,
} from '../data/store'
import { findSurvivor } from '../data/domain'
import { uploadImage, saveStateToDB } from '../lib/db'
import { useSettings } from '../lib/settings'
import { GrainFill } from './GrainFill'
import styles from './Sheet.module.css'

import { DisplayModeCtx, KeywordTipsCtx } from './sheet/shared/contexts'
import { KEYWORD_TIPS } from './sheet/shared/utils'
import { ImageUploadZone } from './sheet/shared/components'
import { TamerView, DigiviceInventoryTab } from './sheet/TamerView'
import { DigimonStageView, BugView, SignView } from './sheet/DigimonView'
import { SurvivorView, SurvivorLoreTab, SurvivorInventoryTab } from './sheet/SurvivorView'

// ── Re-exports (API pública preservada) ────────────────────────────
export type { SheetSubject, TokenSpawn } from './sheet/shared/types'
export { parseTokenSpawns } from './sheet/shared/utils'

import type { SheetSubject, TokenSpawn } from './sheet/shared/types'

// ── FullSheet ──────────────────────────────────────────────────────
interface FullSheetProps {
  subject: SheetSubject
  state: AppState
  onSaveState?: (s: AppState) => void
  onClose?: () => void
  editable?: boolean
  isGM?: boolean
  nameOnly?: boolean
  onSpawnToken?: (token: TokenSpawn) => void
  wide?: boolean
}

export function FullSheet({ subject, state, onSaveState, onClose, editable = false, isGM = false, nameOnly = false, onSpawnToken, wide = false }: FullSheetProps) {
  const { kind } = subject
  let tamer:    Tamer | undefined
  let line:     DigimonLine | undefined
  let bug:      Bug | undefined
  let sign:     Sign | undefined
  let survivor: Survivor | undefined

  if (kind === 'tamer')    { tamer = findTamer(state, (subject as any).id); if (tamer?.digimonId) line = findDigimon(state, tamer.digimonId) }
  if (kind === 'pair')     { tamer = findTamer(state, (subject as any).tamerId); line = findDigimon(state, (subject as any).digimonId) }
  if (kind === 'wild' || kind === 'digimon') line = findDigimon(state, (subject as any).id)
  if (kind === 'bug')      bug      = findBug(state, (subject as any).id)
  if (kind === 'sign')     sign     = (state.signs ?? []).find(sg => sg.id === (subject as any).id)
  if (kind === 'survivor') survivor = findSurvivor(state, (subject as any).id)

  const tabs: { id: string; label: string; locked?: boolean; hidden?: boolean }[] = []
  if (tamer)    tabs.push({ id: 'tamer',    label: tamer.name })
  if (tamer)    tabs.push({ id: 'inventario', label: 'Inventário' })
  if (survivor) tabs.push({ id: 'survivor', label: survivor.name })
  if (survivor) tabs.push({ id: 'sv-info', label: 'Informações' })
  if (survivor) tabs.push({ id: 'sv-inventario', label: 'Inventário' })
  if (line)  line.stages.forEach((s,i) => {
    if (s.hidden && !isGM) return
    tabs.push({ id:`stage-${i}`, label: s.stageName, locked: s.locked, hidden: s.hidden })
  })
  if (bug)   tabs.push({ id:'bug', label: bug.name })
  if (sign)  tabs.push({ id:'sign', label: sign.code })

  const initial = (kind === 'pair' && (subject as any).stage != null) ? `stage-${(subject as any).stage}` : tabs[0]?.id ?? ''
  const [active, setActive] = useState(initial)
  const { settings } = useSettings()
  const displayMode = settings.sheetDotMode
  const [showDelete, setShowDelete] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')

  // Mescla tips estáticos com keywords/condições/climas do GM (precisa ficar
  // antes de qualquer early return para a ordem de hooks não mudar).
  const mergedTips = useMemo(() => {
    const effectiveKeywords   = (state.customKeywords   ?? []).length > 0 ? state.customKeywords   : BASE_KEYWORDS
    const effectiveConditions = (state.customConditions ?? []).length > 0 ? state.customConditions : BASE_CONDITIONS
    const effectiveClimas     = getEffectiveClimas(state.customClimas ?? [])
    const map: Record<string, string> = { ...KEYWORD_TIPS }
    for (const kw of effectiveKeywords)   map[kw.keyword] = kw.desc
    for (const cd of effectiveConditions) map[cd.name]    = cd.desc
    for (const cl of effectiveClimas)     map[cl.name]    = cl.effects.map(e => `${e.tag}: ${e.desc}`).join(' · ')
    return map
  }, [state.customKeywords, state.customConditions, state.customClimas])

  if (!tabs.length) return <div style={{ padding:32, color:'var(--ink-mute)' }}>Ficha não encontrada.</div>

  const showTamer = active === 'tamer' && !!tamer
  const stageIdx  = active.startsWith('stage-') ? parseInt(active.slice(6)) : null
  const showBug   = active === 'bug' && !!bug

  let headPortrait = 'sage', headName = '—', headMeta = '—', headImage: string | null = null
  if (tamer) {
    headPortrait = tamer.portrait; headName = tamer.name; headImage = tamer.image
    headMeta = [tamer.surname, tamer.age && `${tamer.age} anos`, tamer.sign, tamer.height && `${tamer.height} cm`, tamer.voice].filter(Boolean).join(' · ')
  } else if (survivor) {
    headPortrait = survivor.portrait; headName = survivor.name; headImage = survivor.image ?? null
    headMeta = [survivor.surname, survivor.age && `${survivor.age} anos`, survivor.sign, survivor.height && `${survivor.height} cm`, survivor.voice].filter(Boolean).join(' · ') || 'Survivor'
  } else if (line) {
    const displayIdx = stageIdx ?? line.currentStage
    const curS = line.stages[displayIdx] ?? line.stages[1] ?? line.stages[0]
    headPortrait = curS?.portrait ?? 'sage'
    headName = line.name
    // Imagem: prefere a do estágio ativo, cai para a da line (uploads antigos)
    headImage = curS?.image ?? line.image ?? (DIGIMON_DEFAULT_IMAGES?.[`${line.id}:${displayIdx}`] ?? null)
    headMeta = line.lore || curS?.type || '—'
  } else if (bug) {
    headPortrait = `bug-${bug.color}`; headName = bug.name; headImage = bug.image
    headMeta = `${bug.class}.${bug.color} · Setor ${bug.sectors.join(', ')}`
  } else if (sign) {
    headPortrait = 'indigo'; headName = sign.name; headImage = sign.image
    headMeta = sign.code
  }

  const saveTamer    = (t: Tamer) => onSaveState?.({ ...state, tamers: state.tamers.map(x => x.id===t.id?t:x) })
  const saveSurvivor = (s: Survivor) => onSaveState?.({ ...state, survivors: (state.survivors ?? []).map(x => x.id===s.id?s:x) })
  const handleDeleteTamer = () => {
    if (!tamer || deleteInput !== tamer.name) return
    onSaveState?.({ ...state, tamers: state.tamers.filter(t => t.id !== tamer!.id) })
    onClose?.()
  }
  const handleDeleteSurvivor = () => {
    if (!survivor || deleteInput !== survivor.name) return
    onSaveState?.({ ...state, survivors: (state.survivors ?? []).filter(s => s.id !== survivor!.id) })
    onClose?.()
  }
  const saveLine  = (l: DigimonLine) => onSaveState?.({ ...state, bestiary: state.bestiary.map(x => x.id===l.id?l:x) })
  const saveBug   = (b: Bug) => onSaveState?.({ ...state, bugs: state.bugs.map(x => x.id===b.id?b:x) })
  const saveSign  = (sg: Sign) => onSaveState?.({ ...state, signs: (state.signs ?? []).map(x => x.id===sg.id?sg:x) })
  const saveAllAutoridade = (autoridade: number) => onSaveState?.({
    ...state,
    tamers: state.tamers.map(x => ({ ...x, status: { ...x.status, Autoridade: autoridade } }))
  })
  const saveImage = async (dataUrl: string) => {
    if (tamer) {
      const url = await uploadImage(dataUrl, tamer.id)
      const toStorage = url != null && !url.startsWith('data:')
      const imageKey = toStorage ? (url!.split('/').pop() ?? null) : null
      const newTamer = { ...tamer, image: url ?? dataUrl, imageKey }
      const newState = { ...state, tamers: state.tamers.map(x => x.id === newTamer.id ? newTamer : x) }
      onSaveState?.(newState)
      if (toStorage) void saveStateToDB(newState)
    } else if (line) {
      const displayIdx = stageIdx ?? line.currentStage
      const stId = `${line.id}-stage-${displayIdx}`
      const url = await uploadImage(dataUrl, stId)
      const toStorage = url != null && !url.startsWith('data:')
      const imageKey = toStorage ? (url!.split('/').pop() ?? null) : null
      const newStages = line.stages.map((s, i) =>
        i === displayIdx ? { ...s, image: url ?? dataUrl, imageKey } : s
      )
      const newLine = { ...line, stages: newStages }
      const newState = { ...state, bestiary: state.bestiary.map(x => x.id === newLine.id ? newLine : x) }
      onSaveState?.(newState)
      if (toStorage) void saveStateToDB(newState)
    }
    else if (survivor) {
      const url = await uploadImage(dataUrl, survivor.id)
      const toStorage = url != null && !url.startsWith('data:')
      const imageKey = toStorage ? (url!.split('/').pop() ?? null) : null
      const newSurvivor = { ...survivor, image: url ?? dataUrl, imageKey }
      const newState = { ...state, survivors: (state.survivors ?? []).map(x => x.id === newSurvivor.id ? newSurvivor : x) }
      onSaveState?.(newState)
      if (toStorage) void saveStateToDB(newState)
    }
    else if (bug)  saveBug({ ...bug, image: dataUrl })
    else if (sign) saveSign({ ...sign, image: dataUrl })
  }

  if (nameOnly) {
    return (
      <div className={styles.sheet}>
        <div className={styles.sheetHead}>
          <div className={styles.portrait} style={{ position:'relative' }}><GrainFill color={headPortrait} image={headImage} /></div>
          <div style={{ flex:1, minWidth:0 }}>
            <h2 className={styles.headName}>{headName}</h2>
            <div className={styles.headMeta} style={{ fontStyle:'italic', color:'var(--ink-mute)' }}>~ informações restritas ~</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <KeywordTipsCtx.Provider value={mergedTips}>
    <DisplayModeCtx.Provider value={displayMode}>
    <div className={styles.sheet}>
      <div className={styles.sheetHead}>
        {editable
          ? <ImageUploadZone image={headImage} onUpload={saveImage} size={80} />
          : <div className={styles.portrait} style={{ position:'relative' }}><GrainFill color={headPortrait} image={headImage} /></div>
        }
        <div style={{ flex:1, minWidth:0 }}>
          <h2 className={styles.headName}>{headName}</h2>
          <div className={styles.headMeta}>{headMeta}</div>
          {tamer?.tagline && <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:17, color:'var(--ink-soft)', marginTop:4 }}>~ {tamer.tagline} ~</div>}
          {survivor?.tagline && <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:16, color:'var(--ink-soft)', marginTop:4 }}>~ {survivor.tagline} ~</div>}
          {bug?.lore && <div style={{ fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:15, color:'var(--ink-soft)', marginTop:4 }}>~ {bug.lore} ~</div>}
        </div>
      </div>

      <div className={styles.tabs}>
        {tabs.length > 1 && tabs.map(t => (
          <button key={t.id} className={`${styles.tab} ${active===t.id?styles.tabActive:''}`}
            onClick={() => setActive(t.id)}
            style={t.locked ? { fontStyle:'italic', opacity:0.5 } : t.hidden ? { fontStyle:'italic', opacity:0.7, color:'var(--coral)' } : undefined}>
            {t.label}{t.hidden ? ' 🔒' : ''}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, paddingRight:8, borderLeft: tabs.length > 1 ? '1px solid var(--line-soft)' : 'none', paddingLeft:8 }}>
          {editable && isGM && line && (
            <button
              onClick={() => {
                const newStage = { ...makeEmptyStage('???', '???', '—', false), hidden: true }
                const updated = { ...line, stages: [...line.stages, newStage] }
                saveLine(updated)
                setActive(`stage-${line.stages.length}`)
              }}
              title="Adicionar evolução oculta"
              style={{ background:'transparent', border:'1px solid var(--line)', borderRadius:6, cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.08em', color:'var(--ink-mute)', padding:'3px 8px', lineHeight:1, transition:'all 0.15s' }}>
              + Estágio
            </button>
          )}
        </div>
      </div>

      <div className={styles.sheetBody}>
        {showTamer && <TamerView tamer={tamer!} line={line} editable={editable} isGM={isGM} onSave={saveTamer} onSaveLine={saveLine} onSaveAll={saveAllAutoridade} state={state} onSaveState={onSaveState} onSpawnToken={onSpawnToken} wide={wide} />}
        {active === 'inventario' && tamer && <DigiviceInventoryTab tamerId={tamer.id} editable={editable} isGM={isGM} />}
        {active === 'survivor' && survivor && <SurvivorView sv={survivor} editable={editable} isGM={isGM} onSave={saveSurvivor} state={state} wide={wide} />}
        {active === 'sv-info' && survivor && <SurvivorLoreTab sv={survivor} editable={editable} isGM={isGM} onSave={saveSurvivor} />}
        {active === 'sv-inventario' && survivor && <SurvivorInventoryTab sv={survivor} editable={editable} onSave={saveSurvivor} />}
        {stageIdx !== null && line && (
          <DigimonStageView line={line} stageIdx={stageIdx} tamer={tamer} editable={editable} isGM={isGM} onSaveLine={saveLine} onSaveTamer={tamer ? saveTamer : undefined}
            onDeleteStage={editable && isGM ? () => {
              const newStages = line.stages.filter((_,i) => i !== stageIdx)
              saveLine({ ...line, stages: newStages })
              setActive(stageIdx > 0 ? `stage-${stageIdx - 1}` : (tamer ? 'tamer' : 'stage-0'))
            } : undefined} />
        )}
        {showBug && <BugView bug={bug!} editable={editable} onSave={saveBug} />}
        {active === 'sign' && sign && <SignView sign={sign} editable={editable} onSave={saveSign} />}
      </div>

      {/* Zona de exclusão — survivor */}
      {active === 'survivor' && survivor && isGM && editable && (
        <div style={{ borderTop: '1px solid var(--line-soft)', padding: '20px 32px 24px', marginTop: 8 }}>
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)}
              style={{ padding: '6px 16px', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
                textTransform: 'uppercase', border: '1px solid var(--line)',
                background: 'transparent', color: 'var(--ink-mute)' }}>
              ⚠ Excluir survivor
            </button>
          ) : (
            <div style={{ padding: '16px', borderRadius: 10, border: '2px solid var(--coral)', background: 'rgba(196,51,33,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 8, fontWeight: 700 }}>
                ⚠ Excluir permanentemente
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
                Digite <strong>{survivor.name}</strong> para confirmar.
              </div>
              <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder={survivor.name}
                style={{ width: '100%', marginBottom: 12, padding: '8px 12px', border: '1px solid var(--coral)', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, background: 'var(--paper)', color: 'var(--ink)', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDeleteSurvivor} disabled={deleteInput !== survivor.name}
                  style={{ padding: '8px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13,
                    border: '1px solid var(--coral)', background: deleteInput === survivor.name ? 'var(--coral)' : 'transparent',
                    color: deleteInput === survivor.name ? 'var(--paper)' : 'var(--coral)', opacity: deleteInput !== survivor.name ? 0.5 : 1 }}>
                  Confirmar exclusão
                </button>
                <button onClick={() => { setShowDelete(false); setDeleteInput('') }}
                  style={{ padding: '8px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zona de exclusão — apenas GM, apenas aba do tamer */}
      {showTamer && isGM && editable && (
        <div style={{ borderTop: '1px solid var(--line-soft)', padding: '20px 32px 24px',
          marginTop: 8 }}>
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)}
              style={{ padding: '6px 16px', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
                textTransform: 'uppercase', border: '1px solid var(--line)',
                background: 'transparent', color: 'var(--ink-mute)' }}>
              ⚠ Excluir personagem
            </button>
          ) : (
            <div style={{ padding: '16px', borderRadius: 10,
              border: '2px solid var(--coral)', background: 'rgba(196,51,33,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 8,
                fontWeight: 700 }}>
                ⚠ Excluir permanentemente
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13,
                color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
                Esta ação remove o tamer do estado e não pode ser desfeita.
                Digite <strong>{tamer!.name}</strong> para confirmar.
              </div>
              <input
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder={tamer!.name}
                style={{ width: '100%', marginBottom: 12, padding: '8px 12px',
                  border: '1px solid var(--coral)', borderRadius: 8,
                  fontFamily: 'var(--font-body)', fontSize: 14,
                  background: 'var(--paper)', color: 'var(--ink)',
                  boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDeleteTamer}
                  disabled={deleteInput !== tamer!.name}
                  style={{ padding: '8px 18px', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13,
                    border: '1px solid var(--coral)',
                    background: deleteInput === tamer!.name ? 'var(--coral)' : 'transparent',
                    color: deleteInput === tamer!.name ? 'var(--paper)' : 'var(--coral)',
                    opacity: deleteInput !== tamer!.name ? 0.5 : 1 }}>
                  Confirmar exclusão
                </button>
                <button onClick={() => { setShowDelete(false); setDeleteInput('') }}
                  style={{ padding: '8px 18px', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'var(--font-body)', fontSize: 13,
                    border: '1px solid var(--line)', background: 'transparent',
                    color: 'var(--ink-soft)' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </DisplayModeCtx.Provider>
    </KeywordTipsCtx.Provider>
  )
}

// ── Modal wrapper ──────────────────────────────────────────────────
export function SheetModal({ subject, state, onSaveState, onClose, editable, isGM, onSpawnToken }: {
  subject: SheetSubject | null; state: AppState; onSaveState?: (s: AppState) => void
  onClose: () => void; editable?: boolean; isGM?: boolean; onSpawnToken?: (token: TokenSpawn) => void
}) {
  const { settings } = useSettings()
  const wide = settings.sheetView === 'horizontal'
  if (!subject) return null

  let nameOnly = false
  if (!isGM) {
    if (subject.kind === 'wild' || subject.kind === 'digimon') {
      nameOnly = getVisLevel(state, 'bestiary', (subject as any).id) === 'name'
    } else if (subject.kind === 'pair') {
      nameOnly = getVisLevel(state, 'bestiary', (subject as any).digimonId) === 'name'
    } else if (subject.kind === 'bug') {
      nameOnly = getVisLevel(state, 'bug', (subject as any).id) === 'name'
    } else if (subject.kind === 'sign') {
      nameOnly = getVisLevel(state, 'sign', (subject as any).id) === 'name'
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={wide ? { maxWidth: '95vw', width: '95vw', padding: 0 } : undefined}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">×</button>
        <FullSheet subject={subject} state={state} onSaveState={onSaveState} onClose={onClose} editable={editable} isGM={isGM} nameOnly={nameOnly} onSpawnToken={onSpawnToken} wide={wide} />
      </div>
    </div>
  )
}
