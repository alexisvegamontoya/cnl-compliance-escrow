-- ══════════════════════════════════════════════════════════════════════════════
-- TABLA: alertas_noticias
-- Almacena alertas cuando una noticia menciona a un cliente registrado
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alertas_noticias (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feed_item_id     UUID REFERENCES feed_items(id) ON DELETE CASCADE,
  tenant_id        UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  cliente_id       UUID,                    -- referencia a clientes.id (puede ser null si no hay match exacto)
  nombre_mencionado TEXT NOT NULL,           -- nombre tal como aparece en la noticia
  nombre_cliente    TEXT NOT NULL,           -- nombre del cliente en el sistema
  similitud         NUMERIC(4,3) DEFAULT 0,  -- 0.0 a 1.0
  titulo_noticia    TEXT,
  url_noticia       TEXT,
  resumen_noticia   TEXT,
  urgencia_noticia  TEXT DEFAULT 'informativo',
  visto             BOOLEAN DEFAULT FALSE,
  visto_por         UUID REFERENCES auth.users(id),
  visto_en          TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_alertas_noticias_tenant ON alertas_noticias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alertas_noticias_visto  ON alertas_noticias(tenant_id, visto);
CREATE INDEX IF NOT EXISTS idx_alertas_noticias_feed   ON alertas_noticias(feed_item_id);

-- RLS
ALTER TABLE alertas_noticias ENABLE ROW LEVEL SECURITY;

-- Superadmin: acceso total
CREATE POLICY "alertas_noticias_superadmin" ON alertas_noticias
  USING (es_superadmin());

-- Usuarios regulares: ver solo sus tenants
CREATE POLICY "alertas_noticias_tenant_read" ON alertas_noticias
  FOR SELECT USING (tenant_id IN (SELECT mis_tenant_ids()));

-- Marcar como visto
CREATE POLICY "alertas_noticias_tenant_update" ON alertas_noticias
  FOR UPDATE USING (tenant_id IN (SELECT mis_tenant_ids()));

-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCIÓN: buscar_clientes_en_noticias
-- Extrae entidades de artículos recientes y las compara con la tabla clientes
-- ══════════════════════════════════════════════════════════════════════════════

-- Esta función se puede llamar desde el API o manualmente para re-procesar
-- No es necesaria si el matching se hace en el API de Node.js
