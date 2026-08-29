-- KYC: preguntas y documentos adicionales que el oficial agrega a una solicitud
-- antes de enviarla al cliente. Se rellenan en el portal como campos/uploads extra.
alter table public.solicitudes_kyc
  add column if not exists preguntas_extra  jsonb not null default '[]'::jsonb,
  add column if not exists documentos_extra jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
