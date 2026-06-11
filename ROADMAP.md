# Roadmap — Melhorias e Expansões

## Digimon Survive Companion App — *A Midnight Summer's Dream*

> Análise do que pode ser **complementado** ao sistema atual: funções novas e
> expansões de conceitos existentes. Documento de **planejamento** — nada aqui
> está implementado. Para o funcionamento atual, ver [README.md](README.md);
> para setup do backend, [MIGRACAO.md](MIGRACAO.md).

Cada item indica o **esforço** estimado, o **valor** e em quais sistemas/arquivos
**existentes** ele se apoia (a regra é reaproveitar a infra já pronta — `AppState`,
visibilidade de 3 estados, RLS, Wiki/Mapas, realtime, snapshots — em vez de criar
estruturas novas do zero).

**Esforço:** **S** ≤ 1 dia · **M** 2–4 dias · **L** 1+ semana.

---

## Quick wins
*Alto retorno, baixo custo. Bons primeiros passos.*

### 1. Cobertura de testes das regras — `S/M` · valor **alto**
Hoje só existem [src/data/rules.test.ts](src/data/rules.test.ts) e os testes de
[src/lib/dice.ts](src/lib/dice.ts). Adicionar testes para os cálculos centrais de
[src/data/store.ts](src/data/store.ts): `calcTamerDerived`, `calcDigimonDerived`,
`xpCostAttribute`/`xpCostSkill` e — o mais importante — `mergeWithDefaults`
(garantir que a reinjeção de skills/bestiário não apague runtime do usuário).
É a rede de segurança que **destrava com confiança** todos os outros itens.

### 2. Healthcheck cobrindo as tabelas novas — `S` · valor **médio**
[src/lib/db/healthcheck.ts](src/lib/db/healthcheck.ts) só checa as 8 tabelas
centrais. Acrescentar `wiki_pages`, `wiki_relations`, `wiki_page_edits`, `maps`,
`map_layers`, `map_pins` e `campaign_config` para o diagnóstico do GM refletir o
schema completo (fecha a lacuna anotada em [MIGRACAO.md §10](MIGRACAO.md)).

### 3. Snapshots rotulados + UI no Backstage — `S/M` · valor **alto** (segurança de dados)
[src/lib/db/snapshots.ts](src/lib/db/snapshots.ts) já lista/cria/restaura versões
do `app_state`, mas **não há UI** para isso e o campo `label` existe no tipo
`SnapshotRow` sem ser persistido. Adicionar: (a) coluna/uso de `label`;
(b) um painel "Backups" no [Backstage](src/pages/BackstagePage.tsx) para criar um
snapshot rotulado antes de grandes mudanças e restaurar com um clique. Rede de
segurança contra edições destrutivas em sessão.

### 4. Export/Import por entidade na Wiki e Mapas — `S` · valor **médio**
Fichas (Party) e palcos (Teatro) já exportam/importam JSON. Estender o mesmo padrão
(`exportStateToFile` em [src/data/store.ts](src/data/store.ts)) para páginas da Wiki
([src/lib/db/wiki.ts](src/lib/db/wiki.ts)) e mapas ([src/lib/db/maps.ts](src/lib/db/maps.ts)),
permitindo reaproveitar lore/mapas entre campanhas ou fazer backup pontual.

### 5. Wiki e Mapas na busca global — `S` · valor **médio**
[src/components/GlobalSearch.tsx](src/components/GlobalSearch.tsx) (atalho **"/"**)
já indexa tamers, survivors, digimons, BUGs, SIGNs, keywords e condições.
Adicionar resultados de páginas da Wiki (`listWikiPages`) e mapas (`listMaps`),
navegando para `/wiki/:id` e `/mapas`. Pequeno e muito útil em sessão.

### 6. Presença por palco — `S` · valor **médio**
O tipo `PresenceState` em [src/lib/presence.ts](src/lib/presence.ts) já tem o campo
`active_stage`, **hoje não populado**. Preenchê-lo com o palco atual no
[Teatro](src/pages/TeatroPage.tsx) e exibir "quem está vendo este palco" dá
co-presença real ao combate, reaproveitando o canal de Presence já existente.

### 7. Precache de assets críticos no Service Worker — `S` · valor **médio**
[public/sw.js](public/sw.js) é cache-first **reativo** (só guarda o que já foi
buscado). Adicionar uma lista de precache no evento `install` (ícones, fontes,
sprites do elenco) para o app abrir offline **já no primeiro acesso**, não apenas
em visitas subsequentes.

