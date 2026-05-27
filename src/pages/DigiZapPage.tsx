// src/pages/DigiZapPage.tsx
// Chat Realtime do Digi-Zap entre personagens.
// Grupos: SURVIVORS, Sanbaka, Kurumizawa Girls (pré-criados), e bilaterais (PC ↔ NPC).

import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppState } from '../types'
import type { UserProfile } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useSettings } from '../lib/settings'

interface Props {
  state:            AppState
  profile:          UserProfile | null
  isGM:             boolean
  onUnreadChange?:  (n: number) => void
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DigiZapGroup {
  id:           string
  kind:         'group' | 'bilateral'
  name:         string
  participants: string[]
}

interface DigiZapMessage {
  id:           string
  group_id:     string
  sender_id:    string
  content:      string
  survival_day: number | null
  sent_at_time: string | null
  session_num:  number | null
  created_at:   string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tamerName(state: AppState, characterId: string): string {
  const t = state.tamers.find(t => t.id === characterId)
  return t?.name ?? characterId
}

function tamerPortrait(state: AppState, characterId: string): string {
  const t = state.tamers.find(t => t.id === characterId)
  return t?.portrait ?? 'sage'
}

// Ping sonoro via Web Audio API
function playPing() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    osc.start()
    osc.stop(ctx.currentTime + 0.45)
  } catch { /* ignore */ }
}

// Arquiva mensagens nos Digivices dos participantes e as remove do banco
async function archiveMessages(group: DigiZapGroup, toArchive: DigiZapMessage[]) {
  if (!supabase || toArchive.length === 0) return

  const rec = {
    id:         `chat-${Date.now().toString(36)}`,
    type:       'chat',
    title:      `${group.name} · ${new Date().toLocaleDateString('pt-BR')}`,
    content:    JSON.stringify(toArchive),
    image_path: null,
    session:    null,
  }

  for (const charId of group.participants) {
    const { data: dv } = await supabase
      .from('digivices')
      .select('id, records')
      .eq('character_id', charId)
      .maybeSingle()
    if (dv) {
      await supabase
        .from('digivices')
        .update({ records: [...(dv.records ?? []), rec] })
        .eq('id', dv.id)
    }
  }

  const ids = toArchive.map(m => m.id)
  await supabase.from('digi_zap_messages').delete().in('id', ids)
}

// Controle de "última vez visto" por grupo (localStorage)
const LS_KEY = 'digizap-lastseen'

