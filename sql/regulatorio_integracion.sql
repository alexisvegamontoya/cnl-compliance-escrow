-- ============================================================================
-- Integración con CNL Gestión Regulatoria (12/10/2026)
-- Ejecutar en Supabase → proyecto Cumplimiento (akczzwsfggzcfqyytyho) → SQL Editor.
-- Idempotente. La alimenta api/regulatorio-sync.js (cron diario de Vercel).
--  1. calificacion_regulatoria: calificación del nivel de cumplimiento regulatorio por empresa,
--     calculada en Gestión Regulatoria, con sus puntos pendientes. Es DISTINTA del «Nivel de
--     Cumplimiento» de esta app (src/lib/nivelCumplimiento.js).
--  2. normativa: columnas de origen para cargar la normativa aprobada en Gestión Regulatoria
--     sin duplicarla y desactivando la versión anterior del mismo documento.
-- ============================================================================
begin;

create table if not exists public.calificacion_regulatoria (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  indice           numeric(5,1),
  nivel            text check (nivel in ('alto', 'medio', 'bajo', 'sin_datos')),
  componentes      jsonb not null default '{}',
  pendientes       jsonb not null default '[]',   -- [{gravedad, area, descripcion, fecha}]
  total_pendientes int not null default 0,
  calculado_en     timestamptz,
  sincronizado_en  timestamptz not null default now()
);
alter table public.calificacion_regulatoria enable row level security;
drop policy if exists calificacion_regulatoria_lectura on public.calificacion_regulatoria;
create policy calificacion_regulatoria_lectura on public.calificacion_regulatoria for select
  using (es_superadmin() or tenant_id in (select mis_tenant_ids()));
-- Escritura solo con service role (api/regulatorio-sync.js): sin políticas de insert/update/delete.
revoke insert, update, delete on public.calificacion_regulatoria from anon, authenticated;

alter table public.normativa add column if not exists origen text not null default 'manual';
alter table public.normativa add column if not exists origen_ref text;          -- regulatorio:<version_id>
alter table public.normativa add column if not exists origen_documento text;    -- regulatorio:<documento_normativo_id>
create unique index if not exists normativa_origen_ref on public.normativa (origen_ref) where origen_ref is not null;
create index if not exists normativa_origen_documento on public.normativa (tenant_id, origen_documento) where origen_documento is not null;

commit;

-- Verificación
select 'calificacion_regulatoria' as objeto, count(*) from public.calificacion_regulatoria
union all select 'normativa con origen regulatorio', count(*) from public.normativa where origen = 'regulatorio';
