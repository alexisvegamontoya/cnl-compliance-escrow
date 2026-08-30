-- ============================================================
-- KYC jurídica: campos adicionales del cliente y de las personas relacionadas.
-- Se llenan en el portal KYC y se vuelcan al gestor de clientes al aprobar.
-- ============================================================

-- Empresa (tabla clientes)
alter table public.clientes
  add column if not exists pagina_web       text,
  add column if not exists distrito         text,
  add column if not exists paises_ingresos  text;

-- Personas relacionadas (representantes / junta / socios)
alter table public.clientes_personas_relacionadas
  add column if not exists venc_identificacion text,
  add column if not exists fecha_nacimiento     date,
  add column if not exists pais_nacimiento       text,
  add column if not exists ocupacion             text,
  add column if not exists estado_civil          text,
  add column if not exists sexo                  text,
  add column if not exists es_pep                boolean not null default false;

notify pgrst, 'reload schema';
