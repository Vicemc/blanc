import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AppState, ClimaEntry, KeywordEntry, ConditionEntry } from '../types'
import { PageHead } from '../components/PageHead'
import { BASE_KEYWORDS, BASE_CONDITIONS, getEffectiveClimas, groupBy, ruleSlug, ruleTabFor } from '../data/rulesData'
import { useSettings } from '../lib/settings'
import styles from './SistemaPage.module.css'

// ── Tooltip ──────────────────────────────────────────────────────────────────
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className={styles.tip}>
      <span className={styles.tipLabel}>{label}</span>
      <span className={styles.tipBox}>{children}</span>
    </span>
  )
}

// ── Bold-text renderer (**text** → <b>text</b>) ───────────────────────────────
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <b key={i}>{p.slice(2, -2)}</b>
          : p
      )}
    </>
  )
}

// ── Kw card ──────────────────────────────────────────────────────────────────
interface KwProps { tag: string; tagVariant?: string; title: string; resist?: string; children: React.ReactNode; anchorId?: string; highlight?: boolean }
function Kw({ tag, tagVariant, title, resist, children, anchorId, highlight }: KwProps) {
  return (
    <div id={anchorId} className={styles.kw}
      style={highlight ? { outline: '2px solid var(--coral)', outlineOffset: 2, scrollMarginTop: 80 } : { scrollMarginTop: 80 }}>
      <span className={`${styles.kwTag} ${tagVariant ? styles['tag_' + tagVariant] : ''}`}>{tag}</span>
      <h4 className={styles.kwTitle}>{title}</h4>
      <p className={styles.kwText}>{children}</p>
      {resist && <div className={styles.kwResist}>Resistir: {resist}</div>}
    </div>
  )
}

// ── Rule section ─────────────────────────────────────────────────────────────
interface RuleProps { num: string; id: string; title: string; sub: string; children: React.ReactNode }
function Rule({ num, id, title, sub, children }: RuleProps) {
  const { isTaglineHidden } = useSettings()
  return (
    <section className={styles.rule} id={id}>
      <div className={styles.ruleNum}>{num}</div>
      <h2 className={styles.ruleTitle}>{title}</h2>
      {!isTaglineHidden('sistema') && <div className={styles.ruleSub}>{sub}</div>}
      {children}
    </section>
  )
}

// ── Keyword → display helpers ─────────────────────────────────────────────────
function kwTagLabel(kw: KeywordEntry): string {
  if (kw.type === 'reaction') return 'Reação'
  const cat = kw.category ?? ''
  if (cat === 'Neutro' || cat === 'Ação') return 'Ação'
  if (cat.includes('Ataque')) return 'Ataque'
  return kw.category ?? 'Keyword'
}

function kwTagVariant(kw: KeywordEntry): string {
  return kw.type === 'reaction' ? 'reaction' : ''
}

const KW_CAT_HEADER: Record<string, string> = {
  'Neutro':          'Tipo: Neutro / Ação',
  'Ação':            'Tipo: Neutro / Ação',
  'Ataque / Efeito': 'Tipo: Ataque / Efeito',
  'Reação':          'Tipo: Reação',
  'Reações':         'Tipo: Reação',
}

// ── Condition → display helpers ───────────────────────────────────────────────
function condTagLabel(c: ConditionEntry): string {
  switch (c.type) {
    case 'wound':    return 'Ferimento'
    case 'stack':    return 'Acumulação'
    case 'positive': return 'Positiva'
    case 'neg':      return 'Negativa'
    case 'reaction': return 'Reação'
    default:         return 'Condição'
  }
}

const COND_CAT_NOTE: Record<string, string> = {
  'Ferimento':              '· relógio até 10 cargas · ao estourar aplica efeito por 3 Rounds',
  'Acumulação':             '· limite varia',
  'Positivas de Acumulação': '',
  'Permanentes — Negativas': '',
  'Permanentes — Positivas': '',
}

