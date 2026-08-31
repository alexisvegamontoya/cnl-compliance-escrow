-- ============================================================
-- KYC: consentimiento informado del titular (Ley 8968) — trazabilidad.
-- Se marca al enviar la información desde el portal; queda como evidencia de que
-- el cliente aceptó el tratamiento de sus datos.
-- ============================================================
alter table public.solicitudes_kyc
  add column if not exists consentimiento_datos boolean not null default false,
  add column if not exists consentimiento_en    timestamptz;

notify pgrst, 'reload schema';
