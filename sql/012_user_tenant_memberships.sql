-- ============================================================
-- Migración: Membresías de usuarios a sujetos obligados
-- Permite que un usuario esté ligado a uno o varios tenants
-- ============================================================

-- Tabla principal many-to-many
CREATE TABLE IF NOT EXISTS user_tenant_memberships (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rol        TEXT    NOT NULL DEFAULT 'operador'
               CHECK (rol IN ('operador', 'admin_tenant')),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_utm_user   ON user_tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_utm_tenant ON user_tenant_memberships(tenant_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE user_tenant_memberships ENABLE ROW LEVEL SECURITY;

-- Superadmin puede todo
CREATE POLICY "utm_superadmin_all" ON user_tenant_memberships
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND rol = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND rol = 'superadmin'
    )
  );

-- Cada usuario puede leer sus propias membresías activas
CREATE POLICY "utm_own_read" ON user_tenant_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND activo = TRUE);

-- Admin del tenant puede ver las membresías de su tenant
CREATE POLICY "utm_admin_tenant_read" ON user_tenant_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_tenant_memberships utm2
      WHERE utm2.user_id = auth.uid()
        AND utm2.tenant_id = user_tenant_memberships.tenant_id
        AND utm2.rol = 'admin_tenant'
        AND utm2.activo = TRUE
    )
  );

-- ============================================================
-- Migrar usuarios existentes a la tabla de membresías
-- (ejecutar SOLO si ya hay usuarios con tenant_id en user_profiles)
-- ============================================================
INSERT INTO user_tenant_memberships (user_id, tenant_id, rol, activo)
SELECT
  up.id        AS user_id,
  up.tenant_id AS tenant_id,
  CASE
    WHEN up.rol IN ('admin', 'admin_tenant') THEN 'admin_tenant'
    ELSE 'operador'
  END           AS rol,
  COALESCE(up.activo, TRUE) AS activo
FROM user_profiles up
WHERE up.tenant_id IS NOT NULL
  AND up.rol != 'superadmin'
ON CONFLICT (user_id, tenant_id) DO NOTHING;
