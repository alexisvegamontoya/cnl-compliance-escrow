-- ============================================================
-- KYC: plazo de 3 días para enviar la información + recordatorio automático.
-- Si vence el plazo sin recibir la información, un cron manda un correo al
-- cliente con copia al oficial (correo_oficial) y marca recordatorio_vencimiento_en.
-- ============================================================
alter table public.solicitudes_kyc
  add column if not exists correo_oficial               text,
  add column if not exists recordatorio_vencimiento_en  timestamptz;

-- El plazo por defecto pasa de 20 a 3 días.
alter table public.solicitudes_kyc alter column vence_en set default (now() + interval '3 days');

notify pgrst, 'reload schema';
