-- ============================================================
-- Fase 2 · Blindaje RLS por rol para módulos sensibles
-- Refuerza en la base de datos lo que la UI ya limita (permisos.js):
--   · ROS (reportes_ros): Operativo/Financiero SIN acceso; Gerencia solo lee;
--     Oficial/Admin/Operador(heredado)/Superadmin: total.
--   · Denuncias (denuncias): la bandeja (leer/gestionar) solo Oficial/Admin/
--     Gerencia(lectura)/Superadmin. Presentar una denuncia queda abierto
--     (canal de denuncias): insert para cualquier usuario del tenant y anónimo.
-- El rol vive en user_tenant_memberships.rol; miembros por grupo = oficial.
-- ============================================================

-- Rol funcional efectivo del usuario actual sobre una empresa.
-- (Reemplaza la versión simple previa; conserva el nombre de parámetro.)
create or replace function mi_rol_en_tenant(p_tenant_id uuid)
returns text
language sql
security definer
stable
as $$
  select case
    when es_superadmin() then 'superadmin'
    when exists (
      select 1 from tenants t
      join grupo_usuarios gu on gu.grupo_id = t.grupo_id
      where t.id = p_tenant_id and gu.user_id = auth.uid() and gu.activo = true
    ) then 'oficial_cumplimiento'   -- miembro pleno por grupo de empresas
    else coalesce(
      (select rol from user_tenant_memberships
        where user_id = auth.uid() and tenant_id = p_tenant_id and activo = true
        limit 1),
      ''
    )
  end
$$;

-- ─────────────────────────────────────────────────────────────
-- reportes_ros
-- ─────────────────────────────────────────────────────────────
alter table public.reportes_ros enable row level security;

drop policy if exists ros_tenant_select   on public.reportes_ros;
drop policy if exists ros_tenant_insert   on public.reportes_ros;
drop policy if exists ros_tenant_update   on public.reportes_ros;
drop policy if exists ros_tenant_delete   on public.reportes_ros;
drop policy if exists ros_superadmin_all  on public.reportes_ros;
drop policy if exists ros_ver             on public.reportes_ros;
drop policy if exists ros_editar_insert   on public.reportes_ros;
drop policy if exists ros_editar_update   on public.reportes_ros;
drop policy if exists ros_editar_delete   on public.reportes_ros;

-- Ver: oficial, admin, operador(heredado), gerencia (lectura), superadmin.
create policy ros_ver on public.reportes_ros
  for select to authenticated
  using (mi_rol_en_tenant(tenant_id) in
    ('superadmin','admin_tenant','oficial_cumplimiento','operador','gerencia'));

-- Editar (insert/update/delete): igual pero SIN gerencia.
create policy ros_editar_insert on public.reportes_ros
  for insert to authenticated
  with check (mi_rol_en_tenant(tenant_id) in
    ('superadmin','admin_tenant','oficial_cumplimiento','operador'));

create policy ros_editar_update on public.reportes_ros
  for update to authenticated
  using (mi_rol_en_tenant(tenant_id) in
    ('superadmin','admin_tenant','oficial_cumplimiento','operador'))
  with check (mi_rol_en_tenant(tenant_id) in
    ('superadmin','admin_tenant','oficial_cumplimiento','operador'));

create policy ros_editar_delete on public.reportes_ros
  for delete to authenticated
  using (mi_rol_en_tenant(tenant_id) in
    ('superadmin','admin_tenant','oficial_cumplimiento','operador'));

-- ─────────────────────────────────────────────────────────────
-- denuncias
-- ─────────────────────────────────────────────────────────────
alter table public.denuncias enable row level security;

drop policy if exists den_superadmin_all on public.denuncias;
drop policy if exists den_tenant_all     on public.denuncias;
drop policy if exists den_insert         on public.denuncias;
drop policy if exists den_public_insert  on public.denuncias;
drop policy if exists den_select         on public.denuncias;
drop policy if exists den_update         on public.denuncias;
drop policy if exists den_gestion_select on public.denuncias;
drop policy if exists den_gestion_update on public.denuncias;
drop policy if exists den_gestion_delete on public.denuncias;
drop policy if exists den_ins_auth       on public.denuncias;
drop policy if exists den_ins_anon       on public.denuncias;

-- Presentar denuncia: abierto. Usuario autenticado del tenant o anónimo (canal público).
create policy den_ins_auth on public.denuncias
  for insert to authenticated
  with check (tenant_id in (select mis_tenant_ids()) or es_superadmin());

create policy den_ins_anon on public.denuncias
  for insert to anon
  with check (true);

-- Ver la bandeja: oficial, admin, gerencia (lectura), superadmin.
create policy den_gestion_select on public.denuncias
  for select to authenticated
  using (mi_rol_en_tenant(tenant_id) in
    ('superadmin','admin_tenant','oficial_cumplimiento','operador','gerencia'));

-- Gestionar (actualizar estado): oficial, admin, superadmin (gerencia NO).
create policy den_gestion_update on public.denuncias
  for update to authenticated
  using (mi_rol_en_tenant(tenant_id) in
    ('superadmin','admin_tenant','oficial_cumplimiento','operador'))
  with check (mi_rol_en_tenant(tenant_id) in
    ('superadmin','admin_tenant','oficial_cumplimiento','operador'));

notify pgrst, 'reload schema';
