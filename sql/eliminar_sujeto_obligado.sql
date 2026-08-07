-- ============================================================
-- Eliminar un sujeto obligado con todo lo que cuelga de el
--
-- Problema: el boton "Eliminar" de Sujetos Obligados hacia
-- DELETE FROM tenants desde el navegador. Eso falla con violacion de
-- llave foranea, porque hay 36 tablas con tenant_id y solo unas pocas
-- tienen ON DELETE CASCADE. Peor aun: borrar tabla por tabla desde el
-- cliente NO es atomico, asi que un fallo a media via destruye datos y
-- deja el sujeto obligado igual.
--
-- Esta base la comparten tres apps y el DDL del Evaluador de Riesgos no
-- esta en este repo, asi que la lista de tablas NO se puede escribir a
-- mano sin quedar desactualizada. Las funciones descubren las tablas
-- dependientes leyendo information_schema:
--   public.*        por columna tenant_id
--   capacitacion.*  por columna sujeto_obligado_id
--
-- Al correr dentro de una sola transaccion, o se borra todo o no se
-- borra nada.
--
-- EJECUTAR en Supabase -> SQL Editor -> New query -> Run
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- Que se va a borrar (para confirmar antes, sin borrar nada)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION contar_dependencias_sujeto_obligado(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r   record;
  n   bigint;
  res jsonb := '{}'::jsonb;
BEGIN
  IF NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo un superadministrador puede consultar esta informacion.';
  END IF;

  FOR r IN
    SELECT c.table_schema AS esquema, c.table_name AS tabla, c.column_name AS col
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
       AND t.table_type   = 'BASE TABLE'
     WHERE ((c.table_schema = 'public'       AND c.column_name = 'tenant_id')
        OR  (c.table_schema = 'capacitacion' AND c.column_name = 'sujeto_obligado_id'))
       AND NOT (c.table_schema = 'public' AND c.table_name = 'tenants')
     ORDER BY c.table_schema, c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1', r.esquema, r.tabla, r.col)
       INTO n USING p_tenant;
    IF n > 0 THEN
      res := res || jsonb_build_object(r.esquema || '.' || r.tabla, n);
    END IF;
  END LOOP;

  RETURN res;
END $$;


-- ────────────────────────────────────────────────────────────
-- El borrado
--
-- Las cuentas de usuario NUNCA se borran por arrastre: si algun perfil
-- apunta a este sujeto obligado, la funcion se niega y pide reasignarlos.
-- Perder una credencial por borrar un cliente seria un efecto colateral
-- inaceptable.
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
  pasada     int;
  pendientes int;
  nombre_t   text;
  usuarios   bigint;
BEGIN
  IF NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo un superadministrador puede eliminar un sujeto obligado.';
  END IF;

  SELECT nombre INTO nombre_t FROM tenants WHERE id = p_tenant;
  IF nombre_t IS NULL THEN
    RAISE EXCEPTION 'Ese sujeto obligado ya no existe.';
  END IF;

  SELECT count(*) INTO usuarios FROM user_profiles WHERE tenant_id = p_tenant;
  IF usuarios > 0 THEN
    RAISE EXCEPTION
      'No se puede eliminar "%": hay % usuario(s) cuyo perfil apunta a este sujeto obligado. Reasignelos desde Usuarios y vuelva a intentarlo.',
      nombre_t, usuarios;
  END IF;

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
                  AND c.table_name IN ('tenants', 'user_profiles'))
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

  RETURN jsonb_build_object('sujeto_obligado', nombre_t, 'borrado', borrados);
END $$;


-- ────────────────────────────────────────────────────────────
-- Permisos: solo usuarios autenticados, y adentro se exige superadmin
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION contar_dependencias_sujeto_obligado(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION eliminar_sujeto_obligado(uuid)            FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contar_dependencias_sujeto_obligado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION eliminar_sujeto_obligado(uuid)            TO authenticated;


-- ────────────────────────────────────────────────────────────
-- Verificacion (no borra nada)
-- Sustituya el uuid por el del sujeto obligado que quiera revisar.
-- ────────────────────────────────────────────────────────────
-- SELECT contar_dependencias_sujeto_obligado('8b5c721d-bb1d-4848-ab25-545588139494');
