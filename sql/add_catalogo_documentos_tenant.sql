-- ══════════════════════════════════════════════════════════════════════════════
-- Catálogo de documentos configurable POR SUJETO OBLIGADO
--
-- El catálogo estándar (Acuerdo SUGEF 13-19) vive en el código
-- (src/lib/checklistDocumental.js). Esta tabla guarda ÚNICAMENTE las
-- personalizaciones de cada sujeto obligado sobre ese estándar:
--
--   · renombrar un documento estándar        → label
--   · volverlo obligatorio / opcional        → required
--   · excluirlo del checklist                → activo = false
--   · agregar requisitos propios             → es_estandar = false + label
--
-- Un sujeto obligado sin filas usa el catálogo estándar tal cual.
-- Los campos NULL heredan el valor del estándar, de modo que una actualización
-- normativa en el catálogo base se propaga sola a quienes no lo personalizaron.
--
-- Los estados marcados por cliente siguen en clientes.checklist_documental,
-- indexados por doc_id — por eso el doc_id NUNCA cambia al renombrar.
--
-- Ejecutar en Supabase → SQL Editor → Run   (idempotente)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS catalogo_documentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id         text NOT NULL,
  grupo          text NOT NULL DEFAULT 'base',
  label          text,
  required       boolean,
  activo         boolean NOT NULL DEFAULT TRUE,
  ayuda          text,
  es_estandar    boolean NOT NULL DEFAULT FALSE,
  orden          integer,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT catalogo_documentos_unico   UNIQUE (tenant_id, doc_id),
  CONSTRAINT catalogo_documentos_grupo   CHECK (grupo IN ('base', 'pj', 'pep')),
  CONSTRAINT catalogo_documentos_docid   CHECK (doc_id ~ '^[a-z0-9_]{2,60}$'),
  CONSTRAINT catalogo_documentos_label   CHECK (es_estandar OR (label IS NOT NULL AND btrim(label) <> ''))
);

COMMENT ON TABLE catalogo_documentos IS
  'Personalización del checklist documental por sujeto obligado. Sin filas = catálogo estándar SUGEF 13-19.';
COMMENT ON COLUMN catalogo_documentos.doc_id IS
  'Identificador estable del documento. Es la clave usada en clientes.checklist_documental — no debe cambiarse al renombrar.';
COMMENT ON COLUMN catalogo_documentos.label IS
  'Nombre personalizado. NULL = se hereda el nombre del catálogo estándar.';
COMMENT ON COLUMN catalogo_documentos.required IS
  'TRUE obligatorio / FALSE opcional / NULL = se hereda del catálogo estándar.';
COMMENT ON COLUMN catalogo_documentos.activo IS
  'FALSE excluye el documento del checklist y de la calificación de cumplimiento del sujeto obligado.';
COMMENT ON COLUMN catalogo_documentos.es_estandar IS
  'TRUE si el doc_id pertenece al catálogo estándar (la fila es un ajuste); FALSE si es un requisito propio del sujeto obligado.';
COMMENT ON COLUMN catalogo_documentos.grupo IS
  'base = todos los clientes · pj = persona jurídica · pep = cliente PEP';

CREATE INDEX IF NOT EXISTS idx_catalogo_documentos_tenant
  ON catalogo_documentos (tenant_id);

-- ── actualizado_en automático ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogo_documentos_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_catalogo_documentos_touch ON catalogo_documentos;
CREATE TRIGGER trg_catalogo_documentos_touch
  BEFORE UPDATE ON catalogo_documentos
  FOR EACH ROW EXECUTE FUNCTION catalogo_documentos_touch();

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS — mismo modelo que `clientes` (ver sql/014_rls_por_membresias.sql)
-- LECTURA: todo miembro del sujeto obligado — el catálogo se necesita para
--          mostrar el checklist y calcular el cumplimiento de cada cliente.
-- ESCRITURA: SOLO administradores (superadmin / admin_tenant). Cambiar el
--          catálogo mueve la calificación de cumplimiento de TODA la cartera,
--          así que la restricción vive aquí y no solo en la interfaz.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ¿El usuario actual administra este sujeto obligado? ──────────────────────
-- Equivale al `isAdmin` de src/lib/AuthContext.jsx: superadmin global, rol
-- admin_tenant en la membresía, o el fallback legacy de user_profiles.tenant_id.
CREATE OR REPLACE FUNCTION administra_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT es_superadmin()
      OR EXISTS (
           SELECT 1 FROM user_tenant_memberships
           WHERE user_id  = auth.uid()
             AND tenant_id = p_tenant_id
             AND activo    = TRUE
             AND rol       = 'admin_tenant'
         )
      OR EXISTS (
           SELECT 1 FROM user_profiles
           WHERE id        = auth.uid()
             AND tenant_id = p_tenant_id
             AND rol       = 'admin_tenant'
         )
$$;

