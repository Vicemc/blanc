# Migração para Supabase + Vercel
## Digimon Survive Companion App — A Midnight Summer's Dream

> **Status:** Planejada — não iniciada  
> **Estimativa:** 1 sessão de trabalho (~3-4h de implementação)  
> **Stack atual:** React + Vite + localStorage + IndexedDB  
> **Stack alvo:** React + Vite + Supabase (Postgres + Storage + Auth) + Vercel  

---

## 1. Pré-requisitos

Antes de começar a implementação, criar as contas:

- [ ] Conta em [supabase.com](https://supabase.com) — plano Free (Spark) é suficiente
- [ ] Conta em [vercel.com](https://vercel.com) — plano Hobby (gratuito) é suficiente
- [ ] Repositório Git (GitHub/GitLab) com o código do app

---

## 2. Setup do Supabase

### 2.1 Criar o projeto
1. Novo projeto no Supabase → anotar a **URL** e a **anon key** (serão as variáveis de ambiente)
2. Guardar também a **service_role key** (só usada no backend, nunca exposta no frontend)

### 2.2 Executar o schema
Colar o conteúdo de `supabase_schema.sql` no **SQL Editor** do Supabase e executar.

### 2.3 Configurar Storage
1. Criar um bucket chamado `portraits` (público, para imagens de personagens)
2. Configurar política: usuários autenticados podem fazer upload; leitura pública

### 2.4 Configurar Auth
1. Em **Authentication → Providers**: habilitar **Email** (com magic link ou senha — a escolha é sua)
2. Em **Authentication → URL Configuration**: adicionar a URL do Vercel quando o deploy estiver feito

---

## 3. Variáveis de ambiente

Criar `.env.local` na raiz do projeto (nunca commitar este arquivo):

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

No Vercel, adicionar as mesmas variáveis em **Project Settings → Environment Variables**.

---

## 4. Dependências a instalar

```bash
npm install @supabase/supabase-js
```

---

## 5. Arquivos a criar

### `src/lib/supabase.ts`
Cliente Supabase singleton:
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

### `src/lib/auth.ts`
Funções de autenticação:
- `signIn(email, password)` → login
- `signUp(email, password, name)` → cadastro
- `signOut()` → logout
- `getCurrentUser()` → usuário atual
- `isGM()` → verifica se o usuário tem role `gm`

### `src/lib/db.ts`
Substitui `src/data/store.ts` nas partes de persistência:
- `loadStateFromDB()` → substitui `loadStateAsync()`
- `saveStateToDB(state)` → substitui `saveState()`
- `uploadImage(file, path)` → substitui `idbSaveImage()`
- `getImageUrl(path)` → substitui `idbLoadImage()`

---

## 6. Arquivos a modificar

| Arquivo | O que muda |
|---------|-----------|
| `src/App.tsx` | Adicionar `AuthProvider`, checar sessão na montagem, rota de login |
| `src/data/store.ts` | `saveState` e `loadState` chamam `db.ts` em vez de localStorage |
| `src/pages/PartyPage.tsx` | Upload de imagem usa `uploadImage()` do `db.ts` |
| `src/components/Sheet.tsx` | `ImageUploadZone` usa `uploadImage()` do `db.ts` |
| `src/main.tsx` | Envolver app no `AuthProvider` |

---

## 7. Novas páginas a criar

### `src/pages/LoginPage.tsx`
- Formulário de email + senha
- Botão "Entrar" e "Criar conta"
- Redireciona para `/party` após login bem-sucedido

### `src/pages/AccountPage.tsx` (opcional)
- Mostrar email do usuário logado
- Botão de logout
- Se GM: painel de gerenciamento (distribuir XP, etc.)

---

## 8. Lógica de roles

O campo `role` fica na tabela `profiles` (criada pelo schema SQL).

**GM pode:**
- Distribuir XP para a party inteira
- Editar fichas de qualquer personagem
- Criar/remover pastas no bestiário
- Criar e editar palcos

**Player pode:**
- Ver todas as fichas
- Editar apenas o próprio personagem (baseado no `tamer_id` vinculado ao seu `user_id`)
- Ver o bestiário
- Ver os palcos (sem editar)

A verificação de permissão acontece em dois lugares:
1. **Frontend:** esconder botões de edição para players
2. **Supabase RLS (Row Level Security):** bloquear writes não autorizados mesmo se alguém tentar pelo console

---

## 9. Estratégia de migração de dados

Para não perder os dados que já estão no localStorage/IndexedDB:

1. Criar uma página temporária `/migrate` (só acessível para GM)
2. Ela lê o estado do localStorage atual
3. Faz upload de todas as imagens para o Supabase Storage
4. Salva todos os dados no Supabase Postgres
5. Limpa o localStorage após confirmar que tudo foi salvo
6. Remover a página `/migrate` após a migração

---

## 10. Deploy no Vercel

```bash
# Instalar CLI do Vercel (opcional, pode usar a UI)
npm i -g vercel

# Fazer deploy
vercel

# Para produção
vercel --prod
```

Configurar no painel do Vercel:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- Adicionar as variáveis de ambiente do passo 3

---

## 11. Checklist final

- [ ] Schema SQL executado no Supabase
- [ ] Bucket `portraits` criado e configurado
- [ ] Variáveis de ambiente configuradas (local + Vercel)
- [ ] `@supabase/supabase-js` instalado
- [ ] `src/lib/supabase.ts` criado
- [ ] `src/lib/auth.ts` criado
- [ ] `src/lib/db.ts` criado
- [ ] `src/App.tsx` atualizado com AuthProvider e rota de login
- [ ] `src/data/store.ts` atualizado para usar `db.ts`
- [ ] `src/pages/LoginPage.tsx` criado
- [ ] Upload de imagens atualizado para usar Storage
- [ ] Roles de GM/Player implementados
- [ ] Migração de dados locais para o Supabase feita
- [ ] Deploy no Vercel feito
- [ ] URL de callback configurada no Supabase Auth

---

*Documento gerado em preparação para a migração — implementação a ser feita numa sessão dedicada.*
