-- ============================================================
-- Tabla: informes_generados
-- Guarda cada informe generado con fecha, tipo y datos JSON
-- Ejecutar en Supabase → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS informes_generados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo_informe    TEXT NOT NULL CHECK (tipo_informe IN ('transaccional','labores','plan_trabajo','capacitacion')),
  periodo         TEXT NOT NULL,          -- YYYY-MM para transaccional, YYYY para los demás
  fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  generado_por    UUID REFERENCES auth.users(id),
  generado_por_nombre TEXT,
  resumen_json    JSONB,                  -- Métricas clave del informe
  observaciones   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE informes_generados ENABLE ROW LEVEL SECURITY;

-- Cada tenant solo ve sus propios informes
CREATE POLICY "inf_tenant_select" ON informes_generados
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "inf_tenant_insert" ON informes_generados
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "inf_superadmin_all" ON informes_generados
  FOR ALL TO authenticated
  USING (es_superadmin())
  WITH CHECK (es_superadmin());

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_informes_tenant ON informes_generados (tenant_id);
CREATE INDEX IF NOT EXISTS idx_informes_tipo   ON informes_generados (tenant_id, tipo_informe);
CREATE INDEX IF NOT EXISTS idx_informes_fecha  ON informes_generados (tenant_id, fecha_generacion DESC);

-- ============================================================
-- Vista: estado de periodicidad por tenant
-- Permite saber cuándo fue el último informe de cada tipo
-- ============================================================

CREATE OR REPLACE VIEW vw_estado_informes AS
SELECT
  t.id   AS tenant_id,
  t.nombre AS tenant_nombre,
  ti.tipo,
  MAX(ig.fecha_generacion) AS ultimo_generado,
  COUNT(ig.id)             AS total_generados
FROM tenants t
CROSS JOIN (VALUES ('transaccional'),('labores'),('plan_trabajo'),('capacitacion')) AS ti(tipo)
LEFT JOIN informes_generados ig ON ig.tenant_id = t.id AND ig.tipo_informe = ti.tipo
GROUP BY t.id, t.nombre, ti.tipo;

-- ============================================================
-- VERIFICACIÓN: confirme que la tabla se creó
-- ============================================================
-- SELECT * FROM informes_generados LIMIT 5;
-- SELECT * FROM vw_estado_informes WHERE tenant_nombre ILIKE '%tu sujeto%';
