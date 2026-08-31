-- Recordatorio ANTES de vencer (además del de vencimiento ya existente).
alter table public.solicitudes_kyc
  add column if not exists recordatorio_previo_en timestamptz;

notify pgrst, 'reload schema';
