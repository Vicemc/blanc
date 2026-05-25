-- =============================================================================
-- GRUPOS PRÉ-CRIADOS DO DIGI-ZAP — execute no SQL Editor do Supabase
-- =============================================================================
-- Cria os três grupos de mensagem fixos da campanha.
-- Execute UMA VEZ; o ON CONFLICT garante idempotência.
--
-- IDs dos personagens:
--   Players:  t-naoki, t-mori, t-miki, t-yuri, t-eisuke, t-sachi
--   Fechadura: t-hare, t-kanade, t-shinra, t-kumo, t-hibito, t-emi
-- =============================================================================

-- SURVIVORS — todos os sobreviventes
INSERT INTO public.digi_zap_groups (kind, name, participants)
VALUES (
  'group',
  'SURVIVORS',
  ARRAY[
    't-naoki', 't-mori', 't-miki', 't-yuri', 't-eisuke', 't-sachi',
    't-hare', 't-kanade', 't-shinra', 't-kumo', 't-hibito', 't-emi'
  ]
)
ON CONFLICT DO NOTHING;

-- Sanbaka — Kumo, Naoki e Shinra
INSERT INTO public.digi_zap_groups (kind, name, participants)
VALUES (
  'group',
  'Sanbaka',
  ARRAY['t-kumo', 't-naoki', 't-shinra']
)
ON CONFLICT DO NOTHING;

-- Kurumizawa Girls — Yuri, Hare, Kanade
-- Nota: "Yui" não tem ID de personagem cadastrado; adicione manualmente se necessário.
INSERT INTO public.digi_zap_groups (kind, name, participants)
VALUES (
  'group',
  'Kurumizawa Girls',
  ARRAY['t-yuri', 't-hare', 't-kanade']
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- POLICIES ADICIONAIS — execute também caso ainda não existam
-- =============================================================================

-- 1. Permite que players atualizem o app_state (necessário para ações no palco)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'app_state'
      AND policyname = 'app_state_update_player'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "app_state_update_player"
        ON public.app_state FOR UPDATE TO authenticated
        USING (true)
    $pol$;
  END IF;
END $$;

-- 2. Permite que players insiram o próprio Digivice (corrige 403 no Digivice)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'digivices'
      AND policyname = 'digivices_insert_player'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "digivices_insert_player"
        ON public.digivices FOR INSERT TO authenticated
        WITH CHECK (character_id = public.my_character_id())
    $pol$;
  END IF;
END $$;
