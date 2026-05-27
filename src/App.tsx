// src/App.tsx
import { Suspense, lazy, useState, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { loadState, exportStateToFile, importStateFromFile } from './data/store'
import { loadStateFromDB, saveStateToDB, subscribeToState, migrateLocalToSupabase } from './lib/db'
import { signOut, canEditTamer } from './lib/auth'
import { AuthProvider, useAuth } from './components/AuthProvider'
import { SettingsProvider } from './lib/settings'
import { isSupabaseReady } from './lib/supabase'
import type { AppState } from './types'
import styles from './App.module.css'

// Ao falhar o carregamento de um chunk lazy (deploy novo, hash diferente),
// força reload para buscar o novo index.html com os hashes corretos.
const RELOAD_KEY = 'chunk_reload'
function lazyLoad<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch(() => {
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1')
        window.location.reload()
      }
      return new Promise<{ default: T }>(() => {})
    })
  )
}

const LoginPage     = lazyLoad(() => import('./pages/LoginPage'))
const HomePage      = lazyLoad(() => import('./pages/HomePage'))
const PartyPage     = lazyLoad(() => import('./pages/PartyPage'))
const GogglePage    = lazyLoad(() => import('./pages/GogglePage'))
const TeatroPage    = lazyLoad(() => import('./pages/TeatroPage'))
const SistemaPage   = lazyLoad(() => import('./pages/SistemaPage'))
const BackstagePage = lazyLoad(() => import('./pages/BackstagePage'))
const DigivicePage  = lazyLoad(() => import('./pages/DigivicePage'))
const DigiZapPage   = lazyLoad(() => import('./pages/DigiZapPage'))
const ViewerPage    = lazyLoad(() => import('./pages/ViewerPage'))
const SettingsPage  = lazyLoad(() => import('./pages/SettingsPage'))

