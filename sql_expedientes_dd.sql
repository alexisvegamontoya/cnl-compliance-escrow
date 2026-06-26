-- =====================================================
-- MÓDULO DEBIDA DILIGENCIA — Tabla expedientes_dd
-- Ejecutar en Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS expedientes_dd (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,
  tipo                  CHAR(1) NOT NULL CHECK (tipo IN ('F', 'J')),
  datos_cliente         JSONB NOT NULL DEFAULT '{}',
  participantes         JSONB NOT NULL DEFAULT '[]',
  resultados_listas     JSONB DEFAULT '{}',
  perfil_ia             TEXT,
  nivel_riesgo_ia       TEXT,
  nivel_riesgo_final    TEXT CHECK (nivel_riesgo_final IN ('bajo','medio','alto','muy_alto')),
  justificacion_manual  TEXT,
  checklist             JSONB DEFAULT '{}',
  estado                TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador','completado','archivado')),
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: cada tenant solo ve sus expedientes
ALTER TABLE expedientes_dd ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_tenant_select" ON expedientes_dd
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "dd_tenant_insert" ON expedientes_dd
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "dd_tenant_update" ON expedientes_dd
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_expedientes_dd_tenant    ON expedientes_dd (tenant_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_dd_created   ON expedientes_dd (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expedientes_dd_estado    ON expedientes_dd (estado);

-- Trigger: actualizar updated_at
CREATE OR REPLACE FUNCTION touch_expediente_dd()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expedientes_dd_updated ON expedientes_dd;
CREATE TRIGGER trg_expedientes_dd_updated
  BEFORE UPDATE ON expedientes_dd
  FOR EACH ROW EXECUTE FUNCTION touch_expediente_dd();
