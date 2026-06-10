# Refatoração de Sheet.tsx

> ## ✅ CONCLUÍDO
> Refatoração finalizada. `src/components/Sheet.tsx` passou de **3594 → ~387 linhas**,
> agora apenas orquestrador (`FullSheet`/`SheetModal` + switch de view + re-exports).
> Este documento é mantido como **registro histórico** do processo.
>
> **Arquivos resultantes:**
> - `src/components/Sheet.tsx` — orquestrador + barrel de re-exports
> - `src/components/sheet/TamerView.tsx` — `TamerView`, `DigiviceInventoryTab`
> - `src/components/sheet/DigimonView.tsx` — `DigimonStageView`, `BugView`, `SignView`
> - `src/components/sheet/SurvivorView.tsx` — `SurvivorView`, `SurvivorLoreTab`, `SurvivorInventoryTab`
> - `src/components/sheet/shared/contexts.ts` — `DisplayModeCtx`, `KeywordTipsCtx`
> - `src/components/sheet/shared/types.ts` — `SheetSubject`, `TokenSpawn`, tipos compartilhados
> - `src/components/sheet/shared/utils.ts` — `KEYWORD_TIPS`, `parseTokenSpawns`, helpers
> - `src/components/sheet/shared/components.tsx` — UI compartilhada (ex.: `ImageUploadZone`)
>
> **Desvio do plano original:** `BugView` e `SignView` eram pequenos demais para
> arquivos próprios (Passo 8), então foram incorporados em `DigimonView.tsx` em vez
> de virarem `BugView.tsx`/`SignView.tsx`.

**Arquivo-alvo:** `src/components/Sheet.tsx` (3594 linhas)  
**Objetivo:** Quebrar em módulos separados sem nenhuma mudança funcional.

**Estrutura-alvo:**
```
src/components/
  sheet/
    shared/
      contexts.ts
      types.ts
      utils.ts
    TamerView.tsx
    DigimonView.tsx
    SurvivorView.tsx
    BugView.tsx       (se justificado pelo inventário)
    SignView.tsx      (se justificado pelo inventário)
  Sheet.tsx           (barrel de re-exports + componente <Sheet> principal)
```

**Restrições globais (valem em todos os passos):**
- Zero mudanças funcionais — apenas mover código.
- Todos os exports atuais de Sheet.tsx devem continuar acessíveis com os mesmos nomes.
- Nenhum arquivo fora de `src/components/sheet/` é tocado até o passo 9.
- `npm run typecheck` deve passar após cada arquivo criado/modificado.
- Componentes que recebem estado do pai continuam recebendo via props — não criar novo contexto.

---

## PASSO 1 — Inventário (nenhum código escrito)

