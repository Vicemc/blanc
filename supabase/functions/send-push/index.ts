// Edge Function: send-push
// Recebe { group_id, sender_id, content, message_id } (chamada pelo trigger
// digizap_push_trigger) e envia Web Push para os inscritos do grupo, exceto o
// remetente.
//
// Variáveis de ambiente (Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL              (injetada automaticamente)
//   SUPABASE_SERVICE_ROLE_KEY (injetada automaticamente)
//   VAPID_PUBLIC_KEY          chave pública VAPID (mesma do VITE_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY         chave privada VAPID
//   VAPID_SUBJECT             ex: "mailto:gm@example.com"
//
// Deploy: supabase functions deploy send-push
// Gere as chaves VAPID com: npx web-push generate-vapid-keys

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface Payload {
  group_id:   string
  sender_id:  string
  content:    string
  message_id: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

Deno.serve(async (req) => {
  try {
    const body = (await req.json()) as Payload
    const { group_id, sender_id, content, message_id } = body
    if (!group_id) return new Response('missing group_id', { status: 400 })

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Participantes do grupo (character_ids)
    const { data: group } = await supabase
      .from('digi_zap_groups')
      .select('name, participants')
      .eq('id', group_id)
      .single()

    const participants: string[] = (group?.participants ?? []) as string[]
    // Destinatários = participantes, menos o remetente
    const recipients = participants.filter((c) => c !== sender_id)
    if (recipients.length === 0) return new Response('no recipients', { status: 200 })

    // Nome amigável do remetente (best-effort a partir do app_state)
    let senderName = 'Alguém'
    const { data: stateRow } = await supabase
      .from('app_state')
      .select('state')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    const tamers = (stateRow?.state?.tamers ?? []) as { id: string; name: string }[]
    const survivors = (stateRow?.state?.survivors ?? []) as { id: string; name: string }[]
    const match = [...tamers, ...survivors].find((t) => t.id === sender_id)
    if (match) senderName = match.name

    // Inscrições dos destinatários
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('character_id', recipients)

    if (!subs || subs.length === 0) return new Response('no subscriptions', { status: 200 })

    const notification = JSON.stringify({
      title: `${senderName} — ${group?.name ?? 'Digi-Zap'}`,
      body:  content?.slice(0, 140) || 'Nova mensagem',
      tag:   `digizap-${group_id}`,
      url:   '/digizap',
      message_id,
    })

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notification,
        ),
      ),
    )

    // Limpa inscrições expiradas (410 Gone / 404).
    const stale: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const code = (r.reason as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) stale.push(subs[i].endpoint)
      }
    })
    if (stale.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale)
    }

    return new Response(JSON.stringify({ sent: subs.length - stale.length, pruned: stale.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 })
  }
})
