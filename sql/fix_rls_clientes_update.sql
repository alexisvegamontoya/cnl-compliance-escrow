-- ============================================================
-- FIX: Permitir UPDATE en tabla clientes via RLS
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Ver políticas actuales de clientes (para diagnóstico)
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies WHERE tablename = 'clientes';

-- 2. Agregar columnas faltantes (si no se hizo antes)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS calificacion_riesgo        TEXT,
  ADD COLUMN IF NOT EXISTS nivel_riesgo_actual         TEXT,
  ADD COLUMN IF NOT EXISTS estado_calificacion         TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS fecha_ultima_calificacion   DATE,
  ADD COLUMN IF NOT EXISTS estado_dd                   TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS estado_listas               TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS aparece_en_listas           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pep                         BOOLEAN DEFAULT FALSE;

-- 3. Política UPDATE para usuarios del tenant
--    (permite a miembros activos del tenant actualizar sus propios clientes)
DROP POLICY IF EXISTS "clientes_update_miembro" ON clientes;

CREATE POLICY "clientes_update_miembro" ON clientes
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_memberships
      WHERE user_id = auth.uid() AND activo = true
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_memberships
      WHERE user_id = auth.uid() AND activo = true
    )
  );

-- 4. Política UPDATE para superadmin (puede actualizar cualquier cliente)
DROP POLICY IF EXISTS "clientes_update_superadmin" ON clientes;

CREATE POLICY "clientes_update_superadmin" ON clientes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_superadmin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_superadmin = true
    )
  );

-- 5. Verificar que RLS está habilitado en clientes
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- ✅ Después de ejecutar esto, el botón "Guardar calificación" actualizará clientes.calificacion_riesgo
