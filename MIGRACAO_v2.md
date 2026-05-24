# Migração para Supabase v2
## Digimon Survive Companion App — A Midnight Summer's Dream

> **Status:** Pronto para implementar
> **Stack:** React + Vite + Supabase (Postgres + Storage + Auth + Realtime) + Vercel

---

## 1. Instalar dependência

```bash
npm install @supabase/supabase-js
```

---

## 2. Criar projeto no Supabase

1. Acessar [supabase.com](https://supabase.com) → New Project
2. Anotar a **URL** e a **anon key** (Dashboard → Settings → API)

---

## 3. Executar o schema SQL

No Supabase Dashboard → SQL Editor → New Query, colar e executar o conteúdo de `supabase_schema_v2.sql`.

---

## 4. Criar os buckets de Storage

Dashboard → Storage → New Bucket:

| Bucket | Público | Uso |
|--------|---------|-----|
| `portraits` | ✅ Sim | Fotos de tamers e digimons |
| `assets` | ✅ Sim | SIGNs, mapas, records |

Para cada bucket, em Policies adicionar:
- **SELECT:** `true` (leitura pública)
- **INSERT:** `auth.role() = 'authenticated'`
- **UPDATE/DELETE:** `auth.role() = 'authenticated'`

---

## 5. Variáveis de ambiente

Criar `.env.local` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **Nunca commitar este arquivo.**

---

## 6. Arquivos novos a adicionar ao projeto

| Arquivo de output | Destino no projeto |
|-------------------|--------------------|
| `supabase.ts` | `src/lib/supabase.ts` |
| `auth.ts` | `src/lib/auth.ts` |
| `db.ts` | `src/lib/db.ts` |
| `AuthProvider.tsx` | `src/components/AuthProvider.tsx` |
| `LoginPage.tsx` | `src/pages/LoginPage.tsx` |
| `App.tsx` | `src/App.tsx` (substituir) |
| `supabase_schema_v2.sql` | executar no Supabase, não vai para o projeto |

Criar a pasta `src/lib/` se não existir.

---

## 7. Criar conta do GM

1. No Supabase Dashboard → Authentication → Users → Invite User
2. Preencher com o email do GM e enviar convite
3. O GM define a senha ao aceitar o convite
4. Após o GM fazer login, promover para GM via SQL:

```sql
UPDATE public.profiles
SET role = 'gm'
WHERE id = '<uuid do usuário>';
```

O UUID aparece em Authentication → Users.

---

## 8. Criar contas dos players

Para cada player:

1. Dashboard → Authentication → Users → Invite User
2. Após o player aceitar o convite e fazer login, vincular ao personagem:

```sql
UPDATE public.profiles
SET tamer_id = 't-naoki'  -- ajustar por player
WHERE id = '<uuid do player>';
```

Mapeamento de tamer_id:
- Naoki → `t-naoki`
- Eisuke → `t-eisuke`
- Miki → `t-miki`
- Yuri → `t-yuri`
- Sachi → `t-sachi`
- Mori → `t-mori`

---

## 9. Migrar dados locais

1. Com o Supabase configurado e o GM logado, acessar o app
2. Na navbar aparece o botão **⟳ Migrar** (visível só para GM)
3. Clicar → o app copia localStorage + IDB → Supabase automaticamente
4. Confirmar que os dados aparecem corretamente
5. O botão pode ser removido do código após a migração confirmada

---

## 10. Deploy no Vercel

```bash
# Instalar CLI (opcional)
npm i -g vercel

# Deploy
vercel --prod
```

No painel do Vercel → Project Settings → Environment Variables, adicionar:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Configurações de build:
- **Framework:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Após o deploy, adicionar a URL do Vercel no Supabase:
Dashboard → Authentication → URL Configuration → Site URL

---

## 11. Criar grupos fixos do Digi-Zap (após migração)

```sql
INSERT INTO public.digi_zap_groups (kind, name, participants) VALUES
  ('group', 'SURVIVORS', ARRAY['t-naoki','t-eisuke','t-miki','t-yuri','t-sachi','t-mori']),
  ('group', 'Sanbaka',   ARRAY['t-naoki','t-shinra','t-kumo']);
```

---

## 12. Criar Digivices dos NPCs (após migração)

```sql
INSERT INTO public.digivices (character_id, kind) VALUES
  ('t-hare',   'fechadura'),
  ('t-kanade', 'fechadura'),
  ('t-shinra', 'fechadura'),
  ('t-kumo',   'fechadura'),
  ('t-emi',    'fechadura'),
  ('t-hibito', 'fechadura');
```

---

## 13. Comportamento sem Supabase

O app detecta automaticamente se as variáveis de ambiente estão ausentes.
Sem Supabase configurado, funciona exatamente como antes — localStorage + IDB, sem login.
Isso significa que o desenvolvimento local não requer Supabase.

---

## 14. Checklist

- [ ] `npm install @supabase/supabase-js`
- [ ] Schema SQL executado
- [ ] Buckets `portraits` e `assets` criados com políticas
- [ ] `.env.local` criado com URL e anon key
- [ ] Pasta `src/lib/` criada
- [ ] Arquivos copiados para os destinos corretos
- [ ] Conta do GM criada e promovida
- [ ] App rodando localmente com Supabase (`npm run dev`)
- [ ] GM logado e botão ⟳ Migrar executado com sucesso
- [ ] Contas dos players criadas e vinculadas
- [ ] Deploy no Vercel feito
- [ ] URL do Vercel configurada no Supabase Auth
- [ ] Grupos do Digi-Zap criados via SQL
- [ ] Digivices dos NPCs criados via SQL
