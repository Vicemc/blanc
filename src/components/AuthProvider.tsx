// src/components/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  getSession, getProfile, onAuthStateChange, isGM as checkIsGM,
} from '../lib/auth'
import type { UserProfile } from '../lib/auth'
import { isSupabaseReady } from '../lib/supabase'

// ── Contexto ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  session:    Session | null
  profile:    UserProfile | null
  loading:    boolean
  isGM:       boolean
  // Em modo local (sem Supabase), o app funciona sem login
  localMode:  boolean
  refresh:    () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session:   null,
  profile:   null,
  loading:   true,
  isGM:      true,
  localMode: true,
  refresh:   async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [loading, setLoading]   = useState(true)

  const localMode = !isSupabaseReady

  const loadProfile = useCallback(async (sess: Session | null) => {
    if (!sess) { setProfile(null); setLoading(false); return }
    const p = await getProfile(sess.user.id)
    setProfile(p)
    setLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    const sess = await getSession()
    setSession(sess)
    await loadProfile(sess)
  }, [loadProfile])

  useEffect(() => {
    if (localMode) {
      // Modo local — sem auth, acesso total
      setLoading(false)
      return
    }

    // Carregar sessão inicial
    getSession().then(sess => {
      setSession(sess)
      loadProfile(sess)
    })

    // Ouvir mudanças de sessão
    const unsub = onAuthStateChange(async sess => {
      setSession(sess)
      await loadProfile(sess)
    })

    return unsub
  }, [localMode, loadProfile])

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    isGM: localMode ? true : checkIsGM(profile),
    localMode,
    refresh,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
