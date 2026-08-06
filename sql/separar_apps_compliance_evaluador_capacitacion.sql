-- ============================================================
-- Separar las tres apps que comparten el proyecto de Supabase
--
-- Hallazgo del 2026-08-06: cnl-compliance-app, cnl-evaluador-riesgos y
-- capacitacion-cnl apuntan las tres al MISMO proyecto
-- (akczzwsfggzcfqyytyho). No hay duplicacion de datos: es una sola base
-- vista desde tres aplicaciones.
--
-- El solapamiento es solo la capa de identidad:
--   tenants, user_profiles, user_tenant_memberships
-- Los datos de negocio (clientes, evaluaciones, estudiantes) ya estan
-- separados en tablas propias de cada app.
--
-- Situacion medida: 40 sujetos obligados en tenants
--   10 con datos de compliance (2 exclusivos + 8 compartidos)
--   27 exclusivos del evaluador de riesgos
--    3 sin datos en ninguna
--
-- Estrategia: un solo proyecto, separacion por aplicacion.
-- La credencial sigue siendo unica (un solo auth.users), pero el ACCESO
-- se habilita app por app: quien solo esta en Capacitacion no entra a
-- Compliance ni aparece en su lista de usuarios.
--
-- EJECUTAR en Supabase → SQL Editor → New query → Run
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASO 1 — Marcar a que app pertenece cada sujeto obligado
-- ────────────────────────────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS app_compliance   boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS app_evaluador    boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS app_capacitacion boolean NOT NULL DEFAULT FALSE;


-- ────────────────────────────────────────────────────────────
-- PASO 2 — Deducir las marcas de los datos que ya existen
-- Recorre las tablas propias de cada app y marca el tenant si tiene
-- registros. Salta sin error las tablas que no existan.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tablas_compliance text[] := ARRAY[
    'clientes','transacciones','denuncias','normativa','expedientes_dd',
    'reportes_ros','calificaciones_riesgo','catalogo_documentos','cuestionarios',
    'informes_generados','periodos_declarados','compliance_seguimiento',
    'consultas_listas','alertas_noticias','clientes_personas_relacionadas'
  ];
  tablas_evaluador text[] := ARRAY[
    'perfil_sujeto_obligado','evaluaciones','eval_controles','eval_normativa',
    'eval_plan_accion','eval_riesgo_inherente','acciones_plan',
    'cuestionarios_enviados','respuestas_evaluacion'
  ];
  tablas_capacitacion text[] := ARRAY[
    'estudiantes','anuncios','personal_cnl'
  ];
BEGIN
  FOREACH t IN ARRAY tablas_compliance LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=t AND column_name='tenant_id') THEN
      EXECUTE format(
        'UPDATE tenants SET app_compliance = TRUE
          WHERE id IN (SELECT DISTINCT tenant_id FROM %I WHERE tenant_id IS NOT NULL)', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY tablas_evaluador LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=t AND column_name='tenant_id') THEN
      EXECUTE format(
        'UPDATE tenants SET app_evaluador = TRUE
          WHERE id IN (SELECT DISTINCT tenant_id FROM %I WHERE tenant_id IS NOT NULL)', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY tablas_capacitacion LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=t AND column_name='tenant_id') THEN
      EXECUTE format(
        'UPDATE tenants SET app_capacitacion = TRUE
          WHERE id IN (SELECT DISTINCT tenant_id FROM %I WHERE tenant_id IS NOT NULL)', t);
    END IF;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────
-- PASO 3 — Habilitacion de usuarios por aplicacion
-- Una sola credencial, pero el acceso se concede app por app.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_app_access (
  user_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app        text    NOT NULL CHECK (app IN ('compliance','evaluador','capacitacion')),
  activo     boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, app)
);

CREATE INDEX IF NOT EXISTS idx_uaa_user ON user_app_access(user_id);

-- Cada usuario queda habilitado en las apps de los sujetos obligados
-- a los que ya pertenece.
INSERT INTO user_app_access (user_id, app)
SELECT DISTINCT m.user_id, 'compliance'
FROM user_tenant_memberships m
JOIN tenants t ON t.id = m.tenant_id
WHERE t.app_compliance
ON CONFLICT DO NOTHING;

INSERT INTO user_app_access (user_id, app)
SELECT DISTINCT m.user_id, 'evaluador'
FROM user_tenant_memberships m
JOIN tenants t ON t.id = m.tenant_id
WHERE t.app_evaluador
ON CONFLICT DO NOTHING;

INSERT INTO user_app_access (user_id, app)
SELECT DISTINCT m.user_id, 'capacitacion'
FROM user_tenant_memberships m
JOIN tenants t ON t.id = m.tenant_id
WHERE t.app_capacitacion
ON CONFLICT DO NOTHING;

-- Los superadministradores entran a las tres
INSERT INTO user_app_access (user_id, app)
SELECT up.id, a.app
FROM user_profiles up
CROSS JOIN (VALUES ('compliance'),('evaluador'),('capacitacion')) AS a(app)
WHERE up.rol = 'superadmin'
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- PASO 4 — Funcion auxiliar para las politicas RLS
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tiene_acceso_app(p_app text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_app_access
     WHERE user_id = auth.uid() AND app = p_app AND activo
  )
$$;

ALTER TABLE user_app_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uaa_superadmin_all" ON user_app_access;
DROP POLICY IF EXISTS "uaa_own_read"       ON user_app_access;

CREATE POLICY "uaa_superadmin_all" ON user_app_access
  FOR ALL TO authenticated
  USING (es_superadmin()) WITH CHECK (es_superadmin());

CREATE POLICY "uaa_own_read" ON user_app_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- PASO 5 — Verificacion
-- ────────────────────────────────────────────────────────────

-- Reparto de sujetos obligados por app
SELECT
  count(*)                                          AS total,
  count(*) FILTER (WHERE app_compliance)            AS compliance,
  count(*) FILTER (WHERE app_evaluador)             AS evaluador,
  count(*) FILTER (WHERE app_capacitacion)          AS capacitacion,
  count(*) FILTER (WHERE NOT app_compliance
                     AND NOT app_evaluador
                     AND NOT app_capacitacion)      AS sin_asignar
FROM tenants;

-- IMPORTANTE: revisar estos. No tienen datos en ninguna app, asi que
-- quedaron sin marcar y NO apareceran en ningun selector.
SELECT id, nombre, activo
FROM tenants
WHERE NOT app_compliance AND NOT app_evaluador AND NOT app_capacitacion
ORDER BY nombre;

-- Para asignarlos a mano, por ejemplo a compliance:
--   UPDATE tenants SET app_compliance = TRUE WHERE nombre = 'TEV';

-- Usuarios habilitados por app
SELECT app, count(*) AS usuarios
FROM user_app_access
WHERE activo
GROUP BY app
ORDER BY app;
