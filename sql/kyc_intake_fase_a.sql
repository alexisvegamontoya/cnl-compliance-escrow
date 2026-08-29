-- ============================================================
-- Módulo KYC — Recolección de información del cliente (Fase A: cimientos)
-- Portal donde el cliente llena su información de debida diligencia, sube
-- documentos de respaldo, firma el KYC y envía. El oficial revisa (bandeja) y
-- al aprobar se vuelca al gestor de clientes.
--   · Solo el superadmin habilita el módulo por sujeto obligado.
--   · Los datos del cliente y las subidas del portal público pasan por
--     endpoints con service role (no se expone nada a 'anon' aquí).
-- ============================================================

-- ── Habilitación del módulo por sujeto obligado (extensible a futuros módulos) ──
create table if not exists public.modulos_habilitados (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  modulo     text        not null,            -- 'kyc'
  habilitado boolean     not null default true,
  creado_en  timestamptz not null default now(),
  unique (tenant_id, modulo)
);

alter table public.modulos_habilitados enable row level security;
drop policy if exists mh_superadmin_all on public.modulos_habilitados;
drop policy if exists mh_member_read    on public.modulos_habilitados;
create policy mh_superadmin_all on public.modulos_habilitados
  for all to authenticated using (es_superadmin()) with check (es_superadmin());
create policy mh_member_read on public.modulos_habilitados
  for select to authenticated using (tenant_id in (select mis_tenant_ids()));

-- ── Machotes globales (los sube el superadmin; se descargan/recargan en el portal) ──
create table if not exists public.machotes (
  id          uuid        primary key default gen_random_uuid(),
  sector      text,                            -- 'credito' etc; null = general
  clave       text        not null,            -- 'autorizacion_cic'
  nombre      text        not null,
  archivo_url text        not null,            -- URL pública (bucket 'machotes')
  archivo_path text,
  activo      boolean     not null default true,
  creado_en   timestamptz not null default now()
);
alter table public.machotes enable row level security;
drop policy if exists mac_superadmin_all on public.machotes;
drop policy if exists mac_read           on public.machotes;
create policy mac_superadmin_all on public.machotes
  for all to authenticated using (es_superadmin()) with check (es_superadmin());
create policy mac_read on public.machotes
  for select to authenticated using (true);

-- ── Solicitudes de recolección (una por cliente a onboardear/actualizar) ──
create table if not exists public.solicitudes_kyc (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id) on delete cascade,
  token         text        not null unique default encode(gen_random_bytes(20), 'hex'),
  tipo_persona  text        not null check (tipo_persona in ('fisica','juridica')),
  cliente_id    uuid        references public.clientes(id) on delete set null, -- si vincula existente
  correo_cliente text       not null,
  nombre_cliente text,
  sector        text,                           -- clave sectorial para secciones extra
  estado        text        not null default 'enviada'
                  check (estado in ('enviada','en_proceso','recibida','aprobada','rechazada')),
  datos         jsonb       not null default '{}'::jsonb,
  creado_por    uuid        references auth.users(id),
  creado_en     timestamptz not null default now(),
  enviada_en    timestamptz,
  recibida_en   timestamptz,
  vence_en      timestamptz not null default (now() + interval '20 days')
);
create index if not exists idx_solkyc_tenant on public.solicitudes_kyc(tenant_id);
create index if not exists idx_solkyc_estado on public.solicitudes_kyc(tenant_id, estado);

alter table public.solicitudes_kyc enable row level security;
drop policy if exists solkyc_superadmin_all on public.solicitudes_kyc;
drop policy if exists solkyc_tenant_all     on public.solicitudes_kyc;
create policy solkyc_superadmin_all on public.solicitudes_kyc
  for all to authenticated using (es_superadmin()) with check (es_superadmin());
create policy solkyc_tenant_all on public.solicitudes_kyc
  for all to authenticated
  using (tenant_id in (select mis_tenant_ids()))
  with check (tenant_id in (select mis_tenant_ids()));

-- ── Documentos subidos por el cliente en el portal ──
create table if not exists public.solicitudes_kyc_documentos (
  id            uuid        primary key default gen_random_uuid(),
  solicitud_id  uuid        not null references public.solicitudes_kyc(id) on delete cascade,
  tenant_id     uuid        not null references public.tenants(id) on delete cascade,
  doc_id        text        not null,          -- id del checklist o 'kyc_firmado','machote_cic'
  etiqueta      text,
  archivo_path  text        not null,          -- ruta en bucket 'kyc'
  nombre_archivo text,
  subido_en     timestamptz not null default now()
);
create index if not exists idx_solkyc_doc_sol on public.solicitudes_kyc_documentos(solicitud_id);

alter table public.solicitudes_kyc_documentos enable row level security;
drop policy if exists solkycdoc_superadmin_all on public.solicitudes_kyc_documentos;
drop policy if exists solkycdoc_tenant_all     on public.solicitudes_kyc_documentos;
create policy solkycdoc_superadmin_all on public.solicitudes_kyc_documentos
  for all to authenticated using (es_superadmin()) with check (es_superadmin());
create policy solkycdoc_tenant_all on public.solicitudes_kyc_documentos
  for all to authenticated
  using (tenant_id in (select mis_tenant_ids()))
  with check (tenant_id in (select mis_tenant_ids()));

-- ── Storage ──
-- kyc: privado (documentos del cliente + KYC firmado). Path: <tenant_id>/<solicitud_id>/<archivo>
insert into storage.buckets (id, name, public) values ('kyc', 'kyc', false)
  on conflict (id) do nothing;
-- machotes: público (plantillas descargables)
insert into storage.buckets (id, name, public) values ('machotes', 'machotes', true)
  on conflict (id) do nothing;

-- Lectura/gestión de 'kyc' para el sujeto obligado dueño (carpeta = tenant_id) y superadmin.
drop policy if exists kyc_tenant_rw   on storage.objects;
drop policy if exists kyc_superadmin  on storage.objects;
create policy kyc_superadmin on storage.objects
  for all to authenticated
  using (bucket_id = 'kyc' and es_superadmin())
  with check (bucket_id = 'kyc' and es_superadmin());
create policy kyc_tenant_rw on storage.objects
  for all to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] in (select mis_tenant_ids()::text))
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] in (select mis_tenant_ids()::text));

-- Machotes: escribe el superadmin; lectura pública por bucket público.
drop policy if exists machotes_superadmin on storage.objects;
create policy machotes_superadmin on storage.objects
  for all to authenticated
  using (bucket_id = 'machotes' and es_superadmin())
  with check (bucket_id = 'machotes' and es_superadmin());

notify pgrst, 'reload schema';
