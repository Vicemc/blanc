// src/App.tsx
import { Suspense, lazy, startTransition, useState, useCallback, useEffect, useRef, type FC } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { loadState, exportStateToFile, importStateFromFile, runMigrations } from './data/store'
import { loadStateFromDB, saveStateToDB, subscribeToState, migrateLocalToSupabase, updateMyTamerAndLine } from './lib/db'
import { signOut, canEditTamer } from './lib/auth'
import type { UserProfile } from './lib/auth'
import type { Tamer } from './types'
import { AuthProvider, useAuth } from './components/AuthProvider'
import { SetupHealth } from './components/SetupHealth'
import { DiceRoller } from './components/DiceRoller'
import { ThemeToggle } from './components/ThemeToggle'
import { GlobalSearch } from './components/GlobalSearch'
import { usePresence } from './lib/presence'
import { SettingsProvider } from './lib/settings'
import { CampaignFlagsProvider, useCampaignFlags } from './lib/campaignFlags'
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
const WikiPage      = lazyLoad(() => import('./pages/WikiPage'))
const MapPage       = lazyLoad(() => import('./pages/MapPage'))

// ── Avatar pixel art do personagem do jogador ────────────────────────────────

const TamerAvatar: FC<{ profile: UserProfile; tamer: Tamer | null; isGM: boolean; isGuest: boolean }> = ({ profile, tamer, isGM, isGuest }) => {
  const [failed, setFailed] = useState(false)

  if (isGM) {
    return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        padding: '3px 10px', borderRadius: 999,
        background: 'var(--ink)', color: 'var(--paper)',
        border: '1px solid var(--ink)' }}>
        GM
      </span>
    )
  }

  // Deriva nome do arquivo: 't-naoki' → 'Naoki'
  const avatarFile = tamer
    ? tamer.id.replace(/^t-/, '').replace(/^(.)/, c => c.toUpperCase())
    : null

  if (avatarFile && !failed) {
    const label = tamer
      ? tamer.name.charAt(0) + tamer.name.slice(1).toLowerCase()
      : profile.display_name
    return (
      <div title={label}
        style={{ width: 34, height: 34, borderRadius: 6, overflow: 'hidden',
          border: '1px solid var(--line)', flexShrink: 0, cursor: 'default',
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }}>
        <img
          src={`/avatar/${avatarFile}.png`}
          alt={label}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover',
            imageRendering: 'pixelated', display: 'block' }}
        />
      </div>
    )
  }

  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      padding: '3px 10px', borderRadius: 999,
      background: 'var(--paper-deep)', color: 'var(--ink-mute)',
      border: '1px solid var(--line)' }}>
      {isGuest ? `${profile.display_name} · convidado` : profile.display_name}
    </span>
  )
}

