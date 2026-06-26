-- =====================================================
-- PADRÓN SUGEF + LISTA PEP ICD
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Tabla padrón unificado (físicas + jurídicas)
CREATE TABLE IF NOT EXISTS padron_sugef (
  id               BIGSERIAL PRIMARY KEY,
  identificacion   TEXT NOT NULL,
  nombre_completo  TEXT NOT NULL,
  tipo             CHAR(1) NOT NULL,   -- 'F' = Física, 'J' = Jurídica
  pais             TEXT DEFAULT 'CR',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único por identificación (clave de búsqueda)
CREATE UNIQUE INDEX IF NOT EXISTS idx_padron_identificacion
  ON padron_sugef (identificacion);

-- Índice para búsqueda por nombre (trigrama)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_padron_nombre_trgm
  ON padron_sugef USING GiST (lower(nombre_completo) gist_trgm_ops);

-- RLS: usuarios autenticados pueden leer
ALTER TABLE padron_sugef ENABLE ROW LEVEL SECURITY;
CREATE POLICY "padron_select_auth" ON padron_sugef
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. Función de búsqueda por cédula exacta
CREATE OR REPLACE FUNCTION buscar_padron(p_identificacion TEXT)
RETURNS TABLE (
  identificacion  TEXT,
  nombre_completo TEXT,
  tipo            CHAR(1),
  pais            TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.identificacion, p.nombre_completo, p.tipo, p.pais
  FROM padron_sugef p
  WHERE p.identificacion = trim(p_identificacion)
     OR p.identificacion = lpad(trim(p_identificacion), 9, '0')
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Tabla para lista PEP del ICD Costa Rica
-- (Se insertará desde el script de carga)
-- La lista PEP se guarda en listas_sanciones con fuente='ICD_CR_PEP'

-- 4. Recordatorio anual — notificación a superadmin
-- Se ejecuta manualmente o via pg_cron cada año
-- INSERT de ejemplo para probar:
-- INSERT INTO notificaciones (tenant_id, titulo, mensaje, tipo)
-- SELECT NULL,
--   '📋 Actualización lista PEP ICD requerida',
--   'La Lista de Personas Expuestas Políticamente del ICD Costa Rica debe actualizarse anualmente. Descargue el nuevo archivo en https://www.icd.go.cr y ejecute el script scripts/upload-padron.js',
--   'alerta'
-- WHERE TRUE;
