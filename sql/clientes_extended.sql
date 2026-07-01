-- ══════════════════════════════════════════════════════════════════════════════
-- MÓDULO GESTIÓN DE CLIENTES — Extensión del esquema
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Ampliar tabla clientes con datos de perfil completo ───────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tipo_persona          TEXT DEFAULT 'fisica',        -- fisica | juridica
  ADD COLUMN IF NOT EXISTS fecha_nacimiento      DATE,
  ADD COLUMN IF NOT EXISTS genero                TEXT,                          -- M | F | otro
  ADD COLUMN IF NOT EXISTS estado_civil          TEXT,
  ADD COLUMN IF NOT EXISTS profesion_nombre      TEXT,                          -- texto de la lista
  ADD COLUMN IF NOT EXISTS profesion_valor       INTEGER,                       -- 1=bajo 2=medio 3=alto
  ADD COLUMN IF NOT EXISTS actividad_eco_nombre  TEXT,                          -- nombre actividad económica
  ADD COLUMN IF NOT EXISTS actividad_eco_valor   INTEGER,
  ADD COLUMN IF NOT EXISTS pais_nacimiento        TEXT,
  ADD COLUMN IF NOT EXISTS provincia             TEXT,
  ADD COLUMN IF NOT EXISTS canton                TEXT,
  ADD COLUMN IF NOT EXISTS direccion_exacta      TEXT,
  ADD COLUMN IF NOT EXISTS proposito_relacion    TEXT,
  ADD COLUMN IF NOT EXISTS origen_fondos         TEXT,
  ADD COLUMN IF NOT EXISTS ingreso_mensual_est   NUMERIC(12,2),
  -- Empresa
  ADD COLUMN IF NOT EXISTS cedula_juridica       TEXT,
  ADD COLUMN IF NOT EXISTS fecha_constitucion    DATE,
  ADD COLUMN IF NOT EXISTS pais_constitucion     TEXT DEFAULT 'Costa Rica',
  -- Estados de gestión compliance
  ADD COLUMN IF NOT EXISTS estado_dd             TEXT DEFAULT 'pendiente',      -- pendiente | en_proceso | completado
  ADD COLUMN IF NOT EXISTS estado_listas         TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS estado_calificacion   TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS nivel_riesgo_actual   TEXT,                          -- bajo | medio | alto
  ADD COLUMN IF NOT EXISTS ultima_calificacion   DATE,
  ADD COLUMN IF NOT EXISTS ultima_revision_dd    DATE,
  ADD COLUMN IF NOT EXISTS ultima_consulta_listas DATE;

-- ── 2. Tabla: personas y empresas relacionadas al cliente ────────────────────
CREATE TABLE IF NOT EXISTS clientes_personas_relacionadas (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  cliente_id            UUID REFERENCES clientes(id) ON DELETE CASCADE NOT NULL,

  -- Tipo de vínculo con el cliente principal
  tipo_relacion         TEXT NOT NULL,  -- representante_legal | junta_directiva | socio | beneficiario_final | apoderado | otro
  tipo_entidad          TEXT NOT NULL DEFAULT 'persona_fisica',  -- persona_fisica | persona_juridica

  -- Datos básicos
  nombre                TEXT NOT NULL,
  identificacion        TEXT,
  tipo_id               TEXT,           -- cedula | dimex | pasaporte | cedula_juridica
  nacionalidad          TEXT,
  pais_residencia       TEXT,
  correo                TEXT,
  telefono              TEXT,

  -- Solo para socios/accionistas
  porcentaje_participacion NUMERIC(5,2),
  es_beneficiario_final   BOOLEAN DEFAULT FALSE,

  -- Solo para junta directiva / representante
  cargo                 TEXT,           -- Presidente, Secretario, Vocal, etc.

  -- Para empresas relacionadas: link a cliente en el sistema
  cliente_relacionado_id UUID REFERENCES clientes(id),

  -- Estructura interna de la empresa relacionada (si no está en el sistema)
  -- Permite cadena hasta persona física
  sub_personas          JSONB DEFAULT '[]'::jsonb,
  -- sub_personas = [ { tipo_relacion, tipo_entidad, nombre, id, porcentaje, sub_personas: [...] } ]

  -- Metadatos
  notas                 TEXT,
  orden                 INTEGER DEFAULT 0,
  activo                BOOLEAN DEFAULT TRUE,
  creado_en             TIMESTAMPTZ DEFAULT NOW(),
  creado_por            UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cpr_cliente    ON clientes_personas_relacionadas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cpr_tenant     ON clientes_personas_relacionadas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cpr_relacion   ON clientes_personas_relacionadas(tipo_relacion);
CREATE INDEX IF NOT EXISTS idx_cpr_relacionado ON clientes_personas_relacionadas(cliente_relacionado_id);

-- RLS
ALTER TABLE clientes_personas_relacionadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpr_superadmin" ON clientes_personas_relacionadas
  USING (es_superadmin());

CREATE POLICY "cpr_tenant_select" ON clientes_personas_relacionadas
  FOR SELECT USING (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "cpr_tenant_insert" ON clientes_personas_relacionadas
  FOR INSERT WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "cpr_tenant_update" ON clientes_personas_relacionadas
  FOR UPDATE USING (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "cpr_tenant_delete" ON clientes_personas_relacionadas
  FOR DELETE USING (tenant_id IN (SELECT mis_tenant_ids()));

-- ── 3. Vista útil: clientes con conteo de personas relacionadas ──────────────
CREATE OR REPLACE VIEW v_clientes_resumen AS
SELECT
  c.*,
  COUNT(DISTINCT cpr.id) FILTER (WHERE cpr.tipo_relacion = 'representante_legal') AS total_representantes,
  COUNT(DISTINCT cpr.id) FILTER (WHERE cpr.tipo_relacion = 'junta_directiva')    AS total_junta,
  COUNT(DISTINCT cpr.id) FILTER (WHERE cpr.tipo_relacion = 'socio')              AS total_socios
FROM clientes c
LEFT JOIN clientes_personas_relacionadas cpr ON cpr.cliente_id = c.id AND cpr.activo = TRUE
GROUP BY c.id;