function AppInner() {
  const { session, profile, loading, isGM, localMode, isAnon, showLogin, setShowLogin, refresh } = useAuth()
  const [state, setState] = useState<AppState>(() => loadState())
  const [appReady, setAppReady] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<string | null>(null)
  const [conflictAt, setConflictAt] = useState<number | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [digizapUnread, setDigizapUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const realtimeUnsub   = useRef<(() => void) | null>(null)
  const lastSaveRef     = useRef(0)
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRemoteRef = useRef<AppState | null>(null)

  const isGuest = !localMode && profile?.role === 'guest'
  const [activeStage, setActiveStage] = useState<string | undefined>(undefined)
  const presences = usePresence(profile, activeStage)
  const { flags } = useCampaignFlags()

  // Menu mobile: fecha ao navegar e ao apertar Esc.
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  // Ao sair do Teatro, deixa de publicar o palco ativo na presença.
  useEffect(() => {
    if (location.pathname !== '/teatro') setActiveStage(undefined)
  }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    if (loading) return
    // Visitante anônimo (sem sessão) ainda carrega o estado público do DB,
    // apenas em modo leitura.
    loadStateFromDB().then(s => { setState(s); setAppReady(true) })
  }, [loading, session, localMode])

  useEffect(() => {
    if (!isSupabaseReady || !session) return
    realtimeUnsub.current?.()
    realtimeUnsub.current = subscribeToState(remoteState => {
      latestRemoteRef.current = remoteState
      if (Date.now() - lastSaveRef.current < 3000) return
      setState(runMigrations(remoteState))
    })
    return () => { realtimeUnsub.current?.() }
  }, [session])

  // Detecta conflitos de save em multiplayer
  useEffect(() => {
    const onConflict = () => {
      setConflictAt(Date.now())
      setTimeout(() => setConflictAt(c => (c && Date.now() - c >= 4900 ? null : c)), 5000)
    }
    window.addEventListener('app:save-conflict', onConflict)
    return () => window.removeEventListener('app:save-conflict', onConflict)
  }, [])

  // Avisa sobre mudanças não salvas ao fechar a aba
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Auto-save para Teatro/Palco (combate em tempo real)
  const onUpdate = useCallback((s: AppState) => {
    if (isAnon) { setState(s); return }  // visitante: só estado local, sem persistir
    setState(s)
    lastSaveRef.current = Date.now()
    saveStateToDB(s)
  }, [isAnon])

  // Edição local — marca dirty e auto-salva após 1.5s de inatividade.
  // Players (não-GM, não-localMode) usam updateMyTamerAndLine (RPC atômico) para evitar
  // sobrescrever o estado inteiro e causar conflitos de concorrência com outros players.
  // NUNCA há fallback para saveStateToDB para players — isso deletaria NPCs/mudanças alheias.
  const onUpdateLocal = useCallback((s: AppState) => {
    if (isAnon) { setState(s); return }  // visitante: só estado local, sem persistir
    setState(s)
    lastSaveRef.current = Date.now()
    setIsDirty(true)
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      lastSaveRef.current = Date.now()
      if (!localMode && !isGM) {
        // Player: só salva via RPC atômico. Sem fallback para saveStateToDB.
        if (profile?.tamer_id) {
          const tamer = s.tamers.find(t => t.id === profile.tamer_id)
          if (tamer) {
            const line = s.bestiary.find(l => l.tamerId === profile.tamer_id) ?? null
            void updateMyTamerAndLine(tamer, line).then(({ ok, error }) => {
              if (ok) setIsDirty(false)
              else console.warn('[player save] updateMyTamerAndLine falhou:', error)
            })
          }
        }
        // Sem tamer_id ou tamer não encontrado: não persiste no DB.
        // O GM é a fonte autoritativa do estado global.
        return
      }
      void saveStateToDB(s).then(() => setIsDirty(false))
    }, 1500)
  }, [isAnon, localMode, isGM, profile])

  const handleSave = useCallback(async () => {
    if (!isDirty) return
    setIsSaving(true)
    if (!localMode && !isGM) {
      // Player: só salva via RPC atômico. Sem fallback para saveStateToDB.
      if (profile?.tamer_id) {
        const tamer = state.tamers.find(t => t.id === profile.tamer_id)
        if (tamer) {
          const line = state.bestiary.find(l => l.tamerId === profile.tamer_id) ?? null
          const { ok, error } = await updateMyTamerAndLine(tamer, line)
          if (ok) setIsDirty(false)
          else console.warn('[player save] handleSave updateMyTamerAndLine falhou:', error)
        }
      }
      setIsSaving(false)
      return
    }
    await saveStateToDB(state)
    setIsDirty(false)
    setIsSaving(false)
  }, [isDirty, state, localMode, isGM, profile])

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

  // GM pode editar qualquer ficha. Player só edita o próprio tamer. Guest/visitante não edita nada.
  const canEdit = useCallback((tamerId?: string) => {
    if (isAnon) return false
    if (localMode) return true
    if (isGM) return true
    if (isGuest) return false
    if (!tamerId) return false
    return canEditTamer(profile, tamerId)
  }, [isAnon, localMode, isGM, isGuest, profile])

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

  // Tela de login só aparece quando o visitante clica em "Entrar".
  // O LoginPage é lazy: precisa de um Suspense próprio aqui, senão o React
  // lança o erro #426 (componente suspende durante update síncrono do clique
  // em "Entrar", que está fora do <Suspense> das Routes).
  if (isAnon && showLogin) {
    return (
      <Suspense fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'var(--font-mono)',
          fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--ink-mute)' }}>
          Carregando...
        </div>
      }>
        <LoginPage onSuccess={() => { setShowLogin(false); refresh() }} onCancel={() => setShowLogin(false)} />
      </Suspense>
    )
  }

  const showSetupBanner = isSupabaseReady && session && !profile && !localMode

  // Digivice e DigiZap: apenas GM ou players com tamer vinculado (não guests/visitantes)
  const canSeeDigivice = !isAnon && !isGuest && (localMode || isGM || !!profile?.tamer_id)
  // Digi-Zap pode ser desligado pelo GM via flag de campanha (GM sempre vê).
  const canSeeDigizap  = !isAnon && !isGuest && (localMode || isGM || !!profile?.tamer_id)
    && (isGM || flags.digizap_enabled)
  // Teatro é visível para visitantes (somente leitura); apenas guests logados não veem.
  const canSeeTeatro   = !isGuest
  // Visitante anônimo: só Início, Party, Goggle, Sistema, Teatro e Wiki.
  // Mapas pode ser desligado para players pela flag maps_for_players (GM sempre vê).
  const canSeeMapas    = !isAnon && (isGM || flags.maps_for_players)
  const canSeeConfig   = !isAnon

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
      <a href="#main" className="skipLink">Pular para o conteúdo</a>
      <nav className={styles.nav} aria-label="Navegação principal">
        <button
          type="button"
          className={styles.hamburger}
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="nav-inner"
          onClick={() => setMenuOpen(o => !o)}>
          {menuOpen ? '✕' : '☰'}
        </button>
        <div
          id="nav-inner"
          className={`${styles.navInner} ${menuOpen ? styles.navInnerOpen : ''}`}>
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
        <NavLink to="/wiki"          className={({ isActive }) => isActive ? styles.active : ''}>Wiki</NavLink>
        {canSeeMapas && (
          <NavLink to="/mapas"       className={({ isActive }) => isActive ? styles.active : ''}>Mapas</NavLink>
        )}
        {canSeeConfig && (
          <NavLink to="/configuracoes" className={({ isActive }) => isActive ? styles.active : ''}>Config</NavLink>
        )}
        {isGM && (
          <NavLink to="/backstage"  className={({ isActive }) => isActive ? styles.active : ''}>Backstage</NavLink>
        )}

        <div className={styles.navSpacer} />

        <GlobalSearch state={state} isGM={isGM} className={styles.navBtn} />

        {!localMode && !isAnon && presences.length > 0 && (
          <span title={presences.map(p => p.display_name).join(', ')}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999,
              background: 'rgba(110,157,112,0.15)', color: 'var(--green)',
              border: '1px solid var(--green)' }}>
            ● {presences.length} online
          </span>
        )}

        {!localMode && profile && (
          <TamerAvatar
            profile={profile}
            tamer={state.tamers.find(t => t.id === profile.tamer_id) ?? null}
            isGM={isGM}
            isGuest={isGuest}
          />
        )}

        {/* Botão salvar — visível quando há mudanças não salvas (exceto guests/visitantes) */}
        {!isGuest && !isAnon && isSupabaseReady && (isDirty || isSaving) && (
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

        {isGM && isSupabaseReady && <SetupHealth className={styles.navBtn} />}

        {!isGuest && !isAnon && (
          <>
            <button className={styles.navBtn} onClick={async () => exportStateToFile(state)}>↓ Backup</button>
            <button className={styles.navBtn} onClick={handleImport}>↑ Importar</button>
          </>
        )}

        {/* Visitante anônimo: oferece login. Sessão ativa: oferece sair. */}
        {isAnon && (
          <button className={styles.navBtn} onClick={() => startTransition(() => setShowLogin(true))}>Entrar</button>
        )}
        {isSupabaseReady && session && (
          <button className={styles.navBtn} onClick={signOut}>Sair</button>
        )}
        </div>
      </nav>
      {/* Backdrop do menu mobile */}
      {menuOpen && (
        <div className={styles.navBackdrop} onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      {showSetupBanner && (
        <div style={{ padding: '10px 24px', fontFamily: 'var(--font-mono)', fontSize: 11,
          background: 'rgba(196,51,33,0.08)', color: 'var(--coral)',
          borderBottom: '1px solid var(--line-soft)',
          display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong>Setup necessário:</strong> Execute o arquivo <code>supabase_schema.sql</code> no SQL Editor do Supabase para criar as tabelas necessárias.
        </div>
      )}

      {conflictAt && (
        <div style={{ padding: '10px 24px', fontFamily: 'var(--font-mono)', fontSize: 11,
          background: 'rgba(231,212,163,0.18)', color: 'var(--orange)',
          borderBottom: '1px solid var(--line-soft)', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between' }}>
          ⚠ Conflito de save: alguém atualizou primeiro. Seu salvamento foi forçado — recarregue se algo parecer estranho.
          <button onClick={() => setConflictAt(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}>×</button>
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

      <main id="main" className={styles.main}>
        <Suspense fallback={pageFallback}>
          <Routes>
            <Route path="/"          element={<HomePage />} />
            <Route path="/party"     element={<PartyPage    state={state} onUpdate={onUpdateLocal} canEdit={canEdit} isGM={isGM} />} />
            <Route path="/goggle"    element={<GogglePage   state={state} onUpdate={onUpdateLocal} canEdit={canEdit} isGM={isGM} />} />
            <Route path="/teatro"    element={<TeatroPage   state={state} onUpdate={onUpdate}      isGM={isGM} presences={presences} onActiveStageChange={setActiveStage} />} />
            <Route path="/sistema"   element={<SistemaPage  state={state} onUpdate={onUpdateLocal} isGM={isGM} />} />
            <Route path="/wiki"          element={<WikiPage      state={state} isGM={isGM} />} />
            <Route path="/wiki/:id"      element={<WikiPage      state={state} isGM={isGM} />} />
            <Route path="/view"          element={<ViewerPage    state={state} />} />
            {/* Rotas restritas a usuários logados — visitantes anônimos são redirecionados. */}
            {!isAnon && (
              <>
                <Route path="/backstage" element={<BackstagePage state={state} onUpdate={onUpdateLocal} />} />
                <Route path="/digivice"  element={<DigivicePage  state={state} onUpdate={onUpdateLocal} profile={profile} isGM={isGM} />} />
                {canSeeDigizap && (
                  <Route path="/digizap"   element={<DigiZapPage   state={state} profile={profile} isGM={isGM} onUnreadChange={setDigizapUnread} />} />
                )}
                {canSeeMapas && (
                  <Route path="/mapas"         element={<MapPage       isGM={isGM} />} />
                )}
                <Route path="/configuracoes" element={<SettingsPage />} />
              </>
            )}
            {/* Qualquer outra rota (inclui restritas para anon) volta ao início. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <DiceRoller />
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <CampaignFlagsProvider>
          <AppInner />
          {/* Botão de tema sempre presente, em qualquer tela (login, loading, app). */}
          <ThemeToggle />
        </CampaignFlagsProvider>
      </AuthProvider>
    </SettingsProvider>
  )
}
