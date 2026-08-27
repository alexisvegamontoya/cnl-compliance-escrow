-- ============================================================
-- Roles funcionales por empresa (control de acceso por módulo)
-- Amplía user_tenant_memberships.rol a los perfiles de la propuesta.
-- 'operador' se conserva como valor heredado (miembros existentes) hasta que
-- se reasignen; en la app se trata como Oficial de Cumplimiento (acceso total
-- operativo), así nadie pierde acceso de golpe. Ver src/lib/permisos.js
-- ============================================================

alter table public.user_tenant_memberships
  drop constraint if exists user_tenant_memberships_rol_check;

alter table public.user_tenant_memberships
  add constraint user_tenant_memberships_rol_check
  check (rol in (
    'operador',            -- heredado
    'oficial_cumplimiento',
    'operativo',
    'financiero',
    'gerencia',
    'admin_tenant'
  ));

notify pgrst, 'reload schema';
