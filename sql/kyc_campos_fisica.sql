-- ============================================================
-- KYC física: caducidad del documento y datos de la empresa donde labora.
-- Se llenan en el portal KYC y se vuelcan al gestor de clientes al aprobar.
-- ============================================================
alter table public.clientes
  add column if not exists venc_identificacion text,
  add column if not exists empleador           jsonb;

notify pgrst, 'reload schema';
