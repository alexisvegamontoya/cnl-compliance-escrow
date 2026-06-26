-- =====================================================
-- FASE 2: Cuestionarios + Auditoría
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Bucket de storage para cuestionarios (ejecutar en Storage o dejar que la app lo use)
-- En Supabase Dashboard > Storage > New Bucket > nombre: "cuestionarios" > Public: false

-- 2. Tabla de cuestionarios
CREATE TABLE IF NOT EXISTS cuestionarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  titulo              TEXT NOT NULL,
  descripcion         TEXT,
  fecha_limite        DATE,
  archivo_plantilla   TEXT,  -- path en Supabase Storage
  nombre_archivo      TEXT,  -- nombre original del archivo
  estado              TEXT DEFAULT 'pendiente',  -- 'pendiente' | 'en_proceso' | 'completado' | 'vencido'
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cuestionarios ENABLE ROW LEVEL SECURITY;

-- Superadmin puede todo
CREATE POLICY "cuest_superadmin_all" ON cuestionarios
  FOR ALL USING (is_superadmin());

-- Usuarios ven solo los de su tenant
CREATE POLICY "cuest_select_tenant" ON cuestionarios
  FOR SELECT USING (tenant_id = get_user_tenant_id());

-- Admin del tenant puede ver los suyos
CREATE POLICY "cuest_admin_select" ON cuestionarios
  FOR SELECT USING (
    tenant_id = get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND rol IN ('admin','superadmin')
    )
  );

-- 3. Tabla de respuestas a cuestionarios
CREATE TABLE IF NOT EXISTS respuestas_cuestionario (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuestionario_id   UUID REFERENCES cuestionarios(id) ON DELETE CASCADE NOT NULL,
  tenant_id         UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id           UUID REFERENCES auth.users(id) NOT NULL,
  archivo_respuesta TEXT,  -- path en Supabase Storage
  nombre_archivo    TEXT,
  notas             TEXT,
  estado            TEXT DEFAULT 'enviado',  -- 'enviado' | 'revisado' | 'aprobado' | 'rechazado'
  submitted_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE respuestas_cuestionario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resp_superadmin_all" ON respuestas_cuestionario
  FOR ALL USING (is_superadmin());

CREATE POLICY "resp_select_own_tenant" ON respuestas_cuestionario
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "resp_insert_own" ON respuestas_cuestionario
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND user_id = auth.uid()
  );

-- 4. Tabla de auditoría
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      TEXT,
  accion          TEXT NOT NULL,    -- 'crear' | 'editar' | 'eliminar' | 'exportar' | 'login' | etc
  tabla           TEXT,             -- 'clientes' | 'transacciones' | etc
  registro_id     TEXT,
  descripcion     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_superadmin_all" ON audit_log
  FOR ALL USING (is_superadmin());

CREATE POLICY "audit_admin_select" ON audit_log
  FOR SELECT USING (
    tenant_id = get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND rol IN ('admin','superadmin')
    )
  );

CREATE POLICY "audit_insert_auth" ON audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_date ON audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id, created_at DESC);
