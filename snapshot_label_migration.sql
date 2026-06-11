-- =============================================================================
-- snapshot_label — rótulo opcional para snapshots de app_state
-- =============================================================================
-- O painel "Backups" do Backstage permite criar um snapshot rotulado antes de
-- grandes mudanças (ex: "antes do boss do cap. 3") e restaurá-lo com um clique.
-- O campo `label` já existia no tipo SnapshotRow (snapshots.ts) sem ser
-- persistido — esta migração adiciona a coluna que faltava.

alter table public.app_state
  add column if not exists label text;
