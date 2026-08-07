-- ============================================================
-- Corregir las marcas app_* de los sujetos obligados
--
-- Problema del 2026-08-07: en Cumplimiento no aparecian la mayoria de los
-- sujetos obligados y, al intentar crearlos de nuevo, la cedula juridica
-- chocaba con el registro que ya existia ("Ya existe un registro con esa
-- identificacion o dato unico"). Eso empujo a recrearlos con la cedula mal
-- escrita, que es como nacieron los duplicados.
--
-- Causa: separar_apps_compliance_evaluador_capacitacion.sql dedujo las
-- marcas de los datos existentes.
--
--   app_compliance   quedo TRUE solo en los que ya tenian datos de negocio
--                    en Cumplimiento (17 de 41). Pero Cumplimiento es el
--                    maestro del padron: un sujeto obligado recien dado de
--                    alta todavia no tiene datos y aun asi debe verse.
--
--   app_capacitacion quedo TRUE en NINGUNO (0 de 41). El PASO 2 buscaba una
--                    columna tenant_id en estudiantes/anuncios/personal_cnl,
--                    pero esas tablas viven en el esquema capacitacion y la
--                    columna se llama sujeto_obligado_id.
--
--   app_evaluador    quedo bien (35 de 41): se dedujo de perfil_sujeto_obligado,
--                    que si se crea al dar de alta en el Evaluador. No se toca.
--
-- EJECUTAR en Supabase -> SQL Editor -> New query -> Run
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASO 1 — Cumplimiento ve todo el padron
-- Es el maestro de sujetos obligados: no depende de tener datos.
-- ────────────────────────────────────────────────────────────
UPDATE tenants
   SET app_compliance = TRUE
 WHERE NOT app_compliance;


-- ────────────────────────────────────────────────────────────
-- PASO 2 — Capacitacion: deducir del esquema correcto
-- La relacion es capacitacion.<tabla>.sujeto_obligado_id, no tenant_id.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tablas_capacitacion text[] := ARRAY['estudiantes','capacitaciones'];
BEGIN
  FOREACH t IN ARRAY tablas_capacitacion LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='capacitacion' AND table_name=t
                  AND column_name='sujeto_obligado_id') THEN
      EXECUTE format(
        'UPDATE tenants SET app_capacitacion = TRUE
          WHERE id IN (SELECT DISTINCT sujeto_obligado_id FROM capacitacion.%I
                        WHERE sujeto_obligado_id IS NOT NULL)', t);
    END IF;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────
-- PASO 3 — Que las altas nuevas no repitan el problema
-- Un sujeto obligado creado desde cualquier app pertenece al padron de
-- Cumplimiento desde el primer dia.
-- ────────────────────────────────────────────────────────────
ALTER TABLE tenants
  ALTER COLUMN app_compliance SET DEFAULT TRUE;


-- ────────────────────────────────────────────────────────────
-- PASO 4 — Verificacion
-- ────────────────────────────────────────────────────────────
SELECT
  count(*)                                 AS total,
  count(*) FILTER (WHERE app_compliance)   AS compliance,
  count(*) FILTER (WHERE app_evaluador)    AS evaluador,
  count(*) FILTER (WHERE app_capacitacion) AS capacitacion
FROM tenants;
-- Esperado: total 41 | compliance 41 | evaluador 35 | capacitacion 3


-- Duplicados por cedula mal escrita, consecuencia de no poder ver el
-- registro existente. Revisar a mano antes de borrar o fusionar.
SELECT nombre, count(*) AS veces,
       string_agg(cedula_juridica || ' (' || id || ')', ' | ' ORDER BY created_at) AS registros
FROM tenants
GROUP BY nombre
HAVING count(*) > 1
ORDER BY nombre;
