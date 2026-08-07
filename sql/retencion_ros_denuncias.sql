-- ============================================================
-- Retencion de ROS y denuncias al eliminar un sujeto obligado
--
-- eliminar_sujeto_obligado() borra todo lo que cuelga del sujeto obligado,
-- incluidos los reportes de operaciones sospechosas y las denuncias. El
-- respaldo en Excel que descarga la app NO es una garantia de conservacion:
-- es un archivo en la carpeta de descargas de quien apreto el boton.
--
-- Estos dos registros tienen valor legal y plazo de retencion propio, asi que
-- sobreviven al sujeto obligado. Se copian a tablas de archivo que NO tienen
-- llave foranea a tenants, justamente porque el sujeto obligado ya no va a
-- existir, y guardan su nombre y cedula para que el historial se pueda leer.
--
-- La fila se guarda completa en jsonb en vez de columna por columna: asi el
-- archivo no se rompe si manana reportes_ros o denuncias cambian de columnas.
--
-- CORRER DESPUES de sql/eliminar_sujeto_obligado.sql
-- EJECUTAR en Supabase -> SQL Editor -> New query -> Run
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASO 1 — Tablas de archivo
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reportes_ros_archivo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid,          -- sin REFERENCES: el sujeto obligado ya no existe
  tenant_nombre    text NOT NULL,
  tenant_cedula    text,
  archivado_en     timestamptz NOT NULL DEFAULT NOW(),
  archivado_por    uuid,
  datos            jsonb NOT NULL,
  nombre_reportado text GENERATED ALWAYS AS (datos ->> 'nombre_reportado') STORED,
  fecha_elaboracion text GENERATED ALWAYS AS (datos ->> 'fecha_elaboracion') STORED
);

CREATE TABLE IF NOT EXISTS denuncias_archivo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,
  tenant_nombre text NOT NULL,
  tenant_cedula text,
  archivado_en  timestamptz NOT NULL DEFAULT NOW(),
  archivado_por uuid,
  datos         jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ros_archivo_tenant       ON reportes_ros_archivo(tenant_id);
CREATE INDEX IF NOT EXISTS idx_denuncias_archivo_tenant ON denuncias_archivo(tenant_id);


-- ────────────────────────────────────────────────────────────
-- PASO 2 — El archivo es de solo lectura
--
-- Solo hay politica de SELECT, y solo para superadmin. Al no existir politica
-- de UPDATE ni de DELETE, nadie puede alterar el archivo desde la API por mas
-- permisos que tenga. Las filas entran unicamente por
-- eliminar_sujeto_obligado(), que es SECURITY DEFINER y no pasa por RLS.
-- ────────────────────────────────────────────────────────────
ALTER TABLE reportes_ros_archivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE denuncias_archivo    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ros_archivo_lectura"       ON reportes_ros_archivo;
DROP POLICY IF EXISTS "denuncias_archivo_lectura" ON denuncias_archivo;

CREATE POLICY "ros_archivo_lectura" ON reportes_ros_archivo
  FOR SELECT TO authenticated USING (es_superadmin());

CREATE POLICY "denuncias_archivo_lectura" ON denuncias_archivo
  FOR SELECT TO authenticated USING (es_superadmin());


-- ────────────────────────────────────────────────────────────
-- PASO 3 — Archivar antes de borrar
-- Reemplaza la funcion de sql/eliminar_sujeto_obligado.sql. Lo unico que
-- cambia es el bloque de archivado; el resto es identico.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION eliminar_sujeto_obligado(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          record;
  n          bigint;
  clave      text;
  borrados   jsonb := '{}'::jsonb;
  archivados jsonb := '{}'::jsonb;
  pasada     int;
  pendientes int;
  nombre_t   text;
  cedula_t   text;
  usuarios   bigint;
BEGIN
  IF NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo un superadministrador puede eliminar un sujeto obligado.';
  END IF;

  SELECT nombre, cedula_juridica INTO nombre_t, cedula_t
    FROM tenants WHERE id = p_tenant;
  IF nombre_t IS NULL THEN
    RAISE EXCEPTION 'Ese sujeto obligado ya no existe.';
  END IF;

  SELECT count(*) INTO usuarios FROM user_profiles WHERE tenant_id = p_tenant;
  IF usuarios > 0 THEN
    RAISE EXCEPTION
      'No se puede eliminar "%": hay % usuario(s) cuyo perfil apunta a este sujeto obligado. Reasignelos desde Usuarios y vuelva a intentarlo.',
      nombre_t, usuarios;
  END IF;

  -- ── Retencion: estos dos sobreviven al sujeto obligado ──
  INSERT INTO reportes_ros_archivo (tenant_id, tenant_nombre, tenant_cedula, archivado_por, datos)
  SELECT p_tenant, nombre_t, cedula_t, auth.uid(), to_jsonb(x)
    FROM reportes_ros x WHERE x.tenant_id = p_tenant;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN archivados := archivados || jsonb_build_object('reportes_ros', n); END IF;

  INSERT INTO denuncias_archivo (tenant_id, tenant_nombre, tenant_cedula, archivado_por, datos)
  SELECT p_tenant, nombre_t, cedula_t, auth.uid(), to_jsonb(x)
    FROM denuncias x WHERE x.tenant_id = p_tenant;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN archivados := archivados || jsonb_build_object('denuncias', n); END IF;

  -- Varias pasadas: una tabla que falla por depender de otra se reintenta
  -- cuando esa otra ya quedo vacia. Evita tener que conocer el orden del
  -- grafo de llaves foraneas.
  FOR pasada IN 1..8 LOOP
    pendientes := 0;

    FOR r IN
      SELECT c.table_schema AS esquema, c.table_name AS tabla, c.column_name AS col
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name   = c.table_name
         AND t.table_type   = 'BASE TABLE'
       WHERE ((c.table_schema = 'public'       AND c.column_name = 'tenant_id')
          OR  (c.table_schema = 'capacitacion' AND c.column_name = 'sujeto_obligado_id'))
         AND NOT (c.table_schema = 'public'
                  AND c.table_name IN ('tenants', 'user_profiles',
                                       'reportes_ros_archivo', 'denuncias_archivo'))
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I.%I WHERE %I = $1', r.esquema, r.tabla, r.col)
          USING p_tenant;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          clave    := r.esquema || '.' || r.tabla;
          borrados := jsonb_set(borrados, ARRAY[clave],
                        to_jsonb(coalesce((borrados ->> clave)::bigint, 0) + n));
        END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        pendientes := pendientes + 1;
      END;
    END LOOP;

    EXIT WHEN pendientes = 0;
  END LOOP;

  BEGIN
    DELETE FROM tenants WHERE id = p_tenant;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'No se pudo eliminar "%": quedan registros que dependen de el. Detalle: %',
      nombre_t, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'sujeto_obligado', nombre_t,
    'borrado',         borrados,
    'archivado',       archivados);
END $$;

REVOKE ALL  ON FUNCTION eliminar_sujeto_obligado(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eliminar_sujeto_obligado(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- PASO 4 — Verificacion
-- ────────────────────────────────────────────────────────────
SELECT 'reportes_ros_archivo' AS tabla, count(*) AS filas FROM reportes_ros_archivo
UNION ALL
SELECT 'denuncias_archivo', count(*) FROM denuncias_archivo;

-- El archivo tiene politica de SELECT y ninguna de UPDATE/DELETE:
-- es de solo lectura incluso para un superadministrador.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('reportes_ros_archivo', 'denuncias_archivo')
ORDER BY tablename, cmd;