ALTER TABLE catalogo_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catdoc_superadmin_all" ON catalogo_documentos;
DROP POLICY IF EXISTS "catdoc_tenant_select"  ON catalogo_documentos;
DROP POLICY IF EXISTS "catdoc_tenant_insert"  ON catalogo_documentos;
DROP POLICY IF EXISTS "catdoc_tenant_update"  ON catalogo_documentos;
DROP POLICY IF EXISTS "catdoc_tenant_delete"  ON catalogo_documentos;
DROP POLICY IF EXISTS "catdoc_admin_insert"   ON catalogo_documentos;
DROP POLICY IF EXISTS "catdoc_admin_update"   ON catalogo_documentos;
DROP POLICY IF EXISTS "catdoc_admin_delete"   ON catalogo_documentos;

CREATE POLICY "catdoc_superadmin_all" ON catalogo_documentos
  FOR ALL TO authenticated
  USING (es_superadmin()) WITH CHECK (es_superadmin());

-- Lectura: cualquier miembro del sujeto obligado
CREATE POLICY "catdoc_tenant_select" ON catalogo_documentos
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()));

-- Escritura: solo quien administra ese sujeto obligado
CREATE POLICY "catdoc_admin_insert" ON catalogo_documentos
  FOR INSERT TO authenticated
  WITH CHECK (administra_tenant(tenant_id));

CREATE POLICY "catdoc_admin_update" ON catalogo_documentos
  FOR UPDATE TO authenticated
  USING (administra_tenant(tenant_id))
  WITH CHECK (administra_tenant(tenant_id));

CREATE POLICY "catdoc_admin_delete" ON catalogo_documentos
  FOR DELETE TO authenticated
  USING (administra_tenant(tenant_id));

-- ══════════════════════════════════════════════════════════════════════════════
-- GUARDADO ATÓMICO DEL CATÁLOGO
--
-- El editor manda el catálogo completo del sujeto obligado y esta función lo
-- reemplaza en UNA transacción: borra las personalizaciones que ya no difieren
-- del estándar e inserta/actualiza las que sí. Hacerlo en dos llamadas desde el
-- cliente permitía que el DELETE pasara y el UPSERT fallara, dejando al sujeto
-- obligado sin sus personalizaciones.
--
-- SECURITY INVOKER (el default): la RLS de arriba sigue aplicando. La
-- comprobación explícita solo sirve para devolver un error legible en vez de
-- un borrado de 0 filas.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION guardar_catalogo_documentos(p_tenant_id uuid, p_filas jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT administra_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'No tiene permiso para editar el catálogo de documentos de este sujeto obligado'
      USING ERRCODE = '42501';
  END IF;

  -- Lo que ya no viene en el catálogo vuelve a heredar del estándar
  DELETE FROM catalogo_documentos c
  WHERE c.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS f
      WHERE f ->> 'doc_id' = c.doc_id
    );

  INSERT INTO catalogo_documentos
    (tenant_id, doc_id, grupo, label, required, activo, ayuda, es_estandar, orden)
  SELECT
    p_tenant_id,
    f ->> 'doc_id',
    COALESCE(f ->> 'grupo', 'base'),
    f ->> 'label',                                   -- NULL = hereda del estándar
    (f ->> 'required')::boolean,                     -- NULL = hereda del estándar
    COALESCE((f ->> 'activo')::boolean, TRUE),
    NULLIF(btrim(COALESCE(f ->> 'ayuda', '')), ''),
    COALESCE((f ->> 'es_estandar')::boolean, FALSE),
    (f ->> 'orden')::integer
  FROM jsonb_array_elements(COALESCE(p_filas, '[]'::jsonb)) AS f
  ON CONFLICT (tenant_id, doc_id) DO UPDATE SET
    grupo       = EXCLUDED.grupo,
    label       = EXCLUDED.label,
    required    = EXCLUDED.required,
    activo      = EXCLUDED.activo,
    ayuda       = EXCLUDED.ayuda,
    es_estandar = EXCLUDED.es_estandar,
    orden       = EXCLUDED.orden;
END $$;

GRANT EXECUTE ON FUNCTION administra_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION guardar_catalogo_documentos(uuid, jsonb) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════════════════
-- Personalizaciones guardadas por sujeto obligado:
-- SELECT t.nombre, c.doc_id, c.grupo, c.label, c.required, c.activo, c.es_estandar
-- FROM catalogo_documentos c
-- JOIN tenants t ON t.id = c.tenant_id
-- ORDER BY t.nombre, c.grupo, c.orden NULLS LAST, c.doc_id;

-- Quién puede EDITAR el catálogo de cada sujeto obligado (ejecutar como el
-- usuario a verificar; debe dar TRUE solo para superadmin / admin_tenant):
-- SELECT t.nombre, administra_tenant(t.id) AS puede_editar FROM tenants t ORDER BY t.nombre;