function AppInner() {
  const { session, profile, loading, isGM, localMode, refresh } = useAuth()
  const [state, setState] = useState<AppState>(() => loadState())
  const [appReady, setAppReady] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [digizapUnread, setDigizapUnread] = useState(0)
  const realtimeUnsub  = useRef<(() => void) | null>(null)
  const lastSaveRef    = useRef(0)
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isGuest = !localMode && profile?.role === 'guest'

  useEffect(() => {
    if (loading) return
    if (isSupabaseReady && !session && !localMode) { setAppReady(true); return }
    loadStateFromDB().then(s => { setState(s); setAppReady(true) })
  }, [loading, session, localMode])

  useEffect(() => {
    if (!isSupabaseReady || !session) return
    realtimeUnsub.current?.()
    realtimeUnsub.current = subscribeToState(remoteState => {
      if (Date.now() - lastSaveRef.current < 3000) return
      setState(remoteState)
    })
    return () => { realtimeUnsub.current?.() }
  }, [session])

  // Avisa sobre mudanças não salvas ao fechar a aba
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Auto-save para Teatro/Palco (combate em tempo real)
  const onUpdate = useCallback((s: AppState) => {
    setState(s)
    lastSaveRef.current = Date.now()
    saveStateToDB(s)
  }, [])

  // Edição local — marca dirty e auto-salva após 1.5s de inatividade
  const onUpdateLocal = useCallback((s: AppState) => {
    setState(s)
    setIsDirty(true)
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      lastSaveRef.current = Date.now()
      void saveStateToDB(s).then(() => setIsDirty(false))
    }, 1500)
  }, [])

  const handleSave = useCallback(async () => {
    if (!isDirty) return
    setIsSaving(true)
    await saveStateToDB(state)
    setIsDirty(false)
    setIsSaving(false)
  }, [isDirty, state])

  const handleImport = async () => {
    const imported = await importStateFromFile()
    if (imported) {
      setState(imported)
      await saveStateToDB(imported)
    }
  }

  const handleMigrate = async () => {
    setMigrating(true); setMigrateResult(null)
    const { ok, error, imagesMigrated } = await migrateLocalToSupabase()
    setMigrating(false)
    setMigrateResult(ok
      ? `✓ Migração concluída — ${imagesMigrated} imagem(ns) migrada(s).`
      : `✗ Erro: ${error}`)
  }

  // GM pode editar qualquer ficha. Player só edita o próprio tamer. Guest não edita nada.
  const canEdit = useCallback((tamerId?: string) => {
    if (localMode) return true
    if (isGM) return true
    if (isGuest) return false
    if (!tamerId) return false
    return canEditTamer(profile, tamerId)
  }, [localMode, isGM, isGuest, profile])

  if (loading || !appReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'var(--font-mono)',
        fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--ink-mute)' }}>
        Carregando...
      </div>
    )
  }

  if (isSupabaseReady && !session && !localMode) {
    return <LoginPage onSuccess={refresh} />
  }

  const showSetupBanner = isSupabaseReady && session && !profile && !localMode

  // Digivice e DigiZap: apenas GM ou players com tamer vinculado (não guests)
  const canSeeDigivice = !isGuest && (localMode || isGM || !!profile?.tamer_id)
  const canSeeDigizap  = !isGuest && (localMode || isGM || !!profile?.tamer_id)
  const canSeeTeatro   = !isGuest

  const pageFallback = (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'var(--font-mono)',
      fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--ink-mute)' }}>
      Carregando...
    </div>
  )

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <NavLink to="/"         end className={({ isActive }) => isActive ? styles.active : ''}>Início</NavLink>
        <NavLink to="/party"        className={({ isActive }) => isActive ? styles.active : ''}>Party</NavLink>
        <NavLink to="/goggle"       className={({ isActive }) => isActive ? styles.active : ''}>Goggle Girl</NavLink>
        {canSeeTeatro && (
          <NavLink to="/teatro"     className={({ isActive }) => isActive ? styles.active : ''}>Teatro</NavLink>
        )}
        <NavLink to="/sistema"      className={({ isActive }) => isActive ? styles.active : ''}>Sistema</NavLink>
        {canSeeDigivice && (
          <NavLink to="/digivice"   className={({ isActive }) => isActive ? styles.active : ''}>Digivice</NavLink>
        )}
        {canSeeDigizap && (
          <NavLink to="/digizap"    className={({ isActive }) => isActive ? styles.active : ''}
            style={{ position: 'relative' }}>
            Digi-Zap
            {digizapUnread > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -10,
                minWidth: 16, height: 16, borderRadius: 999,
                background: 'var(--coral)', color: '#f6f2e9',
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', lineHeight: 1 }}>
                {digizapUnread}
              </span>
            )}
          </NavLink>
        )}
        {isGM && (
          <NavLink to="/backstage"  className={({ isActive }) => isActive ? styles.active : ''}>Backstage</NavLink>
        )}

        <div className={styles.navSpacer} />

        {!localMode && profile && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            padding: '3px 10px', borderRadius: 999,
            background: isGM ? 'var(--ink)' : 'var(--paper-deep)',
            color: isGM ? 'var(--paper)' : 'var(--ink-mute)',
            border: '1px solid var(--line)' }}>
            {isGM ? 'GM' : isGuest ? `${profile.display_name} ·  convidado` : profile.display_name}
          </span>
        )}

        {/* Botão salvar — visível quando há mudanças não salvas (exceto guests) */}
        {!isGuest && isSupabaseReady && (isDirty || isSaving) && (
          <button
            className={styles.navBtn}
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            style={{ background: isDirty ? 'var(--coral)' : undefined,
              color: isDirty ? 'var(--paper)' : undefined,
              borderColor: isDirty ? 'var(--coral)' : undefined }}>
            {isSaving ? 'Salvando...' : '● Salvar'}
          </button>
        )}

        {isGM && isSupabaseReady && (
          <button className={styles.navBtn} onClick={handleMigrate} disabled={migrating}
            title="Migrar dados locais">
            {migrating ? '...' : '⟳ Migrar'}
          </button>
        )}

        {!isGuest && (
          <>
            <button className={styles.navBtn} onClick={async () => exportStateToFile(state)}>↓ Backup</button>
            <button className={styles.navBtn} onClick={handleImport}>↑ Importar</button>
          </>
        )}

        {isSupabaseReady && session && (
          <button className={styles.navBtn} onClick={signOut}>Sair</button>
        )}
        <NavLink to="/configuracoes" className={({ isActive }) => isActive ? styles.active : ''}>⚙</NavLink>
      </nav>

      {showSetupBanner && (
        <div style={{ padding: '10px 24px', fontFamily: 'var(--font-mono)', fontSize: 11,
          background: 'rgba(196,51,33,0.08)', color: 'var(--coral)',
          borderBottom: '1px solid var(--line-soft)',
          display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong>Setup necessário:</strong> Execute o arquivo <code>supabase_schema.sql</code> no SQL Editor do Supabase para criar as tabelas necessárias.
        </div>
      )}

      {migrateResult && (
        <div style={{ padding: '10px 24px', fontFamily: 'var(--font-mono)', fontSize: 11,
          background: migrateResult.startsWith('✓') ? 'rgba(110,157,112,0.12)' : 'rgba(196,51,33,0.08)',
          color: migrateResult.startsWith('✓') ? 'var(--green)' : 'var(--coral)',
          borderBottom: '1px solid var(--line-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {migrateResult}
          <button onClick={() => setMigrateResult(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'inherit', fontSize: 14 }}>×</button>
        </div>
      )}

      <main className={styles.main}>
        <Suspense fallback={pageFallback}>
          <Routes>
            <Route path="/"          element={<HomePage />} />
            <Route path="/party"     element={<PartyPage    state={state} onUpdate={onUpdateLocal} canEdit={canEdit} isGM={isGM} />} />
            <Route path="/goggle"    element={<GogglePage   state={state} onUpdate={onUpdateLocal} canEdit={canEdit} isGM={isGM} />} />
            <Route path="/teatro"    element={<TeatroPage   state={state} onUpdate={onUpdate}      isGM={isGM} />} />
            <Route path="/sistema"   element={<SistemaPage  state={state} onUpdate={onUpdateLocal} isGM={isGM} />} />
            <Route path="/backstage" element={<BackstagePage state={state} onUpdate={onUpdateLocal} />} />
            <Route path="/digivice"  element={<DigivicePage  state={state} onUpdate={onUpdateLocal} profile={profile} isGM={isGM} />} />
            <Route path="/digizap"   element={<DigiZapPage   state={state} profile={profile} isGM={isGM} onUnreadChange={setDigizapUnread} />} />
            <Route path="/view"          element={<ViewerPage    state={state} />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </SettingsProvider>
  )
}
