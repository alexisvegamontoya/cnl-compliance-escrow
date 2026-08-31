-- ============================================================
-- Expediente documental del cliente: adjuntos ligados directamente al cliente
-- (documentos recibidos por el portal KYC + informes generados: listas,
-- calificación de riesgo, debida diligencia). Los archivos viven en el bucket
-- de Storage `kyc`, bajo la ruta <tenant_id>/clientes/<cliente_id>/...
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes_documentos (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  cliente_id     UUID REFERENCES clientes(id) ON DELETE CASCADE NOT NULL,
  tipo           TEXT NOT NULL,          -- informe_listas | informe_riesgo | informe_dd | kyc_firmado | doc_portal | otro
  doc_id         TEXT,                   -- id del checklist si aplica (ej. kyc_id_vigente)
  nombre         TEXT NOT NULL,          -- nombre visible del documento
  archivo_path   TEXT NOT NULL,          -- ruta dentro del bucket `kyc`
  nombre_archivo TEXT,
  origen         TEXT DEFAULT 'kyc',     -- kyc | manual | sistema
  solicitud_id   UUID,                   -- solicitud KYC de origen (si aplica)
  creado_en      TIMESTAMPTZ DEFAULT NOW(),
  creado_por     UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_cli_docs_cliente ON clientes_documentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cli_docs_tenant  ON clientes_documentos(tenant_id);

ALTER TABLE clientes_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cd_superadmin"    ON clientes_documentos;
DROP POLICY IF EXISTS "cd_tenant_select" ON clientes_documentos;
DROP POLICY IF EXISTS "cd_tenant_insert" ON clientes_documentos;
DROP POLICY IF EXISTS "cd_tenant_update" ON clientes_documentos;
DROP POLICY IF EXISTS "cd_tenant_delete" ON clientes_documentos;

CREATE POLICY "cd_superadmin"    ON clientes_documentos USING (es_superadmin());
CREATE POLICY "cd_tenant_select" ON clientes_documentos FOR SELECT USING (tenant_id IN (SELECT mis_tenant_ids()));
CREATE POLICY "cd_tenant_insert" ON clientes_documentos FOR INSERT WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));
CREATE POLICY "cd_tenant_update" ON clientes_documentos FOR UPDATE USING (tenant_id IN (SELECT mis_tenant_ids()));
CREATE POLICY "cd_tenant_delete" ON clientes_documentos FOR DELETE USING (tenant_id IN (SELECT mis_tenant_ids()));

-- Formalizar columnas de inscripción (venían por migración manual fuera de repo).
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS ccss_estado  TEXT,   -- al_dia | morosidad | arreglo | no_inscrito
  ADD COLUMN IF NOT EXISTS sugef_estado TEXT,   -- no | 15 | 15bis | 15ter | pendiente
  ADD COLUMN IF NOT EXISTS aparece_en_listas BOOLEAN,
  ADD COLUMN IF NOT EXISTS estado_listas TEXT,
  ADD COLUMN IF NOT EXISTS fecha_consulta_listas DATE,
  ADD COLUMN IF NOT EXISTS calificacion_riesgo TEXT;

notify pgrst, 'reload schema';