```
Você vai refatorar um arquivo React/TypeScript grande. Antes de escrever qualquer código,
preciso de um inventário completo. NÃO escreva nenhuma linha de código neste turno.

─── CONTEXTO DO PROJETO ────────────────────────────────────────────────────────
App Vite + React 18 + TypeScript 5. Companion para campanha de TTRPG Digimon Survive.
Arquivo-alvo: e:\survive\src\components\Sheet.tsx (3594 linhas)
ESLint configurado — qualquer componente React deve ter nome iniciando em maiúscula.

─── ESTRUTURA-ALVO APÓS REFATORAÇÃO ────────────────────────────────────────────
src/components/
  sheet/
    shared/
      contexts.ts       ← todos os React.createContext + seus tipos
      types.ts          ← tipos/interfaces definidos localmente no Sheet.tsx
      utils.ts          ← funções puras / helpers sem JSX
    TamerView.tsx       ← componentes e subcomponentes relacionados ao Tamer
    DigimonView.tsx     ← componentes e subcomponentes relacionados ao Digimon/Besta
    SurvivorView.tsx    ← componentes e subcomponentes relacionados ao Survivor
    BugView.tsx         ← se existir conteúdo exclusivo de Bug
    SignView.tsx        ← se existir conteúdo exclusivo de Sign
  Sheet.tsx             ← torna-se um barrel (re-exports) + o componente principal <Sheet>
                          que orquestra os subviews — MÍNIMO de lógica aqui

─── O QUE PRODUZIR NESTE TURNO ──────────────────────────────────────────────────

Leia o arquivo inteiro. Depois produza:

## 1. Contextos React
Para cada `createContext` encontrado:
- Nome da variável, tipo do valor, valor default
- Lista de componentes que consomem via `useContext`
- Arquivo de destino proposto (provavelmente shared/contexts.ts)

## 2. Tipos e Interfaces Locais
Para cada `type` / `interface` definido dentro do arquivo (não importado):
- Nome, definição resumida (não copiar o corpo inteiro)
- Arquivo de destino proposto

## 3. Funções Puras / Helpers (sem JSX)
Para cada função que não retorna JSX:
- Nome, assinatura (params + retorno)
- Dependências: quais imports externos ela usa
- Arquivo de destino proposto

## 4. Componentes React
Para cada componente (função que retorna JSX):
- Nome, linhas aproximadas (ex: L120–L340)
- Props: lista com tipos
- Estado interno: useState / useReducer usados
- Contextos consumidos (via useContext)
- Outros componentes que renderiza (filhos diretos)
- Arquivo de destino proposto

## 5. Dependências entre componentes
Grafo textual mostrando quem usa quem. Formato:
  Sheet → [TamerView, DigimonView, SurvivorView, ...]
  TamerView → [TamerInfoEditor, AffinityGrid, SkillTreeSection, ...]
  etc.

## 6. Imports externos usados por cada arquivo-alvo
Para cada arquivo-alvo proposto, liste quais imports de fora de Sheet.tsx ele vai precisar.
Exemplo:
  TamerView.tsx precisará de:
    - import type { Tamer, AppState } from '../types'  (ou de shared/types.ts se movido)
    - import { calcTamerDerived } from '../data/store'
    - import { DisplayModeCtx } from './shared/contexts'
    - ...

## 7. Riscos e decisões abertas
Liste qualquer ambiguidade:
- Componentes difíceis de classificar em um único arquivo
- Estado/funções compartilhados entre TamerView e DigimonView (ex: upload de imagem)
- Qualquer padrão que exija atenção especial na migração

─── RESTRIÇÕES QUE VALERÃO NA EXECUÇÃO (memorize para os próximos turnos) ──────
- Zero mudanças funcionais. Mover código apenas.
- Todos os exports atuais de Sheet.tsx devem continuar acessíveis com os mesmos nomes.
- Nenhum arquivo fora de src/components/sheet/ será tocado até o turno final.
- `npm run typecheck` deve passar após cada arquivo criado.
- Componentes que compartilham estado devem receber esse estado via props,
  não via novo contexto ad-hoc — a menos que um contexto já exista para isso.

─── AÇÃO ────────────────────────────────────────────────────────────────────────
Leia e:\survive\src\components\Sheet.tsx completamente e produza o inventário acima.
Não escreva código. Não proponha edições. Apenas o inventário.
```

---

## PASSO 2 — `sheet/shared/contexts.ts`

```
Com base no inventário que você produziu, crie o arquivo:
  e:\survive\src\components\sheet\shared\contexts.ts

Mova para ele todos os createContext identificados, incluindo seus tipos.
Exporte cada contexto e seu tipo.

Após criar o arquivo, execute: npm run typecheck
Reporte os erros se houver e corrija antes de prosseguir.
NÃO mexa em nenhum outro arquivo ainda.
```

---

## PASSO 3 — `sheet/shared/types.ts`

```
Crie o arquivo:
  e:\survive\src\components\sheet\shared\types.ts

Mova para ele todos os tipos e interfaces locais identificados no inventário
que são compartilhados entre dois ou mais componentes-destino.
Tipos usados exclusivamente dentro de um único view (ex: só TamerView)
devem ser definidos diretamente nesse view, não aqui.

Exporte todos os tipos movidos.

Após criar o arquivo, execute: npm run typecheck
Corrija erros antes de prosseguir.
NÃO mexa em nenhum outro arquivo ainda.
```

---

## PASSO 4 — `sheet/shared/utils.ts`

```
Crie o arquivo:
  e:\survive\src\components\sheet\shared\utils.ts

Mova para ele todas as funções puras (sem JSX) identificadas no inventário
que são compartilhadas entre dois ou mais componentes-destino.
Funções usadas por apenas um view devem permanecer nesse view, não aqui.

Após criar o arquivo, execute: npm run typecheck
Corrija erros antes de prosseguir.
NÃO mexa em nenhum outro arquivo ainda.
```

---

## PASSO 5 — `sheet/TamerView.tsx`

```
Crie o arquivo:
  e:\survive\src\components\sheet\TamerView.tsx

Mova para ele todos os componentes identificados no inventário como pertencentes
ao domínio Tamer, incluindo seus subcomponentes exclusivos.

Regras:
- Importe contextos de ./shared/contexts, tipos de ./shared/types,
  utils de ./shared/utils conforme mapeado no inventário.
- Componentes que recebem estado do pai continuam recebendo via props — não crie
  novo contexto.
- Exporte apenas o que outros arquivos precisarão importar.
- Preserve todos os nomes de componentes e assinaturas de props sem alteração.

Após criar o arquivo, execute: npm run typecheck
Corrija erros antes de prosseguir.
NÃO mexa em Sheet.tsx ainda.
```

