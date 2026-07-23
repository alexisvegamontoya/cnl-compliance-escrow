-- ══════════════════════════════════════════════════════════════════════════════
-- Campos usados por la plantilla ampliada de carga masiva de clientes
-- (idempotente: se puede ejecutar aunque las columnas ya existan)
-- Ejecutar en Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nombre_contacto      TEXT,
  ADD COLUMN IF NOT EXISTS telefono             TEXT,
  ADD COLUMN IF NOT EXISTS correo_electronico   TEXT,
  ADD COLUMN IF NOT EXISTS fecha_vinculacion    DATE,
  ADD COLUMN IF NOT EXISTS actividad_economica  TEXT,
  ADD COLUMN IF NOT EXISTS pais_constitucion    TEXT DEFAULT 'Costa Rica',
  ADD COLUMN IF NOT EXISTS fecha_constitucion   DATE;

-- Personas relacionadas: contacto de representantes / socios (hoja "Estructura")
ALTER TABLE clientes_personas_relacionadas
  ADD COLUMN IF NOT EXISTS correo               TEXT,
  ADD COLUMN IF NOT EXISTS telefono             TEXT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'clientes'
-- ORDER BY column_name;
