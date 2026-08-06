-- ============================================================
-- Normativa Interna: permitir que cualquier usuario del sujeto
-- obligado cargue documentos (no solo administradores).
--
-- El cambio de interfaz ya está hecho en src/pages/Normativa.jsx.
-- Este archivo ajusta los permisos del lado de la base, que son
-- los que realmente mandan: la app sube con la sesión del usuario
-- (clave anon + su JWT), así que la RLS y las políticas del bucket
-- pueden seguir rechazando al operador aunque el botón ya aparezca.
--
-- Criterio aplicado:
--   • Ver y CARGAR  → cualquier miembro del sujeto obligado
--   • Editar y BORRAR → solo admin_tenant o superadmin
--     (la app borra con UPDATE activo=false, por eso se limita UPDATE)
--
-- EJECUTAR en Supabase → SQL Editor → New query → Run
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASO 1 (diagnóstico, no modifica nada)
-- Ver qué políticas existen hoy, antes de cambiarlas.
-- ────────────────────────────────────────────────────────────
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'normativa';

-- Políticas del bucket de archivos
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- ¿El bucket existe y es privado?
SELECT id, name, public FROM storage.buckets WHERE id = 'normativa';


-- ────────────────────────────────────────────────────────────
-- PASO 2 — Función auxiliar: ¿el usuario administra este tenant?
-- SECURITY DEFINER para que no dispare la RLS de las tablas que consulta.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION es_admin_de(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT es_superadmin()
      OR EXISTS (
           SELECT 1 FROM user_tenant_memberships m
            WHERE m.user_id = auth.uid()
              AND m.tenant_id = p_tenant
              AND m.rol = 'admin_tenant'
              AND m.activo
         )
      OR EXISTS (
           SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid()
              AND up.rol IN ('admin', 'admin_tenant')
              AND up.tenant_id = p_tenant
         )
$$;


-- ────────────────────────────────────────────────────────────
-- PASO 3 — Políticas de la tabla normativa
-- ────────────────────────────────────────────────────────────
ALTER TABLE normativa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "norm_superadmin_all"  ON normativa;
DROP POLICY IF EXISTS "norm_tenant_select"   ON normativa;
DROP POLICY IF EXISTS "norm_tenant_insert"   ON normativa;
DROP POLICY IF EXISTS "norm_admin_update"    ON normativa;
DROP POLICY IF EXISTS "norm_admin_delete"    ON normativa;

CREATE POLICY "norm_superadmin_all" ON normativa
  FOR ALL TO authenticated
  USING (es_superadmin()) WITH CHECK (es_superadmin());

-- Cualquier miembro del sujeto obligado ve la normativa
CREATE POLICY "norm_tenant_select" ON normativa
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()));

-- ── Este es el cambio pedido: cualquier miembro puede CARGAR ──
CREATE POLICY "norm_tenant_insert" ON normativa
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));

-- Modificar (incluye el borrado lógico activo=false) solo administradores
CREATE POLICY "norm_admin_update" ON normativa
  FOR UPDATE TO authenticated
  USING (es_admin_de(tenant_id))
  WITH CHECK (es_admin_de(tenant_id));

CREATE POLICY "norm_admin_delete" ON normativa
  FOR DELETE TO authenticated
  USING (es_admin_de(tenant_id));


-- ────────────────────────────────────────────────────────────
-- PASO 4 — Políticas del bucket "normativa" (Storage)
--
-- La app guarda con la ruta  <tenant_id>/<timestamp>_<archivo>
-- (ver src/pages/Normativa.jsx, función guardar), así que la primera
-- carpeta de la ruta es el tenant y sobre eso se autoriza.
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('normativa', 'normativa', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "norm_obj_select" ON storage.objects;
DROP POLICY IF EXISTS "norm_obj_insert" ON storage.objects;
DROP POLICY IF EXISTS "norm_obj_delete" ON storage.objects;

CREATE POLICY "norm_obj_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'normativa'
    AND (es_superadmin() OR (storage.foldername(name))[1]::uuid IN (SELECT mis_tenant_ids()))
  );

-- ── Cualquier miembro puede subir el archivo ──
CREATE POLICY "norm_obj_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'normativa'
    AND (es_superadmin() OR (storage.foldername(name))[1]::uuid IN (SELECT mis_tenant_ids()))
  );

-- Borrar el archivo, solo administradores
CREATE POLICY "norm_obj_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'normativa'
    AND es_admin_de((storage.foldername(name))[1]::uuid)
  );


-- ────────────────────────────────────────────────────────────
-- PASO 5 (verificación) — deben aparecer las políticas nuevas
-- ────────────────────────────────────────────────────────────
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'normativa' OR (schemaname = 'storage' AND policyname LIKE 'norm_obj%')
ORDER BY tablename, policyname;
