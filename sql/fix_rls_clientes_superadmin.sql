-- ══════════════════════════════════════════════════════════════════════════════
-- RLS clientes: permitir lectura total al superadmin
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- Ver políticas actuales de la tabla clientes
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'clientes';

-- ──────────────────────────────────────────────────────────────────────────────
-- Agregar política SELECT para superadmin (ve todos los clientes de todos los tenants)
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_clientes_select" ON clientes;
CREATE POLICY "superadmin_clientes_select"
  ON clientes FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin'
  );

DROP POLICY IF EXISTS "superadmin_clientes_insert" ON clientes;
CREATE POLICY "superadmin_clientes_insert"
  ON clientes FOR INSERT
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin'
  );

DROP POLICY IF EXISTS "superadmin_clientes_update" ON clientes;
CREATE POLICY "superadmin_clientes_update"
  ON clientes FOR UPDATE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin'
  );

-- Verificar que quedaron las políticas
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'clientes'
ORDER BY cmd, policyname;
