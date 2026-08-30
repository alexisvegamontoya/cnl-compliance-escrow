-- KYC: ítems del checklist que el oficial quita para una solicitud puntual.
alter table public.solicitudes_kyc
  add column if not exists documentos_excluidos jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
