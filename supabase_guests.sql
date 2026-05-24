-- =============================================================================
-- USUÁRIOS CONVIDADO — execute no SQL Editor do Supabase
-- =============================================================================
-- Cria 6 contas "guest" com acesso somente-leitura às abas
-- Party, Goggle Girl e Sistema. Teatro, Digivice, Digi-Zap e Backstage ficam
-- ocultos para esses usuários.
--
-- Credenciais geradas:
--   convidado1@survive.local  /  convidado1
--   convidado2@survive.local  /  convidado2
--   convidado3@survive.local  /  convidado3
--   convidado4@survive.local  /  convidado4
--   convidado5@survive.local  /  convidado5
--   convidado6@survive.local  /  convidado6
--
-- Após criar, você pode trocar a senha de qualquer conta em:
--   Supabase Dashboard → Authentication → Users → (selecione) → Reset password
-- =============================================================================

-- 1. Aceitar o role 'guest' na tabela profiles
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('gm', 'player', 'guest'));

-- 2. Criar os usuários em auth.users (UUIDs fixos para facilitar referência)
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, is_super_admin
) VALUES
  ('c0000000-0000-0000-0000-000000000001','authenticated','authenticated',
   'convidado1@survive.local', crypt('convidado1', gen_salt('bf')),
   now(), now(), now(), '{"name":"Convidado 1"}'::jsonb, false),

  ('c0000000-0000-0000-0000-000000000002','authenticated','authenticated',
   'convidado2@survive.local', crypt('convidado2', gen_salt('bf')),
   now(), now(), now(), '{"name":"Convidado 2"}'::jsonb, false),

  ('c0000000-0000-0000-0000-000000000003','authenticated','authenticated',
   'convidado3@survive.local', crypt('convidado3', gen_salt('bf')),
   now(), now(), now(), '{"name":"Convidado 3"}'::jsonb, false),

  ('c0000000-0000-0000-0000-000000000004','authenticated','authenticated',
   'convidado4@survive.local', crypt('convidado4', gen_salt('bf')),
   now(), now(), now(), '{"name":"Convidado 4"}'::jsonb, false),

  ('c0000000-0000-0000-0000-000000000005','authenticated','authenticated',
   'convidado5@survive.local', crypt('convidado5', gen_salt('bf')),
   now(), now(), now(), '{"name":"Convidado 5"}'::jsonb, false),

  ('c0000000-0000-0000-0000-000000000006','authenticated','authenticated',
   'convidado6@survive.local', crypt('convidado6', gen_salt('bf')),
   now(), now(), now(), '{"name":"Convidado 6"}'::jsonb, false)

ON CONFLICT (email) DO NOTHING;

-- 3. Criar os perfis com role = 'guest'
--    (o trigger handle_new_user cria o perfil automaticamente ao inserir em auth.users,
--     mas com role padrão 'player' — aqui sobrescrevemos para 'guest')
INSERT INTO public.profiles (id, display_name, role, tamer_id, active_npc_view) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Convidado 1', 'guest', null, null),
  ('c0000000-0000-0000-0000-000000000002', 'Convidado 2', 'guest', null, null),
  ('c0000000-0000-0000-0000-000000000003', 'Convidado 3', 'guest', null, null),
  ('c0000000-0000-0000-0000-000000000004', 'Convidado 4', 'guest', null, null),
  ('c0000000-0000-0000-0000-000000000005', 'Convidado 5', 'guest', null, null),
  ('c0000000-0000-0000-0000-000000000006', 'Convidado 6', 'guest', null, null)
ON CONFLICT (id) DO UPDATE SET role = 'guest';

-- 4. (Opcional) Renomear um convidado específico:
--    UPDATE public.profiles SET display_name = 'Naoki' WHERE id = 'c0000000-0000-0000-0000-000000000001';
