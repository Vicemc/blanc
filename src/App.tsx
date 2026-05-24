// src/App.tsx
import { useState, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { loadState, exportStateToFile, importStateFromFile } from './data/store'
import { loadStateFromDB, saveStateToDB, subscribeToState, migrateLocalToSupabase } from './lib/db'
import { signOut, canEditTamer } from './lib/auth'
import { AuthProvider, useAuth } from './components/AuthProvider'
import { isSupabaseReady } from './lib/supabase'
import type { AppState } from './types'
import LoginPage     from './pages/LoginPage'
import HomePage      from './pages/HomePage'
import PartyPage     from './pages/PartyPage'
import GogglePage    from './pages/GogglePage'
import TeatroPage    from './pages/TeatroPage'
import SistemaPage   from './pages/SistemaPage'
import BackstagePage from './pages/BackstagePage'
import DigivicePage  from './pages/DigivicePage'
import DigiZapPage   from './pages/DigiZapPage'
import ViewerPage    from './pages/ViewerPage'
import styles from './App.module.css'

function AppInner() {
  const { session, profile, loading, isGM, localMode, refresh } = useAuth()
  const [state, setState] = useState<AppState>(() => loadState())
  const [appReady, setAppReady] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<string | null>(null)
  const realtimeUnsub = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (loading) return
    if (isSupabaseReady && !session && !localMode) { setAppReady(true); return }
    loadStateFromDB().then(s => { setState(s); setAppReady(true) })
  }, [loading, session, localMode])

  useEffect(() => {
    if (!isSupabaseReady || !session) return
    realtimeUnsub.current?.()
    realtimeUnsub.current = subscribeToState(remoteState => { setState(remoteState) })
    return () => { realtimeUnsub.current?.() }
  }, [session])

  const onUpdate = useCallback((s: AppState) => {
    setState(s)
    saveStateToDB(s)
  }, [])

  const handleImport = async () => {
    const imported = await importStateFromFile()
    if (imported) onUpdate(imported)
  }

  const handleMigrate = async () => {
    setMigrating(true); setMigrateResult(null)
    const { ok, error, imagesMigrated } = await migrateLocalToSupabase()
    setMigrating(false)
    setMigrateResult(ok
      ? `✓ Migração concluída — ${imagesMigrated} imagem(ns) migrada(s).`
      : `✗ Erro: ${error}`)
  }

  // ── Controle de acesso ────────────────────────────────────────────────────
  // GM pode editar qualquer ficha. Player só edita o próprio tamer.
  const canEdit = useCallback((tamerId?: string) => {
    if (localMode) return true
    if (isGM) return true
    if (!tamerId) return false
    return canEditTamer(profile, tamerId)
  }, [localMode, isGM, profile])

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

  const sharedProps = { state, onUpdate }

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <NavLink to="/"         end className={({ isActive }) => isActive ? styles.active : ''}>Início</NavLink>
        <NavLink to="/party"        className={({ isActive }) => isActive ? styles.active : ''}>Party</NavLink>
        <NavLink to="/goggle"       className={({ isActive }) => isActive ? styles.active : ''}>Goggle Girl</NavLink>
        <NavLink to="/teatro"       className={({ isActive }) => isActive ? styles.active : ''}>Teatro</NavLink>
        <NavLink to="/sistema"      className={({ isActive }) => isActive ? styles.active : ''}>Sistema</NavLink>
        <NavLink to="/digivice"     className={({ isActive }) => isActive ? styles.active : ''}>Digivice</NavLink>
        <NavLink to="/digizap"      className={({ isActive }) => isActive ? styles.active : ''}>Digi-Zap</NavLink>
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
            {isGM ? 'GM' : profile.display_name}
          </span>
        )}

        {isGM && isSupabaseReady && (
          <button className={styles.navBtn} onClick={handleMigrate} disabled={migrating}
            title="Migrar dados locais">
            {migrating ? '...' : '⟳ Migrar'}
          </button>
        )}

        <button className={styles.navBtn} onClick={async () => exportStateToFile(state)}>↓ Backup</button>
        <button className={styles.navBtn} onClick={handleImport}>↑ Importar</button>

        {isSupabaseReady && session && (
          <button className={styles.navBtn} onClick={signOut}>Sair</button>
        )}
      </nav>

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
        <Routes>
          <Route path="/"          element={<HomePage />} />
          <Route path="/party"     element={<PartyPage    {...sharedProps} canEdit={canEdit} />} />
          <Route path="/goggle"    element={<GogglePage   {...sharedProps} canEdit={canEdit} isGM={isGM} />} />
          <Route path="/teatro"    element={<TeatroPage   {...sharedProps} isGM={isGM} />} />
          <Route path="/sistema"   element={<SistemaPage state={state} onUpdate={onUpdate} isGM={isGM} />} />
          <Route path="/backstage" element={<BackstagePage {...sharedProps} />} />
          <Route path="/digivice"  element={<DigivicePage  {...sharedProps} profile={profile} isGM={isGM} />} />
          <Route path="/digizap"   element={<DigiZapPage   state={state} profile={profile} isGM={isGM} />} />
          <Route path="/view"      element={<ViewerPage    state={state} />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

// ── App interno (usa contexto de auth) ───────────────────────────────────────

function AppInner() {
  const { session, profile, loading, isGM, localMode, refresh } = useAuth()
  const [state, setState] = useState<AppState>(() => loadState())
  const [appReady, setAppReady] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<string | null>(null)
  const realtimeUnsub = useRef<(() => void) | null>(null)

  // Carregar estado do Supabase (ou localStorage) na montagem / após login
  useEffect(() => {
    if (loading) return
    if (isSupabaseReady && !session && !localMode) {
      // Aguardando login — não carrega ainda
      setAppReady(true)
      return
    }

    loadStateFromDB().then(s => {
      setState(s)
      setAppReady(true)
    })
  }, [loading, session, localMode])

  // Realtime — ouvir mudanças do GM em tempo real
  useEffect(() => {
    if (!isSupabaseReady || !session) return

    realtimeUnsub.current?.()
    realtimeUnsub.current = subscribeToState(remoteState => {
      setState(remoteState)
    })

    return () => { realtimeUnsub.current?.() }
  }, [session])

  const onUpdate = useCallback((s: AppState) => {
    setState(s)
    saveStateToDB(s)
  }, [])

  const handleImport = async () => {
    const imported = await importStateFromFile()
    if (imported) {
      onUpdate(imported)
    }
  }

  const handleMigrate = async () => {
    setMigrating(true)
    setMigrateResult(null)
    const { ok, error, imagesMigrated } = await migrateLocalToSupabase()
    setMigrating(false)
    setMigrateResult(ok
      ? `✓ Migração concluída — ${imagesMigrated} imagem(ns) migrada(s).`
      : `✗ Erro: ${error}`)
  }

  // ── Loading ───────────────────────────────────────────────────────────────

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

  // ── Login guard ───────────────────────────────────────────────────────────

  if (isSupabaseReady && !session && !localMode) {
    return <LoginPage onSuccess={refresh} />
  }

  // ── App ───────────────────────────────────────────────────────────────────

  const sharedProps = { state, onUpdate }

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <NavLink to="/"        end className={({ isActive }) => isActive ? styles.active : ''}>Início</NavLink>
        <NavLink to="/party"       className={({ isActive }) => isActive ? styles.active : ''}>Party</NavLink>
        <NavLink to="/goggle"      className={({ isActive }) => isActive ? styles.active : ''}>Goggle Girl</NavLink>
        <NavLink to="/teatro"      className={({ isActive }) => isActive ? styles.active : ''}>Teatro</NavLink>
        <NavLink to="/sistema"     className={({ isActive }) => isActive ? styles.active : ''}>Sistema</NavLink>

        <div className={styles.navSpacer} />

        {/* Badge de role */}
        {!localMode && profile && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            padding: '3px 10px', borderRadius: 999,
            background: isGM ? 'var(--ink)' : 'var(--paper-deep)',
            color: isGM ? 'var(--paper)' : 'var(--ink-mute)',
            border: '1px solid var(--line)',
          }}>
            {isGM ? 'GM' : profile.display_name}
          </span>
        )}

        {/* Migração — só aparece para GM quando Supabase está configurado e ainda há dados locais */}
        {isGM && isSupabaseReady && (
          <button
            className={styles.navBtn}
            onClick={handleMigrate}
            disabled={migrating}
            title="Migrar dados locais para o Supabase"
          >
            {migrating ? '...' : '⟳ Migrar'}
          </button>
        )}

        <button className={styles.navBtn} onClick={async () => exportStateToFile(state)} title="Exportar backup">
          ↓ Backup
        </button>
        <button className={styles.navBtn} onClick={handleImport} title="Importar backup">
          ↑ Importar
        </button>

        {/* Logout — só quando Supabase está ativo */}
        {isSupabaseReady && session && (
          <button className={styles.navBtn} onClick={signOut} title="Sair">
            Sair
          </button>
        )}
      </nav>

      {/* Resultado da migração */}
      {migrateResult && (
        <div style={{
          padding: '10px 24px',
          fontFamily: 'var(--font-mono)', fontSize: 11,
          background: migrateResult.startsWith('✓') ? 'rgba(110,157,112,0.12)' : 'rgba(196,51,33,0.08)',
          color: migrateResult.startsWith('✓') ? 'var(--green)' : 'var(--coral)',
          borderBottom: '1px solid var(--line-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {migrateResult}
          <button onClick={() => setMigrateResult(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'inherit', fontSize: 14 }}>×</button>
        </div>
      )}

      <main className={styles.main}>
        <Routes>
          <Route path="/"        element={<HomePage />} />
          <Route path="/party"   element={<PartyPage   {...sharedProps} />} />
          <Route path="/goggle"  element={<GogglePage  {...sharedProps} />} />
          <Route path="/teatro"  element={<TeatroPage  {...sharedProps} />} />
          <Route path="/sistema" element={<SistemaPage />} />
        </Routes>
      </main>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}