---

## Larger features
*Mais escopo; expandem conceitos centrais do app.*

### 8. Wiki ↔ entidade bidirecional + auto-stub — `M` · valor **alto**
A Wiki já vincula páginas a entidades (`linked_type`/`linked_id`). Fechar o ciclo:
um botão **"Criar página na Wiki"** dentro da ficha ([SheetModal](src/components/Sheet.tsx))
que cria um *stub* já vinculado, e um link de volta da ficha para a página existente.
Reúne ficha mecânica + lore narrativa sem duplicar dados.

### 9. Mapas: névoa de guerra / revelação progressiva — `M` · valor **alto**
Mapas já têm camadas com `visible` e pins com visibilidade de 3 estados
([src/types/map.ts](src/types/map.ts)). Adicionar uma camada de "névoa" que o GM
revela por região durante a sessão, reaproveitando o toggle de camada + realtime.
Aproxima a ferramenta de um VTT leve.

### 10. Teatro: linha do tempo de combate + undo — `M/L` · valor **alto**
O palco já mantém `log` e runtime (`actorStates`, `roundCurrent`) em
[src/pages/TeatroPage.tsx](src/pages/TeatroPage.tsx). Guardar um snapshot de
`actorStates` por round e oferecer uma **timeline navegável** com "voltar 1 round"
(undo). Reaproveita o padrão de snapshot do item 3. Salva combates longos de erros
manuais de HP/condições.

### 11. Aprovação de edições da Wiki com diff — `M` · valor **alto**
O fluxo colaborativo já grava submissões `pending` em `wiki_page_edits`
([wiki_collab_migration.sql](wiki_collab_migration.sql)). Falta a tela do GM:
um painel no [Backstage](src/pages/BackstagePage.tsx) mostrando o **diff**
(texto e/ou blocos) entre a página atual e a edição proposta, com aprovar/rejeitar.
Completa um recurso que já está meio-implementado no banco.

### 12. Mais flags de campanha — `M` · valor **médio-alto**
`campaign_config` é um par genérico `chave → jsonb` com realtime
([src/lib/campaignFlags.tsx](src/lib/campaignFlags.tsx)), hoje com uma única flag
(`wiki_detailed_pages`). Adicionar flags como ligar/desligar Digi-Zap, habilitar
Mapas para players, ou um **"modo spoiler"** que oculta categorias inteiras da Wiki
— mais um painel de toggles no Backstage. Custo de infra quase zero.

### 13. Notificações push (PWA) de Digi-Zap — `L` · valor **médio**
A PWA (SW + manifest) e o badge de não-lidas do [Digi-Zap](src/pages/DigiZapPage.tsx)
já existem. Adicionar **Web Push** (via Service Worker) para mensagens novas com o
app fechado. Requer um endpoint de envio (Supabase Edge Function) e gestão de
inscrições — por isso é o item de maior superfície nova.

### 14. Acessibilidade & base de i18n — `M` · valor **médio**
Já há `skipLink`, `aria-*` na navbar e tema claro/escuro. Próximos passos: auditar
**contraste** do modo escuro, garantir foco visível consistente, e extrair as
strings (hoje PT hard-coded) para um dicionário, preparando i18n. Toca
[src/styles/global.css](src/styles/global.css),
[src/App.module.css](src/App.module.css) e componentes.

### 15. UI completa de conteúdo do GM (`gm_notes` / `gm_items`) — `M` · valor **médio**
[src/lib/db/gmContent.ts](src/lib/db/gmContent.ts) e o RPC `reveal_item` existem com
pouca superfície de UI. Construir um **"Diário do GM"** no Backstage: notas privadas
por sessão e itens em limbo atribuíveis/reveláveis aos players (aparecendo no
Digivice ao revelar). Aproveita tabelas e RPC já prontos.

---

## Sequenciamento sugerido

1. **#1 (testes)** primeiro — rede de segurança para tudo o que vem depois.
2. **Quick wins #2–#7** — alto retorno imediato e baixo risco.
3. **#11 e #8** — a infra de Wiki já existe; completam recursos meio-prontos.
4. **#3 e #10** — segurança de dados e usabilidade de combate (compartilham o padrão de snapshot).
5. **#12, #15, #9, #14** — expansões de médio porte conforme a prioridade da mesa.
6. **#13 (push)** por último — maior superfície nova (Edge Function + inscrições).

---

*Documento vivo — atualizar conforme itens forem concluídos ou repriorizados.*