function getLastSeen(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

function markGroupSeen(groupId: string) {
  const map = getLastSeen()
  map[groupId] = new Date().toISOString()
  localStorage.setItem(LS_KEY, JSON.stringify(map))
}

// ── DigiZapPage ───────────────────────────────────────────────────────────────

export default function DigiZapPage({ state, profile, isGM, onUnreadChange }: Props) {
  const { settings } = useSettings()
  const [groups,         setGroups]         = useState<DigiZapGroup[]>([])
  const [activeGroupId,  setActiveGroupId]  = useState<string | null>(null)
  const [messages,       setMessages]       = useState<DigiZapMessage[]>([])
  const [unread,         setUnread]         = useState<Record<string, number>>({})
  const [input,          setInput]          = useState('')
  const [survivalDay,    setSurvivalDay]    = useState<string>('')
  const [sentAtTime,     setSentAtTime]     = useState<string>('')
  const [sessionNum,     setSessionNum]     = useState<string>('')
  const [showMeta,       setShowMeta]       = useState(false)
  const [sending,        setSending]        = useState(false)
  const [loadingMsgs,    setLoadingMsgs]    = useState(false)
  const [npcView,        setNpcView]        = useState<string>('')
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupName,   setNewGroupName]   = useState('')
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeGroupIdRef = useRef<string | null>(null)
  const digizapSoundRef  = useRef(settings.digizapSound)
  useEffect(() => { digizapSoundRef.current = settings.digizapSound }, [settings.digizapSound])

  // Mantém ref sincronizado para uso dentro de callbacks de realtime
  useEffect(() => { activeGroupIdRef.current = activeGroupId }, [activeGroupId])

  const myCharId = isGM
    ? (npcView || null)
    : (profile?.tamer_id ?? null)

  const npcIds    = ['t-hare', 't-kanade', 't-shinra', 't-kumo', 't-emi', 't-hibito']
  const allCharIds = [...npcIds, ...state.tamers.map(t => t.id)]

  // ── Computar total de não-lidos ──────────────────────────────────────────

  const computeTotal = useCallback((u: Record<string, number>) =>
    Object.values(u).reduce((a, b) => a + b, 0), [])

  // ── Carregar grupos + contagens iniciais ─────────────────────────────────

  useEffect(() => {
    if (!supabase) return

    supabase.from('digi_zap_groups')
      .select('*')
      .order('name')
      .then(async ({ data }) => {
        const grps = (data ?? []) as DigiZapGroup[]
        setGroups(grps)
        if (grps.length > 0 && !activeGroupIdRef.current) {
          setActiveGroupId(grps[0].id)
        }

        // Calcular não-lidos iniciais
        const lastSeen = getLastSeen()
        const counts: Record<string, number> = {}
        for (const g of grps) {
          const since = lastSeen[g.id]
          const query = supabase!
            .from('digi_zap_messages')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', g.id)
          const { count } = since
            ? await query.gt('created_at', since)
            : await query
          counts[g.id] = count ?? 0
        }
        setUnread(counts)
        onUnreadChange?.(Object.values(counts).reduce((a, b) => a + b, 0))
      })
  }, [onUnreadChange])

  // ── Carregar mensagens do grupo ativo ────────────────────────────────────

  const loadMessages = useCallback(async (groupId: string) => {
    if (!supabase) return
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('digi_zap_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
    const msgs = (data ?? []) as DigiZapMessage[]
    if (msgs.length > 100) {
      const toArchive = msgs.slice(0, msgs.length - 100)
      const group = groups.find(g => g.id === groupId)
      if (group) await archiveMessages(group, toArchive)
      setMessages(msgs.slice(-100))
    } else {
      setMessages(msgs)
    }
    setLoadingMsgs(false)
  }, [groups])

  useEffect(() => {
    if (!activeGroupId) return
    loadMessages(activeGroupId)
    // Marcar como lido ao abrir o grupo
    markGroupSeen(activeGroupId)
    setUnread(prev => {
      const next = { ...prev, [activeGroupId]: 0 }
      onUnreadChange?.(computeTotal(next))
      return next
    })
  }, [activeGroupId, loadMessages, onUnreadChange, computeTotal])

  // ── Realtime: ouvir TODOS os grupos ─────────────────────────────────────

  useEffect(() => {
    if (!supabase) return

    const channel = supabase
      .channel('digizap-all')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'digi_zap_messages',
      }, payload => {
        const msg = payload.new as DigiZapMessage

        if (msg.group_id === activeGroupIdRef.current) {
          // Grupo ativo — adiciona à lista (cap 100) e marca como lido
          setMessages(prev => [...prev.slice(-99), msg])
          markGroupSeen(msg.group_id)
        } else {
          // Outro grupo — incrementa não-lidos + ping
          setUnread(prev => {
            const next = { ...prev, [msg.group_id]: (prev[msg.group_id] ?? 0) + 1 }
            onUnreadChange?.(computeTotal(next))
            return next
          })
          if (digizapSoundRef.current) playPing()
        }
      })
      .subscribe()

    return () => { supabase?.removeChannel(channel) }
  }, [onUnreadChange, computeTotal])

  // ── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Enviar mensagem ──────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!input.trim() || !activeGroupId || !myCharId || !supabase) return
    setSending(true)

    await supabase.from('digi_zap_messages').insert({
      group_id:     activeGroupId,
      sender_id:    myCharId,
      content:      input.trim(),
      survival_day: survivalDay ? parseInt(survivalDay) : null,
      sent_at_time: sentAtTime.trim() || null,
      session_num:  sessionNum ? parseInt(sessionNum) : null,
    })

    setInput('')
    setSending(false)
  }

  // ── Criar grupo bilateral ────────────────────────────────────────────────

  const createBilateral = async (npcId: string) => {
    if (!supabase || !myCharId) return
    const existing = groups.find(g =>
      g.kind === 'bilateral' &&
      g.participants.includes(myCharId) &&
      g.participants.includes(npcId)
    )
    if (existing) { setActiveGroupId(existing.id); return }

    const name = `${tamerName(state, myCharId)} ↔ ${tamerName(state, npcId)}`
    const { data } = await supabase.from('digi_zap_groups')
      .insert({ kind: 'bilateral', name, participants: [myCharId, npcId].sort() })
      .select('*').single()

    if (data) {
      const newGroup = data as DigiZapGroup
      setGroups(prev => [...prev, newGroup])
      setActiveGroupId(newGroup.id)
    }
  }

  // ── Criar grupo (GM) ─────────────────────────────────────────────────────

  const createGroup = async () => {
    if (!supabase || !newGroupName.trim() || newGroupMembers.length < 2) return
    const { data } = await supabase.from('digi_zap_groups')
      .insert({ kind: 'group', name: newGroupName.trim(), participants: newGroupMembers })
      .select('*').single()
    if (data) {
      setGroups(prev => [...prev, data as DigiZapGroup].sort((a, b) => a.name.localeCompare(b.name)))
      setActiveGroupId((data as DigiZapGroup).id)
    }
    setNewGroupName('')
    setNewGroupMembers([])
    setShowCreateGroup(false)
  }

  const archiveCurrentGroup = async () => {
    if (!activeGroup || messages.length === 0) return
    await archiveMessages(activeGroup, messages)
    setMessages([])
  }

  if (!supabase) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center',
        fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18,
        color: 'var(--ink-mute)' }}>
        ~ O Digi-Zap requer o Supabase configurado ~
      </div>
    )
  }

  const activeGroup = groups.find(g => g.id === activeGroupId)
  const totalUnread = computeTotal(unread)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', height: 'calc(100vh - 57px)',
      display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '20px 32px 0', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36,
          textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Digi-Zap
          {totalUnread > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: 12, minWidth: 24, height: 24, borderRadius: 999,
              background: 'var(--coral)', color: '#f6f2e9',
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
              padding: '0 7px', verticalAlign: 'middle' }}>
              {totalUnread}
            </span>
          )}
        </h1>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
          fontSize: 16, color: 'var(--ink-soft)', marginBottom: 16 }}>
          ~ mensagens entre sobreviventes ~
        </div>

        {/* GM: seletor de NPC */}
        {isGM && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '10px 14px', background: 'var(--paper-deep)',
            border: '1px solid var(--line-soft)', borderRadius: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
              Enviando como:
            </span>
            <select value={npcView} onChange={e => setNpcView(e.target.value)}
              style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px',
                fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)',
                color: 'var(--ink)', flex: 1 }}>
              <option value="">— GM (observador) —</option>
              {allCharIds.map(id => (
                <option key={id} value={id}>{tamerName(state, id)}</option>
              ))}
            </select>
            <button onClick={() => setShowCreateGroup(p => !p)}
              style={{ padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${showCreateGroup ? 'var(--ink)' : 'var(--line)'}`,
                background: showCreateGroup ? 'var(--ink)' : 'transparent',
                color: showCreateGroup ? 'var(--paper)' : 'var(--ink-soft)',
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                whiteSpace: 'nowrap' }}>
              + Novo Grupo
            </button>
          </div>
        )}

        {/* Modal de criação de grupo (GM) */}
        {isGM && showCreateGroup && (
          <div style={{ marginBottom: 12, padding: '14px 16px',
            border: '1px solid var(--line)', borderRadius: 10,
            background: 'var(--paper-deep)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8 }}>
              Criar novo grupo
            </div>
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              placeholder="Nome do grupo *"
              style={{ width: '100%', marginBottom: 10, border: '1px solid var(--line)',
                borderRadius: 7, padding: '6px 10px', fontFamily: 'var(--font-body)',
                fontSize: 13, background: 'var(--paper)', color: 'var(--ink)',
                boxSizing: 'border-box' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 6 }}>
              Participantes
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {allCharIds.map(id => {
                const selected = newGroupMembers.includes(id)
                return (
                  <button key={id}
                    onClick={() => setNewGroupMembers(prev =>
                      selected ? prev.filter(x => x !== id) : [...prev, id]
                    )}
                    style={{ padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontSize: 12,
                      border: `1px solid ${selected ? 'var(--ink)' : 'var(--line)'}`,
                      background: selected ? 'var(--ink)' : 'transparent',
                      color: selected ? 'var(--paper)' : 'var(--ink-soft)' }}>
                    {tamerName(state, id)}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={createGroup}
                disabled={!newGroupName.trim() || newGroupMembers.length < 2}
                style={{ padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--ink)', background: 'var(--ink)',
                  color: 'var(--paper)', fontFamily: 'var(--font-body)',
                  fontWeight: 600, fontSize: 13,
                  opacity: (!newGroupName.trim() || newGroupMembers.length < 2) ? 0.4 : 1 }}>
                Criar
              </button>
              <button onClick={() => setShowCreateGroup(false)}
                style={{ padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--line)', background: 'transparent',
                  color: 'var(--ink-soft)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Layout principal */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '0 32px 24px', gap: 16 }}>

        {/* Sidebar de grupos */}
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
          gap: 4, overflowY: 'auto' }}>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ink-mute)', padding: '8px 4px 6px' }}>
            Grupos
          </div>

          {groups.filter(g => g.kind === 'group').map(g => {
            const cnt = unread[g.id] ?? 0
            return (
              <button key={g.id} onClick={() => setActiveGroupId(g.id)}
                style={{ padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                  background: activeGroupId === g.id ? 'var(--ink)' : 'transparent',
                  color: activeGroupId === g.id ? 'var(--paper)' : 'var(--ink-soft)',
                  transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span>{g.name}</span>
                {cnt > 0 && activeGroupId !== g.id && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: 999,
                    background: 'var(--coral)', color: '#f6f2e9',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', flexShrink: 0 }}>
                    {cnt}
                  </span>
                )}
              </button>
            )
          })}

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ink-mute)', padding: '12px 4px 6px' }}>
            Conversas
          </div>

          {groups.filter(g => g.kind === 'bilateral').map(g => {
            const cnt = unread[g.id] ?? 0
            return (
              <button key={g.id} onClick={() => setActiveGroupId(g.id)}
                style={{ padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 13,
                  background: activeGroupId === g.id ? 'var(--ink)' : 'transparent',
                  color: activeGroupId === g.id ? 'var(--paper)' : 'var(--ink-soft)',
                  transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.name}
                </span>
                {cnt > 0 && activeGroupId !== g.id && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: 999,
                    background: 'var(--coral)', color: '#f6f2e9',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', flexShrink: 0 }}>
                    {cnt}
                  </span>
                )}
              </button>
            )
          })}

          {/* Nova conversa bilateral */}
          {myCharId && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--ink-mute)', padding: '12px 4px 6px' }}>
                Nova conversa
              </div>
              {allCharIds.filter(id => id !== myCharId).map(id => (
                <button key={id} onClick={() => createBilateral(id)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px dashed var(--line)',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)',
                    fontSize: 12, background: 'transparent', color: 'var(--ink-mute)',
                    transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.color = 'var(--ink)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink-mute)' }}>
                  + {tamerName(state, id)}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Área de chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
          border: '1px solid var(--line)', borderRadius: 'var(--radius)',
          overflow: 'hidden', background: 'var(--paper)' }}>

          {/* Header do grupo */}
          {activeGroup && (
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)',
              background: 'var(--paper-deep)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12 }}>
              <div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 16,
                  textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{activeGroup.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                  letterSpacing: '0.1em', color: 'var(--ink-mute)', marginLeft: 10,
                  fontWeight: 400, textTransform: 'none' }}>
                  {activeGroup.participants.length} participante{activeGroup.participants.length !== 1 ? 's' : ''}
                </span>
              </div>
              {isGM && messages.length > 0 && (
                <button onClick={archiveCurrentGroup}
                  style={{ padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                    textTransform: 'uppercase', border: '1px solid var(--line)',
                    background: 'transparent', color: 'var(--ink-mute)', flexShrink: 0 }}>
                  Arquivar conversa
                </button>
              )}
            </div>
          )}

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loadingMsgs && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--ink-mute)', textAlign: 'center', padding: 20 }}>
                Carregando...
              </div>
            )}
            {!loadingMsgs && messages.length === 0 && (
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                fontSize: 16, color: 'var(--ink-mute)', textAlign: 'center', padding: '40px 0' }}>
                ~ nenhuma mensagem ainda ~
              </div>
            )}
            {messages.map(msg => {
              const isMe    = msg.sender_id === myCharId
              const senderName = tamerName(state, msg.sender_id)
              const portrait   = tamerPortrait(state, msg.sender_id)

              return (
                <div key={msg.id} style={{ display: 'flex', gap: 10,
                  flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    overflow: 'hidden', position: 'relative' }}>
                    <div className={`fill-${portrait}`} style={{ position: 'absolute', inset: 0 }} />
                    <div className="grain" style={{ position: 'absolute', inset: 0 }} />
                  </div>

                  {/* Balão */}
                  <div style={{ maxWidth: '70%' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--ink-mute)', marginBottom: 4,
                      textAlign: isMe ? 'right' : 'left' }}>
                      {senderName}
                      {msg.survival_day && ` · Dia ${msg.survival_day}`}
                      {msg.sent_at_time && ` · ${msg.sent_at_time}`}
                      {msg.session_num  && ` · Sessão ${msg.session_num}`}
                    </div>

                    <div style={{
                      padding: '10px 14px',
                      borderRadius: isMe ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                      background: isMe ? 'var(--ink)' : 'var(--paper-deep)',
                      color: isMe ? 'var(--paper)' : 'var(--ink)',
                      border: isMe ? 'none' : '1px solid var(--line-soft)',
                      fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.55,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {activeGroup && myCharId && (
            <div style={{ borderTop: '1px solid var(--line-soft)', padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setShowMeta(p => !p)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                    textTransform: 'uppercase', background: 'transparent',
                    border: `1px solid ${showMeta ? 'var(--ink)' : 'var(--line)'}`,
                    borderRadius: 999, padding: '2px 8px', cursor: 'pointer',
                    color: showMeta ? 'var(--ink)' : 'var(--ink-mute)' }}>
                  {showMeta ? '− metadados' : '+ metadados'}
                </button>
                {showMeta && (
                  <>
                    <input value={survivalDay} onChange={e => setSurvivalDay(e.target.value)}
                      placeholder="Dia" type="number" min={1}
                      style={{ width: 60, border: '1px solid var(--line)', borderRadius: 6,
                        padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 12,
                        background: 'var(--paper)', color: 'var(--ink)' }} />
                    <input value={sentAtTime} onChange={e => setSentAtTime(e.target.value)}
                      placeholder="Horário"
                      style={{ width: 70, border: '1px solid var(--line)', borderRadius: 6,
                        padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 12,
                        background: 'var(--paper)', color: 'var(--ink)' }} />
                    <input value={sessionNum} onChange={e => setSessionNum(e.target.value)}
                      placeholder="Sessão" type="number" min={1}
                      style={{ width: 70, border: '1px solid var(--line)', borderRadius: 6,
                        padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 12,
                        background: 'var(--paper)', color: 'var(--ink)' }} />
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <textarea value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={`Mensagem como ${tamerName(state, myCharId)}... (Enter para enviar)`}
                  rows={2}
                  style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10,
                    padding: '10px 14px', fontFamily: 'var(--font-body)', fontSize: 14,
                    background: 'var(--paper)', color: 'var(--ink)', resize: 'none',
                    outline: 'none' }} />
                <button onClick={sendMessage} disabled={sending || !input.trim()}
                  style={{ padding: '0 20px', borderRadius: 10,
                    border: '1px solid var(--ink)', cursor: 'pointer',
                    background: input.trim() ? 'var(--ink)' : 'transparent',
                    color: input.trim() ? 'var(--paper)' : 'var(--ink-mute)',
                    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
                    transition: 'all 0.12s', flexShrink: 0 }}>
                  {sending ? '...' : 'Enviar'}
                </button>
              </div>
            </div>
          )}

          {activeGroup && !myCharId && (
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line-soft)',
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)',
              textAlign: 'center' }}>
              {isGM
                ? 'Selecione um NPC acima para enviar mensagens.'
                : 'Sua conta não tem um personagem vinculado. Peça ao GM para configurar.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