// ── Clima card ────────────────────────────────────────────────────────────────
function WeatherCard({ icon, title, color, effects, extra, anchorId, highlight }: {
  icon: string; title: string; color?: string
  effects: ClimaEntry['effects']; extra?: React.ReactNode; anchorId?: string; highlight?: boolean
}) {
  return (
    <div id={anchorId} className={styles.kw}
      style={{ borderLeft: `3px solid var(--${color || 'line'})`, scrollMarginTop: 80,
        ...(highlight ? { outline: '2px solid var(--coral)', outlineOffset: 2 } : {}) }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <h4 className={styles.kwTitle} style={{ margin:0 }}>{title}</h4>
      </div>
      <p className={styles.kwText}>
        {effects.map((e, i) => (
          <span key={i}><b>{e.tag}:</b> {e.desc}{i < effects.length - 1 ? ' ' : ''}</span>
        ))}
      </p>
      {extra}
    </div>
  )
}

// ── Sub-abas do Sistema ───────────────────────────────────────────────────────
const TABS = [
  { id: 'regras',   label: 'Regras' },
  { id: 'climas',   label: 'Climas' },
  { id: 'digivice', label: 'Digivice' },
]

const TOC = [
  ['turnos','Turnos'],['rolagens','Rolagens'],['defesa','Defesa'],['dano','Dano'],
  ['evolucao','Digievolução'],['grid','Grid'],['domains','Domains'],['keywords','Keywords'],['condicoes','Condições'],
]

// ── Aba Regras ────────────────────────────────────────────────────────────────
function RegraTab({ state, focusSlug }: { state?: AppState; focusSlug?: string | null }) {
  const mergedKeywords   = (state?.customKeywords   ?? []).length > 0 ? state!.customKeywords   : BASE_KEYWORDS
  const mergedConditions = (state?.customConditions ?? []).length > 0 ? state!.customConditions : BASE_CONDITIONS

  const kwGroups   = groupBy(mergedKeywords,   k => k.category ?? 'Outros')
  const condGroups = groupBy(mergedConditions, c => c.category)

  useEffect(() => {
    if (!focusSlug) return
    const el = document.getElementById(`kw-${focusSlug}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusSlug])

  return (
    <div className={styles.page}>
      <nav className={styles.toc}>
        {TOC.map(([id,label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <Rule num="01" id="turnos" title="Turnos & Ações" sub="o ritmo do combate">
        <ul>
          <li>Todos começam com <b>3 de Memory</b>.</li>
          <li>Cada dupla (Tamer + Digimon) age no mesmo turno: 1 ação de movimento + 1 ação complexa cada.</li>
          <li><Tip label="Blitz">Ação vira Ação Livre. Só pode ser ativada 1x por Round.</Tip> torna uma ação em Ação Livre (1x por Round).</li>
        </ul>
      </Rule>

      <Rule num="02" id="rolagens" title="Rolagens" sub="a pool, o dado, o destino">
        <div className={styles.callout}><b>Pool:</b> Atributo + Skill + Elemento (quando aplicável). Sucesso: resultado ≥ 7. Crítico: 5 sucessos. <b>1</b> cancela 1 sucesso. <b>10</b> explode.</div>
        <ul>
          <li>Skill com 0 pontos: mental −2 dados, físico/social −1 dado.</li>
          <li>Se pool chegar a 0 ou negativo: <b>Chance Roll</b> (1d10; sucesso só com 10).</li>
        </ul>
      </Rule>

      <Rule num="03" id="defesa" title="Defesa & Armadura" sub="o escudo entre o ferro e a carne">
        <ul>
          <li>Ao ser atacado: Defesa do alvo reduz em 1 → reduz a pool do atacante pela Defesa atual.</li>
          <li><b>Digital Body:</b> Caso seja atacado por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.</li>
          <li><b>Armadura:</b> defesa fixa que não é reduzida sem <Tip label="Piercing">Ignora Blocker e não sofre redução pela Defesa. Ao causar dano, reduz Armadura pelo Security Attack atual.</Tip>; não dobra com Digital Body.</li>
        </ul>
      </Rule>

      <Rule num="04" id="dano" title="Dano" sub="como o ferro encontra o nervo">
        <ul><li><b>Dano normal:</b> conta o número de sucessos.</li><li><b>Dano fixo:</b> quando a skill especifica.</li></ul>
      </Rule>

      <Rule num="05" id="evolucao" title="Digievolução" sub="o grito mais alto do digivice">
        <ul>
          <li>Digievolução é uma <b>ação complexa</b>. Paga o custo de Memory ao declarar.</li>
          <li>Quando termina o cooldown/duração, retorna ao estágio anterior automaticamente.</li>
        </ul>
      </Rule>

      <Rule num="06" id="grid" title="Grid" sub="a planície quadriculada do real">
        <p>Combate usa <b>grid em quadrados</b>. 1 metro = 1 quadrado.</p>
      </Rule>

      <Rule num="07" id="domains" title="Domains, Chaves e Fechaduras" sub="um campo conjurado em torno do mundo">
        <ul>
          <li>Digivices são <b>Chaves</b> (Players) e <b>Fechaduras</b> (NPCs).</li>
          <li>Em combate: <b>5–6 players + 1 Domain</b> por campo.</li>
          <li>Domain protege humanos contra ataques de Digimon, exceto <Tip label="Assassinate">Ignora imunidades e proteções. Não é redirecionado por Decoy. Permite escolher alvo livremente.</Tip>.</li>
          <li>PCs (Chaves) entram e saem dos Domains livremente.</li>
          <li>Com Domain ligado, outros Fechaduras ficam do lado de fora.</li>
        </ul>
        <div className={styles.callout}><b>Janela de troca:</b> ao desativar um Domain, ele só pode ser reativado após o turno do seu dono — humanos ficam expostos por <b>1 Round</b>.</div>
      </Rule>

      {/* ── Rule 08: Keywords (data-driven) ─────────────────────────────────── */}
      <Rule num="08" id="keywords" title="Palavras-chave" sub="o vocabulário escondido das fichas">
        {kwGroups.map(([cat, entries]) => (
          <div key={cat}>
            <h3 className={styles.ruleH3}>{KW_CAT_HEADER[cat] ?? cat}</h3>
            <div className={styles.kwGrid}>
              {entries.map(kw => {
                const slug = ruleSlug(kw.keyword)
                return (
                  <Kw key={kw.id} tag={kwTagLabel(kw)} tagVariant={kwTagVariant(kw)} title={kw.keyword} resist={kw.resist}
                    anchorId={`kw-${slug}`} highlight={focusSlug === slug}>
                    <RichText text={kw.desc} />
                  </Kw>
                )
              })}
            </div>
          </div>
        ))}
      </Rule>

      {/* ── Rule 09: Condições (data-driven) ────────────────────────────────── */}
      <Rule num="09" id="condicoes" title="Condições" sub="o que arde, o que esfria, o que se acumula">
        {condGroups.map(([cat, entries]) => (
          <div key={cat}>
            <h3 className={styles.ruleH3}>
              {cat}
              {COND_CAT_NOTE[cat] ? (
                <span style={{opacity:0.5,fontSize:11,fontFamily:'var(--font-mono)',fontWeight:400}}> {COND_CAT_NOTE[cat]}</span>
              ) : null}
            </h3>
            <div className={styles.kwGrid}>
              {entries.map(c => {
                const slug = ruleSlug(c.name)
                return (
                  <Kw key={c.id} tag={condTagLabel(c)} tagVariant={c.type} title={c.name} resist={c.resist}
                    anchorId={`kw-${slug}`} highlight={focusSlug === slug}>
                    <RichText text={c.desc} />
                  </Kw>
                )
              })}
            </div>
          </div>
        ))}
      </Rule>
    </div>
  )
}

// ── Estilos compartilhados ────────────────────────────────────────────────────
const fldStyle: React.CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 8, padding: '7px 12px',
  fontFamily: 'var(--font-body)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)',
}

// ── Aba Climas ────────────────────────────────────────────────────────────────
function ClimasTab({ state, onUpdate, isGM, focusSlug }: { state?: AppState; onUpdate?: (s: AppState) => void; isGM: boolean; focusSlug?: string | null }) {
  const [addingClima, setAddingClima] = useState(false)
  const [draft, setDraft] = useState({ name: '', type: 'Natural' as 'Natural'|'Não Natural', color: 'teal', icon: '🌀', effects: '' })

  const effectiveClimas = getEffectiveClimas(state?.customClimas ?? [])
  const isCustomized = (state?.customClimas ?? []).length > 0

  useEffect(() => {
    if (!focusSlug) return
    const el = document.getElementById(`kw-${focusSlug}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusSlug])

  const saveClima = () => {
    if (!draft.name.trim() || !state || !onUpdate) return
    const c: ClimaEntry = {
      id:      `clima-${Date.now().toString(36)}`,
      name:    draft.name.trim(),
      type:    draft.type,
      color:   draft.color,
      icon:    draft.icon,
      effects: draft.effects.trim()
        ? draft.effects.split('\n').filter(Boolean).map(l => {
            const [tag, ...rest] = l.split(':')
            return { tag: tag.trim(), desc: rest.join(':').trim(), color: 'ink-soft' }
          })
        : [{ tag: 'Neutro', desc: 'Sem efeitos adicionais.', color: 'ink-mute' }],
      gm_only: false,
    }
    onUpdate({ ...state, customClimas: [...effectiveClimas, c] })
    setDraft({ name: '', type: draft.type, color: 'teal', icon: '🌀', effects: '' })
    setAddingClima(false)
  }

  const removeClima = (id: string) => {
    if (!state || !onUpdate) return
    onUpdate({ ...state, customClimas: effectiveClimas.filter(c => c.id !== id) })
  }

  return (
    <div className={styles.page} style={{ maxWidth: 820 }}>
      <section className={styles.rule}>
        <div className={styles.ruleNum}>☁</div>
        <h2 className={styles.ruleTitle}>Climas</h2>
        <div className={styles.ruleSub}>apenas um tipo de clima pode estar ativo por vez</div>
        <div className={styles.callout}>
          Climas alteram o ambiente de batalha — ativam skills, modificam ataques e efeitos, podendo causar dano ou afetar atributos. Um novo clima <b>remove o anterior</b>.
        </div>

        <div className={styles.callout}>
          <b>Climas Naturais</b> podem surgir espontaneamente durante os dias de sobrevivência no Mundo Digital, sem depender de habilidades ou ações específicas.
        </div>
        <div className={styles.kwGrid} style={{ marginTop: 12 }}>
          {effectiveClimas.filter(c => c.type === 'Natural').map(c => (
            <WeatherCard key={c.id} icon={c.icon} title={c.name} color={c.color} effects={c.effects}
              anchorId={`kw-${ruleSlug(c.name)}`} highlight={focusSlug === ruleSlug(c.name)}
              extra={isGM && isCustomized ? (
                <button onClick={() => removeClima(c.id)}
                  style={{ display:'block', marginTop:8, fontFamily:'var(--font-mono)', fontSize:9,
                    letterSpacing:'0.08em', textTransform:'uppercase', background:'transparent',
                    border:'1px solid var(--coral)', borderRadius:999, padding:'2px 8px',
                    cursor:'pointer', color:'var(--coral)' }}>× remover</button>
              ) : undefined} />
          ))}
        </div>

        <div className={styles.callout} style={{ marginTop: 24 }}>
          <b>Climas Não Naturais</b> não surgem espontaneamente no Mundo Digital — são provocados por habilidades, fenômenos anômalos, Domains, Digimons específicos, programas corrompidos ou efeitos sobrenaturais. Diferente dos Climas Naturais, geralmente manifestam-se através de interferências artificiais, distorções de dados ou poderes capazes de alterar temporariamente a realidade ao redor.
        </div>
        {effectiveClimas.some(c => c.type === 'Não Natural') && (
          <div className={styles.kwGrid} style={{ marginTop: 12 }}>
            {effectiveClimas.filter(c => c.type === 'Não Natural').map(c => (
              <WeatherCard key={c.id} icon={c.icon} title={c.name} color={c.color} effects={c.effects}
                anchorId={`kw-${ruleSlug(c.name)}`} highlight={focusSlug === ruleSlug(c.name)}
                extra={isGM && isCustomized ? (
                  <button onClick={() => removeClima(c.id)}
                    style={{ display:'block', marginTop:8, fontFamily:'var(--font-mono)', fontSize:9,
                      letterSpacing:'0.08em', textTransform:'uppercase', background:'transparent',
                      border:'1px solid var(--coral)', borderRadius:999, padding:'2px 8px',
                      cursor:'pointer', color:'var(--coral)' }}>× remover</button>
                ) : undefined} />
            ))}
          </div>
        )}

        {isGM && !addingClima && (
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button onClick={() => setAddingClima(true)}
              style={{ padding: '7px 18px', borderRadius: 999, cursor: 'pointer',
                border: '1px solid var(--line)', background: 'transparent',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--ink-soft)' }}>
              + Novo Clima
            </button>
            {isCustomized && (
              <button onClick={() => onUpdate?.({ ...state!, customClimas: [] })}
                style={{ padding: '7px 18px', borderRadius: 999, cursor: 'pointer',
                  border: '1px solid var(--line)', background: 'transparent',
                  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-mute)' }}>
                Restaurar padrões
              </button>
            )}
          </div>
        )}
        {isGM && addingClima && (
          <div style={{ marginTop: 16, padding: '16px', border: '1px solid var(--line)',
            borderRadius: 10, background: 'var(--paper-deep)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:8, marginBottom:8 }}>
              <input value={draft.name} onChange={e => setDraft(p=>({...p,name:e.target.value}))}
                placeholder="Nome do clima *" style={fldStyle} />
              <select value={draft.type} onChange={e => setDraft(p=>({...p,type:e.target.value as any}))} style={fldStyle}>
                <option value="Natural">Natural</option><option value="Não Natural">Não Natural</option>
              </select>
              <input value={draft.icon} onChange={e => setDraft(p=>({...p,icon:e.target.value}))}
                placeholder="🌀" style={fldStyle} />
              <input value={draft.color} onChange={e => setDraft(p=>({...p,color:e.target.value}))}
                placeholder="teal" style={fldStyle} />
            </div>
            <textarea value={draft.effects} onChange={e => setDraft(p=>({...p,effects:e.target.value}))}
              placeholder={'Efeitos (uma por linha):\nFogo +2: Ataques de Fogo causam +2 de dano.\nÁgua −2: Ataques de Água causam −2 de dano.'}
              rows={3} style={{ ...fldStyle, width:'100%', resize:'vertical', marginBottom:8 }} />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={saveClima} style={{ padding:'7px 16px', borderRadius:999, cursor:'pointer',
                border:'1px solid var(--ink)', background:'var(--ink)', color:'var(--paper)',
                fontFamily:'var(--font-body)', fontWeight:600, fontSize:13 }}>Adicionar</button>
              <button onClick={() => setAddingClima(false)} style={{ padding:'7px 14px', borderRadius:999,
                cursor:'pointer', border:'1px solid var(--line)', background:'transparent',
                fontFamily:'var(--font-body)', fontSize:13, color:'var(--ink-mute)' }}>Cancelar</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Aba Digivice ──────────────────────────────────────────────────────────────
function DigiviceTab() {
  return (
    <div className={styles.page} style={{ maxWidth: 820 }}>
      <section className={styles.rule}>
        <div className={styles.ruleNum}>⌚</div>
        <h2 className={styles.ruleTitle}>Regras do Digivice</h2>
        <div className={styles.ruleSub}>chaves & fechaduras</div>

        <h3 className={styles.ruleH3}>Ambos os Tipos</h3>
        <ul>
          <li>Os Digivices entram em <b>carregamento automático</b> todo dia às <b>00h</b>.</li>
          <li><b>NÃO É possível</b> tirar o Digivice do modo de Descanso após ele entrar nesse estado.</li>
          <li><b>Digitize</b> — adquirido pelo CD da Ledo. Digitaliza qualquer item do mundo digital com entidade própria e sem dono. Limite de <b>1 Tera</b> no inventário de Digitize.</li>
          <li><b>Runaway Trailmon</b> — adquirido pelo CD da Chi. Permite chamar os Trailmons para viagem rápida, contanto que haja terminais criados pelo [Domain of Sky] na zona de origem e destino. Cada Digivice ganha <b>5 tickets por dia</b>; resetam às 6h.</li>
        </ul>

        <h3 className={styles.ruleH3}>Digivice: Chave <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)', fontWeight:400 }}>· Players</span></h3>
        <ul>
          <li>Acumula <b>Autoridade</b> ao vencer SIGNs e absorver seus códigos.</li>
          <li>Capaz de abrir <b>Authority Walls</b> de autoridade equivalente ou inferior.</li>
          <li>Ao entrar em batalha, a Memory <b>reseta para 3</b> (exceto se tiver 4+ de Memory acumulados).</li>
          <li>Pode gastar Memory fora de batalha até um limite de 6 gastos (chegando a −3 de Memory). Para resetar, entrar em batalha ou usar [Charge].</li>
          <li><b>[Charge]</b> — em batalha: seta a Memory imediatamente para 3. Fora de batalha: o Digivice adormece por 3 horas.</li>
        </ul>

        <h3 className={styles.ruleH3}>Digivice: Fechadura <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-mute)', fontWeight:400 }}>· NPCs</span></h3>
        <ul>
          <li>Cria <b>Domains</b>. Tamanho máximo: <b>40×40</b>. Altura e largura alteráveis em múltiplos de 5 (sempre iguais entre si).</li>
          <li>O dono define quem pode entrar e sair do Domain.</li>
          <li>Personagem fora do Domain pode interagir com aliados dentro, mas <b>não</b> com inimigos dentro.</li>
          <li>O Domain <b>não segue seu dono</b>. Se o dono se afastar demais, o Domain se desativa automaticamente.</li>
          <li>Domains podem ser ativados fora de batalhas.</li>
          <li>Se um Domain for ativado com outros Digivices do tipo Fechadura por perto, os donos são afastados para fora dos limites.</li>
          <li><b>NÃO TEM</b> a função de [Charge]. Carregam apenas pelo desligamento automático às 00h.</li>
        </ul>
      </section>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface SistemaProps {
  state?:    AppState
  onUpdate?: (s: AppState) => void
  isGM?:     boolean
}

export default function SistemaPage({ state, onUpdate, isGM = false }: SistemaProps) {
  const [tab, setTab] = useState<'regras'|'climas'|'digivice'>('regras')
  const [focusSlug, setFocusSlug] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Link cruzado vindo de uma ficha: /sistema?kw=<keyword>
  useEffect(() => {
    const kw = searchParams.get('kw')
    if (!kw) return
    const slug = ruleSlug(kw)
    setTab(ruleTabFor(kw, state?.customClimas ?? []))
    setFocusSlug(slug)
    // Remove o param da URL para não re-focar em navegações futuras
    searchParams.delete('kw')
    setSearchParams(searchParams, { replace: true })
    const t = setTimeout(() => setFocusSlug(null), 2600)
    return () => clearTimeout(t)
  }, [searchParams, setSearchParams, state?.customClimas])

  return (
    <div>
      <PageHead title="Sistema" tag="o vocabulário escondido das fichas" pageId="sistema" />
      <div className={styles.subTabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`${styles.subTab} ${tab === t.id ? styles.subTabActive : ''}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'regras'   && <RegraTab state={state} focusSlug={focusSlug} />}
      {tab === 'climas'   && <ClimasTab state={state} onUpdate={onUpdate} isGM={isGM} focusSlug={focusSlug} />}
      {tab === 'digivice' && <DigiviceTab />}
    </div>
  )
}
