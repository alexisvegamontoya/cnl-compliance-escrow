-- =====================================================
-- DASHBOARD DE INTELIGENCIA REGULATORIA — feed_items
-- Ejecutar en Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS feed_items (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo            TEXT NOT NULL,
  resumen           TEXT,
  url               TEXT UNIQUE NOT NULL,
  fuente            TEXT,
  fuente_tipo       TEXT DEFAULT 'informativo',
  urgencia          TEXT DEFAULT 'informativo'
                    CHECK (urgencia IN ('urgente','importante','informativo')),
  fecha_publicacion DATE,
  fecha_ingreso     TIMESTAMPTZ DEFAULT NOW(),
  activo            BOOLEAN DEFAULT TRUE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_feed_urgencia   ON feed_items (urgencia);
CREATE INDEX IF NOT EXISTS idx_feed_tipo       ON feed_items (fuente_tipo);
CREATE INDEX IF NOT EXISTS idx_feed_fecha      ON feed_items (fecha_ingreso DESC);
CREATE INDEX IF NOT EXISTS idx_feed_activo     ON feed_items (activo);

-- RLS: todos los usuarios autenticados pueden leer
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_read_authenticated" ON feed_items;
CREATE POLICY "feed_read_authenticated" ON feed_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Nota: INSERT/UPDATE solo via service_role key (Vercel serverless API)
-- service_role bypasses RLS automáticamente.
