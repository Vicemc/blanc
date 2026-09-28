import type { Portrait } from '../../types'
import { getCampaignConfig, setCampaignConfig } from './config'

// Contatos extras do Digi-Zap cadastrados pelo GM (NPCs que não são tamers
// e não aparecem na Party). Persistidos em campaign_config.
export interface DigiZapContact {
  id:          string          // 'c-<slug>-<ts>' — usado como sender_id / participante
  name:        string
  portrait:    Portrait        // cor de fallback quando não há avatar
  avatar_url:  string | null
  archived?:   boolean         // removido das listas, mas mantém nome nas mensagens antigas
}

export const DIGIZAP_CONTACTS_KEY = 'digizap_contacts'

export async function getDigiZapContacts(): Promise<DigiZapContact[]> {
  const raw = await getCampaignConfig<DigiZapContact[]>(DIGIZAP_CONTACTS_KEY)
  return Array.isArray(raw) ? raw : []
}

export async function setDigiZapContacts(list: DigiZapContact[]) {
  return setCampaignConfig(DIGIZAP_CONTACTS_KEY, list)
}

export function newDigiZapContactId(name: string): string {
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'npc'
  return `c-${slug}-${Date.now().toString(36)}`
}