---

## PASSO 6 — `sheet/DigimonView.tsx`

```
Crie o arquivo:
  e:\survive\src\components\sheet\DigimonView.tsx

Mova para ele todos os componentes do domínio Digimon/Bestiary/Wild identificados
no inventário, incluindo subcomponentes exclusivos.

Mesmas regras do passo anterior:
- Imports de ./shared/contexts, ./shared/types, ./shared/utils onde mapeado.
- Se um componente depende de algo já em TamerView.tsx, importe de lá (não duplique).
- Preserve nomes e assinaturas.

Após criar o arquivo, execute: npm run typecheck
Corrija erros antes de prosseguir.
NÃO mexa em Sheet.tsx ainda.
```

---

## PASSO 7 — `sheet/SurvivorView.tsx`

```
Crie o arquivo:
  e:\survive\src\components\sheet\SurvivorView.tsx

Mova para ele todos os componentes do domínio Survivor identificados no inventário.

Mesmas regras dos passos anteriores.

Após criar o arquivo, execute: npm run typecheck
Corrija erros antes de prosseguir.
NÃO mexa em Sheet.tsx ainda.
```

---

## PASSO 8 — Views menores (condicional)

*Execute este passo apenas se o inventário identificou componentes exclusivos de Bug
ou Sign grandes o suficiente para justificar arquivo próprio (> 80 linhas).
Se forem pequenos, pule para o Passo 9.*

```
Crie os arquivos que faltam para domínios menores identificados no inventário:
  e:\survive\src\components\sheet\BugView.tsx     (se aplicável)
  e:\survive\src\components\sheet\SignView.tsx     (se aplicável)

Se algum domínio for pequeno (< 80 linhas de componente), incorpore-o diretamente
em Sheet.tsx no passo seguinte em vez de criar arquivo separado.

Após criar cada arquivo, execute: npm run typecheck
Corrija erros antes de prosseguir.
```

---

## PASSO 9 — Refatorar `Sheet.tsx` (barrel + orquestrador)

```
Agora refatore e:\survive\src\components\Sheet.tsx (o arquivo original).

O arquivo deve ter duas responsabilidades apenas:

1. Re-exportar tudo que o resto da aplicação importa hoje de Sheet.tsx:
     export * from './sheet/TamerView'
     export * from './sheet/DigimonView'
     export * from './sheet/SurvivorView'
     export * from './sheet/shared/contexts'
     export * from './sheet/shared/types'
     export { parseTokenSpawns } from './sheet/shared/utils'  ← ajuste conforme inventário
     export type { SheetSubject, TokenSpawn }                 ← ajuste conforme inventário

2. Manter o componente principal <Sheet> que recebe SheetSubject e renderiza
   o view correto (TamerView, DigimonView, SurvivorView, etc.) — sem lógica de negócio,
   apenas o switch/if que decide qual view montar.

Todo o código de componentes e helpers já foi movido nos passos anteriores.
Se sobrou algo em Sheet.tsx que deveria ter sido movido, mova agora.

Após editar, execute: npm run typecheck
Após passar no typecheck, execute: npm run lint
Corrija todos os problemas reportados.
```

---

## PASSO 10 — Verificação final

```
Execute na ordem:
1. npm run typecheck   → deve retornar 0 erros
2. npm run lint        → deve retornar 0 problems
3. npm run build       → deve compilar sem erro

Se qualquer passo falhar, corrija e repita até os três passarem limpos.

Depois liste:
- Arquivos criados com contagem de linhas de cada um
- Tamanho final de Sheet.tsx
- Qualquer decisão de design que você tomou diferente do inventário original e por quê
```

---

## Progresso

- [x] Passo 1 — Inventário
- [x] Passo 2 — `sheet/shared/contexts.ts`
- [x] Passo 3 — `sheet/shared/types.ts`
- [x] Passo 4 — `sheet/shared/utils.ts`
- [x] Passo 5 — `sheet/TamerView.tsx`
- [x] Passo 6 — `sheet/DigimonView.tsx`
- [x] Passo 7 — `sheet/SurvivorView.tsx`
- [x] Passo 8 — Views menores → **incorporadas em `DigimonView.tsx`** (Bug/Sign pequenos demais)
- [x] Passo 9 — Refatorar `Sheet.tsx`
- [x] Passo 10 — Verificação final
