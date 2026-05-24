import React, { useState } from 'react'
import type { AppState, ClimaEntry, KeywordEntry } from '../types'
import { PageHead } from '../components/PageHead'
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

// ── Kw card ──────────────────────────────────────────────────────────────────
interface KwProps { tag: string; tagVariant?: string; title: string; resist?: string; children: React.ReactNode }
function Kw({ tag, tagVariant, title, resist, children }: KwProps) {
  return (
    <div className={styles.kw}>
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
  return (
    <section className={styles.rule} id={id}>
      <div className={styles.ruleNum}>{num}</div>
      <h2 className={styles.ruleTitle}>{title}</h2>
      <div className={styles.ruleSub}>{sub}</div>
      {children}
    </section>
  )
}

// ── Clima card ────────────────────────────────────────────────────────────────
function WeatherCard({ icon, title, variant, children }: { icon: string; title: string; variant?: string; children: React.ReactNode }) {
  return (
    <div className={`${styles.kw} ${variant ? styles['tag_' + variant] + 'border' : ''}`}
      style={{ borderLeft: `3px solid var(--${variant === 'sun' ? 'orange' : variant === 'fog' ? 'indigo' : variant === 'rain' ? 'blue' : 'line'})` }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <h4 className={styles.kwTitle} style={{ margin:0 }}>{title}</h4>
      </div>
      <p className={styles.kwText}>{children}</p>
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
function RegraTab() {
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

      <Rule num="08" id="keywords" title="Palavras-chave" sub="o vocabulário escondido das fichas">
        <h3 className={styles.ruleH3}>Tipo: Ação</h3>
        <div className={styles.kwGrid}>
          <Kw tag="Ação" title="Blitz">Ação vira <b>Ação Livre</b>. Só pode ser ativada <b>1x por Round</b>.</Kw>
          <Kw tag="Ação" title="Delay">Ação é consumida ao declarar, mas resolve depois. Entra em [Cooldown 1] e ao acabar resolve sem custo.</Kw>
          <Kw tag="Ação" title="Cooldown">Após o uso, a ação fica indisponível por <b>X Rounds</b>.</Kw>
        </div>
        <h3 className={styles.ruleH3}>Tipo: Ataque / Efeito</h3>
        <div className={styles.kwGrid}>
          <Kw tag="Ataque" title="Security Attack">Modifica quanto de Defesa o ataque reduz do alvo. Também afeta a redução de Armadura com [Piercing].</Kw>
          <Kw tag="Ataque" title="Blast">Atinge todos num raio X a partir de um ponto no alcance. Apenas a <b>maior Defesa</b> entre os alvos é reduzida da rolagem.</Kw>
          <Kw tag="Ataque" title="Jamming">Ignora <b>Digital Body</b> e quaisquer variações.</Kw>
          <Kw tag="Ataque" title="Alliance">Pode consumir ação de aliado no alcance. Ataque recebe [Security Attack +1] e adiciona dados = valor de uma Afinidade do aliado.</Kw>
          <Kw tag="Ataque" title="Piercing">Ignora [Blocker] e não sofre redução de dados pela Defesa. Ao causar dano, reduz Armadura pelo [Security Attack] atual.</Kw>
          <Kw tag="Ataque" title="Assassinate">Ignora [Imune], [Inefetivo], [Resistente]. Não é redirecionado por [Decoy]. Permite escolher alvo livremente.</Kw>
        </div>
        <h3 className={styles.ruleH3}>Tipo: Reações</h3>
        <div className={styles.kwGrid}>
          <Kw tag="Reação" tagVariant="reaction" title="Counter">Quando alvo de ataque corpo a corpo, rola <b>Força + Briga</b>. Se vencer, anula e causa dano. Não funciona vs nível 5+.</Kw>
          <Kw tag="Reação" tagVariant="reaction" title="Blocker">Intercepta ataque a um aliado, teleportando-se e recebendo o golpe no lugar. Blocker é removido após.</Kw>
          <Kw tag="Reação" tagVariant="reaction" title="Save">Retorna o Digimon ao Digivice. Pode voltar como Ação Livre no próximo turno do Domador.</Kw>
          <Kw tag="Reação" tagVariant="reaction" title="Armor Purge">Quando Digimon sofreria dano fatal, remove 1 carga de [Armor Evolution] e reduz o dano a 0.</Kw>
        </div>
      </Rule>

      <Rule num="09" id="condicoes" title="Condições" sub="o que arde, o que esfria, o que se acumula">
        <h3 className={styles.ruleH3}>Ferimento <span style={{opacity:0.5,fontSize:11,fontFamily:'var(--font-mono)'}}>· relógio até 10 cargas · ao estourar aplica efeito por 3 Rounds</span></h3>
        <div className={styles.kwGrid}>
          <Kw tag="Ferimento" tagVariant="wound" title="Burn" resist="Vigor + Resistência">Ao estourar: <b>7 dano</b> (humano: 2). Por 3 Rounds, no fim do turno sofre o mesmo dano.</Kw>
          <Kw tag="Ferimento" tagVariant="wound" title="Poison" resist="Vigor + Resistência">Ao estourar: <b>1 dano</b>. Por 3 Rounds, ao rolar dados sofre 1 dano por dado rolado.</Kw>
          <Kw tag="Ferimento" tagVariant="wound" title="Bleed" resist="Vigor + Resistência">Ao estourar: <b>3 dano</b>. Por 3 Rounds, ao mover ou atacar corpo a corpo sofre 2 dano.</Kw>
          <Kw tag="Ferimento" tagVariant="wound" title="Curse" resist="Perseverança + Resistência">Ao estourar: perde <b>2 Memory</b>. Por 3 Rounds, no fim do turno perde 1 Memory; sem Memory, perde HP equivalente.</Kw>
        </div>
        <h3 className={styles.ruleH3}>Acumulação <span style={{opacity:0.5,fontSize:11,fontFamily:'var(--font-mono)'}}>· limite varia</span></h3>
        <div className={styles.kwGrid}>
          <Kw tag="Acumulação" tagVariant="stack" title="Sleep (máx 3)" resist="Vigor + Resistência">1ª carga recupera HP total. Adormecido não age/reage, Defesa ignorada, ataques causam dano total. Remove no fim do próximo turno ou ao sofrer dano.</Kw>
          <Kw tag="Acumulação" tagVariant="stack" title="Charm (máx 3)" resist="Autocontrole + Resistência">Próxima ação é controlada pelo aplicador. Cargas extras controlam ações extras. Remove após executar.</Kw>
          <Kw tag="Acumulação" tagVariant="stack" title="Bind (máx 5)" resist="Destreza + Resistência">−5 Deslocamento por carga. Se Deslocamento chegar a 0, no próximo turno perde o turno e remove cargas.</Kw>
          <Kw tag="Acumulação" tagVariant="stack" title="Paralysis (máx 5)" resist="Perseverança + Resistência">−3 dados em <b>todas</b> as rolagens. No fim do turno remove 1 carga.</Kw>
          <Kw tag="Acumulação" tagVariant="stack" title="Mist (máx 10)" resist="Destreza + Resistência">A cada 2 cargas, dano recebido +1. Com 9+ cargas, rolagens contra o alvo ganham +1 sucesso.</Kw>
          <Kw tag="Acumulação" tagVariant="stack" title="De-Digivolve (máx 3)" resist="Perseverança + Resistência">Regride 1 nível por carga (cargas simultâneas acumulam). Após regressão, remove todas as cargas.</Kw>
          <Kw tag="Acumulação" tagVariant="stack" title="Decoy (máx 3)" resist="Presença + Resistência">No início do turno de cada inimigo, ele rola Inteligência + Resistência. Falha obriga a atacar o alvo do Decoy. Remove 1 carga no fim do turno do afetado.</Kw>
        </div>
        <h3 className={styles.ruleH3}>Positivas de Acumulação</h3>
        <div className={styles.kwGrid}>
          <Kw tag="Positiva" tagVariant="positive" title="Flight">Imune a ataques corpo a corpo. Ignora obstáculos e áreas impassáveis. No fim do turno perde 1 carga.</Kw>
          <Kw tag="Positiva" tagVariant="positive" title="Haste (máx 2)">+5 Deslocamento por carga. Se Deslocamento ≥ 21, ganha turno extra (iniciativa = metade do principal). Remove todas ao ativar.</Kw>
        </div>
        <h3 className={styles.ruleH3}>Permanentes — Negativas</h3>
        <div className={styles.kwGrid}>
          <Kw tag="Negativa" tagVariant="neg" title="Blind" resist="Raciocínio + Resistência">Todas as rolagens viram <b>Chance Rolls</b> (1d10, sucesso só com 10). Ações de escolha de alvo também.</Kw>
          <Kw tag="Negativa" tagVariant="neg" title="Rage" resist="Autocontrole + Resistência">+1 sucesso em ataques no próprio turno, mas <b>deve atacar quem aplicou</b>. Se não causar dano, −2 sucessos em tudo no turno seguinte; depois remove.</Kw>
          <Kw tag="Negativa" tagVariant="neg" title="Big Bad Wolf" resist="Força + Resistência">Ações de Ledo contra o alvo ganham efeitos extras descritos nas skills. Dura até fim do combate ou remoção específica.</Kw>
          <Kw tag="Negativa" tagVariant="neg" title="Sacrifice (só humanos)">Memory vai a 0 e fica bloqueada. Alvo não age/reage nem pode sair. Um [SIGN] pode converter 30% do MAXHP em Memory. Só remove com ação complexa + Digivice de autoridade ≥ do [SIGN].</Kw>
        </div>
        <h3 className={styles.ruleH3}>Permanentes — Positivas</h3>
        <div className={styles.kwGrid}>
          <Kw tag="Positiva" tagVariant="positive" title="Phantasm">Não pode receber Blocker/Decoy nem ser alvo de ataques/efeitos. Se atacar, acerta automaticamente e causa dano total. Remove ao atacar.</Kw>
          <Kw tag="Positiva" tagVariant="positive" title="Armor Evolution">Muda o nível para Armor. Permanece enquanto a barra Digimental for maior que 0.</Kw>
          <Kw tag="Positiva" tagVariant="positive" title="Reboot">Pode usar reações no turno inimigo como Ações Livres. Cada reação remove 1 carga. Se não usar, remove todas no fim do round.</Kw>
          <Kw tag="Positiva" tagVariant="positive" title="Unsuspend">Pode realizar ataques como Ações Livres no próprio turno. Cada ataque remove 1 carga. Se não atacar, remove todas no fim do turno.</Kw>
        </div>
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
function ClimasTab({ state, onUpdate, isGM }: { state?: AppState; onUpdate?: (s: AppState) => void; isGM: boolean }) {
  const [addingClima, setAddingClima] = useState(false)
  const [draft, setDraft] = useState({ name: '', type: 'Natural' as 'Natural'|'Especial', color: 'teal', icon: '🌀', effects: '' })

  const customClimas = state?.customClimas ?? []

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
    onUpdate({ ...state, customClimas: [...customClimas, c] })
    setDraft({ name: '', type: 'Natural', color: 'teal', icon: '🌀', effects: '' })
    setAddingClima(false)
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
        <div className={styles.kwGrid}>
          <WeatherCard icon="☀" title="Clear Skies" variant="">
            <b>Clima natural.</b> Não há efeitos adicionais. Clima inicial padrão quando nenhum outro está ativo.
          </WeatherCard>
          <WeatherCard icon="🌞" title="Intense Sunlight" variant="sun">
            Dano de ataques de <b>Fogo +2</b>. Dano de ataques de <b>Água −2</b>. Ações que apliquem <Tip label="Burn">Ao estourar: 7 dano (humano: 2). Por 3 Rounds, no fim do turno sofre o mesmo dano. Resistir: Vigor + Resistência.</Tip> recebem <b>+1 sucesso</b> e <b>+2 cargas extras</b>. Algumas habilidades têm efeitos adicionais.
          </WeatherCard>
          <WeatherCard icon="🌫" title="Dense Fog" variant="fog">
            Ações que usem <b>Enfraquecer</b> recebem <b>+2 sucessos</b>. Ataques <b>Físicos</b> têm <b>−2 sucessos</b>. Ações que causem <Tip label="Blind">Todas as rolagens viram Chance Rolls (1d10, sucesso só com 10). Resistir: Raciocínio + Resistência.</Tip> ou <Tip label="Mist">A cada 2 cargas, dano recebido +1. Com 9+ cargas, rolagens contra o alvo ganham +1 sucesso. Resistir: Destreza + Resistência.</Tip> recebem <b>+1 sucesso</b>.
          </WeatherCard>
          <WeatherCard icon="🌧" title="Heavy Rain" variant="rain">
            Dano de ataques de <b>Água +2</b>. Dano de ataques de <b>Fogo −2</b>. Ações de <b>Trovão</b> recebem <b>+1 sucesso</b>. Ações que apliquem <Tip label="Paralysis">−3 dados em todas as rolagens. No fim do turno remove 1 carga. Resistir: Perseverança + Resistência.</Tip> aplicam <b>+2 cargas extras</b>.
          </WeatherCard>
        </div>

        {/* Climas customizados */}
        {customClimas.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 className={styles.ruleH3}>Climas Especiais</h3>
            <div className={styles.kwGrid}>
              {customClimas.map(c => (
                <WeatherCard key={c.id} icon={c.icon} title={c.name} variant="">
                  {c.effects.map((e, i) => (
                    <span key={i}><b>{e.tag}:</b> {e.desc} </span>
                  ))}
                  {isGM && (
                    <button onClick={() => onUpdate?.({ ...state!, customClimas: customClimas.filter(x => x.id !== c.id) })}
                      style={{ display:'block', marginTop:8, fontFamily:'var(--font-mono)', fontSize:9,
                        letterSpacing:'0.08em', textTransform:'uppercase', background:'transparent',
                        border:'1px solid var(--coral)', borderRadius:999, padding:'2px 8px',
                        cursor:'pointer', color:'var(--coral)' }}>× remover</button>
                  )}
                </WeatherCard>
              ))}
            </div>
          </div>
        )}

        <div className={styles.callout} style={{ marginTop: 24 }}>
          <b>Climas Naturais</b> podem surgir espontaneamente durante os dias de sobrevivência no Mundo Digital, sem depender de habilidades ou ações específicas.
        </div>

        {/* GM: adicionar novo clima */}
        {isGM && !addingClima && (
          <button onClick={() => setAddingClima(true)}
            style={{ marginTop: 16, padding: '7px 18px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid var(--line)', background: 'transparent',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--ink-soft)' }}>
            + Novo Clima
          </button>
        )}
        {isGM && addingClima && (
          <div style={{ marginTop: 16, padding: '16px', border: '1px solid var(--line)',
            borderRadius: 10, background: 'var(--paper-deep)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:8, marginBottom:8 }}>
              <input value={draft.name} onChange={e => setDraft(p=>({...p,name:e.target.value}))}
                placeholder="Nome do clima *" style={fldStyle} />
              <select value={draft.type} onChange={e => setDraft(p=>({...p,type:e.target.value as any}))} style={fldStyle}>
                <option value="Natural">Natural</option><option value="Especial">Especial</option>
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
        <div className={styles.ruleSub}>chaves, fechaduras e o pulso do mundo digital</div>

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
  return (
    <div>
      <PageHead title="Sistema" tag="o vocabulário escondido das fichas" />
      <div className={styles.subTabs}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`${styles.subTab} ${tab === t.id ? styles.subTabActive : ''}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'regras'   && <RegraTab />}
      {tab === 'climas'   && <ClimasTab state={state} onUpdate={onUpdate} isGM={isGM} />}
      {tab === 'digivice' && <DigiviceTab />}
    </div>
  )
}