-- =====================================================
-- MÓDULO PEP / LISTAS INTERNACIONALES
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Tabla principal de listas de sanciones
CREATE TABLE IF NOT EXISTS listas_sanciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente            TEXT NOT NULL,      -- 'OFAC_SDN','OFAC_CONS','ONU','UK_OFSI','INTERPOL','GAFI_NEGRO','GAFI_GRIS','GAFILAT','EU_FSF'
  tipo_lista        TEXT NOT NULL,      -- 'sancion','alerta_roja','lista_negra','lista_gris','pep'
  nombre_completo   TEXT NOT NULL,
  aliases           TEXT[]  DEFAULT '{}',
  tipo_entidad      TEXT    DEFAULT 'individual',  -- 'individual','entidad','pais'
  fecha_nacimiento  TEXT,
  paises            TEXT[]  DEFAULT '{}',
  identificaciones  JSONB   DEFAULT '[]',
  programa          TEXT,
  motivo            TEXT,
  nivel_riesgo      TEXT    DEFAULT 'alto',        -- 'muy_alto','alto','medio'
  referencia_id     TEXT,                           -- ID interno de la fuente (uid OFAC, etc.)
  datos_originales  JSONB,
  activo            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_ls_nombre_trgm
  ON listas_sanciones USING GiST (lower(nombre_completo) gist_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ls_fuente   ON listas_sanciones (fuente);
CREATE INDEX IF NOT EXISTS idx_ls_activo   ON listas_sanciones (activo);
CREATE INDEX IF NOT EXISTS idx_ls_aliases  ON listas_sanciones USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_ls_ref      ON listas_sanciones (referencia_id);

-- 3. Tabla de consultas realizadas (auditoría)
CREATE TABLE IF NOT EXISTS consultas_listas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email          TEXT,
  cliente_id          UUID REFERENCES clientes(id) ON DELETE SET NULL,
  nombre_buscado      TEXT NOT NULL,
  identificacion      TEXT,
  pais                TEXT,
  listas_consultadas  TEXT[],
  total_coincidencias INTEGER DEFAULT 0,
  nivel_riesgo_global TEXT NOT NULL,  -- 'COINCIDENCIA','REVISAR','SIN_COINCIDENCIA'
  resultados          JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE consultas_listas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cl_select" ON consultas_listas FOR SELECT USING (tenant_id = get_user_tenant_id() OR is_superadmin());
CREATE POLICY "cl_insert" ON consultas_listas FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Log de sincronización
CREATE TABLE IF NOT EXISTS sync_listas_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente                TEXT NOT NULL,
  estado                TEXT NOT NULL,  -- 'ok','error','parcial'
  registros_procesados  INTEGER DEFAULT 0,
  registros_nuevos      INTEGER DEFAULT 0,
  mensaje               TEXT,
  ejecutado_en          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sync_listas_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sl_select_admin" ON sync_listas_log FOR SELECT USING (is_superadmin());

-- 5. RLS en listas_sanciones
ALTER TABLE listas_sanciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ls_select_auth" ON listas_sanciones FOR SELECT USING (auth.uid() IS NOT NULL);

-- 6. Función de búsqueda con similitud (pg_trgm)
CREATE OR REPLACE FUNCTION buscar_en_listas(
  p_nombre          TEXT,
  p_identificacion  TEXT    DEFAULT NULL,
  p_pais            TEXT    DEFAULT NULL,
  p_limite          INTEGER DEFAULT 50
)
RETURNS TABLE (
  id               UUID,
  fuente           TEXT,
  tipo_lista       TEXT,
  nombre_completo  TEXT,
  aliases          TEXT[],
  tipo_entidad     TEXT,
  fecha_nacimiento TEXT,
  paises           TEXT[],
  identificaciones JSONB,
  programa         TEXT,
  motivo           TEXT,
  nivel_riesgo     TEXT,
  referencia_id    TEXT,
  similitud        FLOAT4
) AS $$
DECLARE
  nombre_norm TEXT;
BEGIN
  nombre_norm := lower(unaccent(trim(p_nombre)));

  RETURN QUERY
  SELECT
    ls.id, ls.fuente, ls.tipo_lista, ls.nombre_completo,
    ls.aliases, ls.tipo_entidad, ls.fecha_nacimiento, ls.paises,
    ls.identificaciones, ls.programa, ls.motivo, ls.nivel_riesgo,
    ls.referencia_id,
    GREATEST(
      similarity(lower(unaccent(ls.nombre_completo)), nombre_norm),
      COALESCE((
        SELECT MAX(similarity(lower(unaccent(a)), nombre_norm))
        FROM unnest(ls.aliases) a
      ), 0.0)
    )::FLOAT4 AS similitud
  FROM listas_sanciones ls
  WHERE
    ls.activo = TRUE
    AND (
      -- Coincidencia parcial en nombre
      lower(unaccent(ls.nombre_completo)) ILIKE '%' || nombre_norm || '%'
      -- Similitud trigrama (fuzzy)
      OR lower(unaccent(ls.nombre_completo)) % nombre_norm
      -- Alias parcial
      OR EXISTS (
        SELECT 1 FROM unnest(ls.aliases) a
        WHERE lower(unaccent(a)) ILIKE '%' || nombre_norm || '%'
      )
      -- Identificación exacta
      OR (
        p_identificacion IS NOT NULL
        AND ls.identificaciones::text ILIKE '%' || p_identificacion || '%'
      )
    )
    -- Filtro por país (si se especifica)
    AND (
      p_pais IS NULL
      OR p_pais = ANY(ls.paises)
      OR cardinality(ls.paises) = 0
    )
  ORDER BY similitud DESC, ls.fuente
  LIMIT p_limite;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Metadata de las listas (para mostrar estado de sincronización)
CREATE TABLE IF NOT EXISTS listas_metadata (
  fuente              TEXT PRIMARY KEY,
  nombre_display      TEXT NOT NULL,
  descripcion         TEXT,
  url_fuente          TEXT,
  ultima_sync         TIMESTAMPTZ,
  total_registros     INTEGER DEFAULT 0,
  activa              BOOLEAN DEFAULT TRUE
);

INSERT INTO listas_metadata (fuente, nombre_display, descripcion, url_fuente) VALUES
  ('OFAC_SDN',   'OFAC SDN List',              'Specially Designated Nationals — US Treasury',          'https://www.treasury.gov/ofac/downloads/'),
  ('OFAC_CONS',  'OFAC Consolidated',           'Lista consolidada de sanciones — US Treasury',          'https://www.treasury.gov/ofac/downloads/'),
  ('ONU',        'ONU Consejo de Seguridad',    'Lista consolidada sanciones — Naciones Unidas',         'https://scsanctions.un.org/'),
  ('UK_OFSI',    'UK OFSI',                     'Financial Sanctions — HM Treasury Reino Unido',         'https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets'),
  ('INTERPOL',   'INTERPOL Circulares Rojas',   'Personas buscadas — INTERPOL',                          'https://www.interpol.int/How-we-work/Notices/Red-Notices'),
  ('GAFI_NEGRO', 'GAFI Lista Negra',            'Jurisdicciones bajo mayor vigilancia — FATF/GAFI',      'https://www.fatf-gafi.org/'),
  ('GAFI_GRIS',  'GAFI Lista Gris',             'Jurisdicciones bajo seguimiento — FATF/GAFI',           'https://www.fatf-gafi.org/'),
  ('GAFILAT',    'GAFILAT Riesgo Regional',     'Jurisdicciones de riesgo — GAFILAT LATAM',              'https://www.gafilat.org/')
ON CONFLICT (fuente) DO NOTHING;

ALTER TABLE listas_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lm_select_auth" ON listas_metadata FOR SELECT USING (auth.uid() IS NOT NULL);
