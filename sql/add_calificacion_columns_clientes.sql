-- ============================================================
-- Columnas de compliance en tabla clientes
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE clientes
  -- Calificación de riesgo
  ADD COLUMN IF NOT EXISTS calificacion_riesgo        TEXT,
  ADD COLUMN IF NOT EXISTS nivel_riesgo_actual         TEXT,
  ADD COLUMN IF NOT EXISTS estado_calificacion         TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS fecha_ultima_calificacion   DATE,
  -- Debida Diligencia
  ADD COLUMN IF NOT EXISTS estado_dd                   TEXT DEFAULT 'pendiente',
  -- Listas internacionales
  ADD COLUMN IF NOT EXISTS estado_listas               TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS aparece_en_listas           BOOLEAN DEFAULT FALSE,
  -- PEP
  ADD COLUMN IF NOT EXISTS pep                         BOOLEAN DEFAULT FALSE;

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_clientes_calificacion_riesgo
  ON clientes (calificacion_riesgo, tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_estado_dd
  ON clientes (estado_dd, tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_estado_listas
  ON clientes (estado_listas, tenant_id);

-- Comentarios
COMMENT ON COLUMN clientes.calificacion_riesgo      IS 'Nivel de riesgo: bajo / medio / alto';
COMMENT ON COLUMN clientes.nivel_riesgo_actual      IS 'Sinónimo de calificacion_riesgo (campo calculado)';
COMMENT ON COLUMN clientes.estado_calificacion      IS 'pendiente / completado / requiere_revision';
COMMENT ON COLUMN clientes.fecha_ultima_calificacion IS 'Fecha de la última calificación ALA/CFT';
COMMENT ON COLUMN clientes.estado_dd                IS 'pendiente / en_progreso / completado';
COMMENT ON COLUMN clientes.estado_listas            IS 'pendiente / verificado / revisar / alerta';
COMMENT ON COLUMN clientes.aparece_en_listas        IS 'TRUE si figura en listas internacionales con similitud >=85%';
COMMENT ON COLUMN clientes.pep                      IS 'TRUE si es Persona Expuesta Políticamente (Lista ICD/UIF CR)';
