-- ============================================================
-- Migración: Control de períodos reportados por sujeto obligado
-- Registra meses declarados con movimiento o sin movimiento
-- ============================================================

CREATE TABLE IF NOT EXISTS periodos_declarados (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  periodo        DATE    NOT NULL,   -- siempre día 1 del mes, ej: 2026-06-01
  tipo           TEXT    NOT NULL
                   CHECK (tipo IN ('con_movimiento', 'sin_movimiento')),
  declarado_por  UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_pd_tenant  ON periodos_declarados(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pd_periodo ON periodos_declarados(periodo);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE periodos_declarados ENABLE ROW LEVEL SECURITY;

-- Superadmin puede todo
CREATE POLICY "pd_superadmin_all" ON periodos_declarados
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND rol = 'superadmin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND rol = 'superadmin')
  );

-- Usuarios del tenant pueden leer y escribir sus propios registros
CREATE POLICY "pd_tenant_all" ON periodos_declarados
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_memberships
      WHERE user_id = auth.uid() AND activo = TRUE
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_memberships
      WHERE user_id = auth.uid() AND activo = TRUE
    )
  );

-- ============================================================
-- Poblar automáticamente los meses que ya tienen transacciones
-- (para tenants existentes que ya tienen datos)
-- ============================================================
INSERT INTO periodos_declarados (tenant_id, periodo, tipo, declarado_por)
SELECT DISTINCT
  tenant_id,
  DATE_TRUNC('month', periodo::date)::date AS periodo,
  'con_movimiento' AS tipo,
  NULL AS declarado_por
FROM transacciones
WHERE periodo IS NOT NULL
ON CONFLICT (tenant_id, periodo) DO NOTHING;
