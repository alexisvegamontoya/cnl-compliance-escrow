-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Columnas faltantes en tabla clientes
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS pais_ubicacion       TEXT,   -- país de residencia actual
  ADD COLUMN IF NOT EXISTS pais_residencia      TEXT,   -- alias de pais_ubicacion
  ADD COLUMN IF NOT EXISTS primer_apellido      TEXT,
  ADD COLUMN IF NOT EXISTS segundo_apellido     TEXT,
  ADD COLUMN IF NOT EXISTS actividad_eco_nombre TEXT,
  ADD COLUMN IF NOT EXISTS actividad_eco_valor  INTEGER,
  ADD COLUMN IF NOT EXISTS profesion_nombre     TEXT,
  ADD COLUMN IF NOT EXISTS profesion_valor      INTEGER,
  ADD COLUMN IF NOT EXISTS tipo_persona         TEXT DEFAULT 'fisica',
  ADD COLUMN IF NOT EXISTS tipo_identificacion  TEXT DEFAULT '1',
  ADD COLUMN IF NOT EXISTS fecha_nacimiento     DATE,
  ADD COLUMN IF NOT EXISTS genero               TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil         TEXT,
  ADD COLUMN IF NOT EXISTS pais_nacimiento      TEXT,
  ADD COLUMN IF NOT EXISTS provincia            TEXT,
  ADD COLUMN IF NOT EXISTS canton               TEXT,
  ADD COLUMN IF NOT EXISTS direccion_exacta     TEXT,
  ADD COLUMN IF NOT EXISTS proposito_relacion   TEXT,
  ADD COLUMN IF NOT EXISTS origen_fondos        TEXT,
  ADD COLUMN IF NOT EXISTS ingreso_mensual_est  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cedula_juridica      TEXT,
  ADD COLUMN IF NOT EXISTS fecha_constitucion   DATE,
  ADD COLUMN IF NOT EXISTS pais_constitucion    TEXT DEFAULT 'Costa Rica',
  ADD COLUMN IF NOT EXISTS estado_dd            TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS estado_listas        TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS estado_calificacion  TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS nivel_riesgo_actual  TEXT,
  ADD COLUMN IF NOT EXISTS ultima_calificacion  DATE,
  ADD COLUMN IF NOT EXISTS ultima_revision_dd   DATE,
  ADD COLUMN IF NOT EXISTS ultima_consulta_listas DATE;

-- Índice útil para búsquedas por tipo
CREATE INDEX IF NOT EXISTS idx_clientes_tipo     ON clientes(tipo_persona);
CREATE INDEX IF NOT EXISTS idx_clientes_riesgo   ON clientes(nivel_riesgo_actual);
CREATE INDEX IF NOT EXISTS idx_clientes_estado   ON clientes(estado_dd);
