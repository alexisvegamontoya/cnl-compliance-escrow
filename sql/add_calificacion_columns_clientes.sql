-- ============================================================
-- Agregar columnas de calificación de riesgo a tabla clientes
-- Ejecutar en Supabase SQL Editor si las columnas no existen
-- ============================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS calificacion_riesgo       TEXT,
  ADD COLUMN IF NOT EXISTS nivel_riesgo_actual        TEXT,
  ADD COLUMN IF NOT EXISTS ultima_calificacion        TEXT,
  ADD COLUMN IF NOT EXISTS estado_calificacion        TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS fecha_ultima_calificacion  DATE;

-- Índice para búsquedas por nivel de riesgo
CREATE INDEX IF NOT EXISTS idx_clientes_calificacion_riesgo
  ON clientes (calificacion_riesgo, tenant_id);

-- Comentarios descriptivos
COMMENT ON COLUMN clientes.calificacion_riesgo       IS 'Nivel de riesgo: bajo / medio / alto';
COMMENT ON COLUMN clientes.nivel_riesgo_actual       IS 'Alias de calificacion_riesgo (campo calculado)';
COMMENT ON COLUMN clientes.ultima_calificacion       IS 'Resultado de la última calificación ALA/CFT';
COMMENT ON COLUMN clientes.estado_calificacion       IS 'pendiente / completado / requiere_revision';
COMMENT ON COLUMN clientes.fecha_ultima_calificacion IS 'Fecha de la última calificación de riesgo';
