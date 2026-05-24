// src/lib/auth.ts
// Autenticação via Supabase Auth (email + senha).
// Todas as funções degradam graciosamente se o Supabase não estiver configurado.

import { supabase, isSupabaseReady } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type UserRole = 'gm' | 'player'

export interface UserProfile {
  id:              string
  display_name:    string
  role:            UserRole
  tamer_id:        string | null
  active_npc_view: string | null
}

export interface AuthState {
  user:    User | null
  profile: UserProfile | null
  session: Session | null
  loading: boolean
}

// ── Funções de autenticação ───────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: null } // modo local — aceita qualquer coisa

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  return { error: null }
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role, tamer_id, active_npc_view')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data as UserProfile
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<UserProfile, 'display_name' | 'active_npc_view'>>,
): Promise<void> {
  if (!supabase) return
  await supabase.from('profiles').update(patch).eq('id', userId)
}

// GM pode alterar role e tamer_id de qualquer usuário
export async function setUserRole(
  targetUserId: string,
  role: UserRole,
  tamerId?: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: null }

  const { error } = await supabase
    .from('profiles')
    .update({ role, ...(tamerId !== undefined ? { tamer_id: tamerId } : {}) })
    .eq('id', targetUserId)

  return { error: error?.message ?? null }
}

export async function listProfiles(): Promise<UserProfile[]> {
  if (!supabase) return []

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, role, tamer_id, active_npc_view')
    .order('display_name')

  return (data ?? []) as UserProfile[]
}

// ── Helpers de role ───────────────────────────────────────────────────────────

export function isGM(profile: UserProfile | null): boolean {
  if (!isSupabaseReady) return true  // em modo local, tudo é permitido
  return profile?.role === 'gm'
}

export function canEditTamer(
  profile: UserProfile | null,
  tamerId: string,
): boolean {
  if (!isSupabaseReady) return true
  if (profile?.role === 'gm') return true
  return profile?.tamer_id === tamerId
}

// ── Realtime: ouvir mudanças de sessão ───────────────────────────────────────

export function onAuthStateChange(
  callback: (session: Session | null) => void,
): () => void {
  if (!supabase) return () => {}

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })

  return () => data.subscription.unsubscribe()
}
