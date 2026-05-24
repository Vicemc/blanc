// src/pages/DigiZapPage.tsx
// Chat Realtime do Digi-Zap entre personagens.
// Grupos: SURVIVORS (todos os tamers), Sanbaka (Naoki/Shinra/Kumo), e bilaterais (PC ↔ NPC).

import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppState } from '../types'
import type { UserProfile } from '../lib/auth'
import { supabase } from '../lib/supabase'

interface Props {
  state:   AppState
  profile: UserProfile | null
  isGM:    boolean
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

// ── DigiZapPage ───────────────────────────────────────────────────────────────

export default function DigiZapPage({ state, profile, isGM }: Props) {
  const [groups,         setGroups]         = useState<DigiZapGroup[]>([])
  const [activeGroupId,  setActiveGroupId]  = useState<string | null>(null)
  const [messages,       setMessages]       = useState<DigiZapMessage[]>([])
  const [input,          setInput]          = useState('')
  const [survivalDay,    setSurvivalDay]    = useState<string>('')
  const [sentAtTime,     setSentAtTime]     = useState<string>('')
  const [sessionNum,     setSessionNum]     = useState<string>('')
  const [showMeta,       setShowMeta]       = useState(false)
  const [sending,        setSending]        = useState(false)
  const [loadingMsgs,    setLoadingMsgs]    = useState(false)
  const [npcView,        setNpcView]        = useState<string>('')  // GM: envia como qual NPC
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Meu character_id (GM pode escolher um NPC)
  const myCharId = isGM
    ? (npcView || null)
    : (profile?.tamer_id ?? null)

  // ── Carregar grupos ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase) return

    supabase.from('digi_zap_groups')
      .select('*')
      .order('name')
      .then(({ data }) => {
        const groups = (data ?? []) as DigiZapGroup[]
        setGroups(groups)
        // Selecionar primeiro grupo automaticamente
        if (groups.length > 0 && !activeGroupId) {
          setActiveGroupId(groups[0].id)
        }
      })
  }, [])

  // ── Carregar mensagens do grupo ativo ────────────────────────────────────

  const loadMessages = useCallback(async (groupId: string) => {
    if (!supabase) return
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('digi_zap_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
    setMessages((data ?? []) as DigiZapMessage[])
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    if (!activeGroupId) return
    loadMessages(activeGroupId)
  }, [activeGroupId, loadMessages])

  // ── Realtime: ouvir novas mensagens ─────────────────────────────────────

  useEffect(() => {
    if (!supabase || !activeGroupId) return

    const channel = supabase
      .channel(`digizap-${activeGroupId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'digi_zap_messages',
        filter: `group_id=eq.${activeGroupId}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as DigiZapMessage])
      })
      .subscribe()

    return () => { supabase?.removeChannel(channel) }
  }, [activeGroupId])

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
    const participants = [myCharId, npcId].sort()
    const name = `${tamerName(state, myCharId)} ↔ ${tamerName(state, npcId)}`

    // Verificar se já existe
    const existing = groups.find(g =>
      g.kind === 'bilateral' &&
      g.participants.includes(myCharId) &&
      g.participants.includes(npcId)
    )
    if (existing) { setActiveGroupId(existing.id); return }

    const { data } = await supabase.from('digi_zap_groups')
      .insert({ kind: 'bilateral', name, participants })
      .select('*').single()

    if (data) {
      const newGroup = data as DigiZapGroup
      setGroups(prev => [...prev, newGroup])
      setActiveGroupId(newGroup.id)
    }
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

  // NPCs disponíveis para o GM assumir ou para iniciar conversa bilateral
  const npcIds = ['t-hare', 't-kanade', 't-shinra', 't-kumo', 't-emi', 't-hibito']
  const allCharIds = [...npcIds, ...state.tamers.map(t => t.id)]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', height: 'calc(100vh - 57px)',
      display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '20px 32px 0', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36,
          textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Digi-Zap
        </h1>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic',
          fontSize: 16, color: 'var(--ink-soft)', marginBottom: 16 }}>
          ~ mensagens entre sobreviventes ~
        </div>

        {/* GM: seletor de NPC para assumir */}
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
                color: 'var(--ink)' }}>
              <option value="">— GM (observador) —</option>
              {allCharIds.map(id => (
                <option key={id} value={id}>{tamerName(state, id)}</option>
              ))}
            </select>
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

          {groups.filter(g => g.kind === 'group').map(g => (
            <button key={g.id} onClick={() => setActiveGroupId(g.id)}
              style={{ padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                background: activeGroupId === g.id ? 'var(--ink)' : 'transparent',
                color: activeGroupId === g.id ? 'var(--paper)' : 'var(--ink-soft)',
                transition: 'all 0.12s' }}>
              {g.name}
            </button>
          ))}

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ink-mute)', padding: '12px 4px 6px' }}>
            Conversas
          </div>

          {groups.filter(g => g.kind === 'bilateral').map(g => (
            <button key={g.id} onClick={() => setActiveGroupId(g.id)}
              style={{ padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 13,
                background: activeGroupId === g.id ? 'var(--ink)' : 'transparent',
                color: activeGroupId === g.id ? 'var(--paper)' : 'var(--ink-soft)',
                transition: 'all 0.12s' }}>
              {g.name}
            </button>
          ))}

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
              background: 'var(--paper-deep)', fontFamily: 'var(--font-display)',
              fontSize: 16, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              {activeGroup.name}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                letterSpacing: '0.1em', color: 'var(--ink-mute)', marginLeft: 10,
                fontWeight: 400, textTransform: 'none' }}>
                {activeGroup.participants.length} participante{activeGroup.participants.length !== 1 ? 's' : ''}
              </span>
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
              const isMe = msg.sender_id === myCharId
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
                    {/* Meta */}
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--ink-mute)', marginBottom: 4,
                      textAlign: isMe ? 'right' : 'left' }}>
                      {senderName}
                      {msg.survival_day && ` · Dia ${msg.survival_day}`}
                      {msg.sent_at_time && ` · ${msg.sent_at_time}`}
                      {msg.session_num  && ` · Sessão ${msg.session_num}`}
                    </div>

                    {/* Conteúdo */}
                    <div style={{
                      padding: '10px 14px', borderRadius: isMe ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
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
              {/* Meta opcional */}
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
                      placeholder="Horário" style={{ width: 70, border: '1px solid var(--line)',
                        borderRadius: 6, padding: '3px 8px', fontFamily: 'var(--font-mono)',
                        fontSize: 12, background: 'var(--paper)', color: 'var(--ink)' }} />
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

          {/* Sem personagem selecionado */}
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