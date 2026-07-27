-- ══════════════════════════════════════════════════════════════════════════════
-- Checklist de documentación presentada por el cliente
-- (compartido entre Gestión de Clientes, Debida Diligencia y carga masiva)
-- Ejecutar en Supabase → SQL Editor → Run   (idempotente)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS checklist_documental      JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checklist_actualizado_en  DATE;

COMMENT ON COLUMN clientes.checklist_documental IS
  'Checklist de documentos presentados (SUGEF 13-19). Formato: {"id_vigente":{"estado":"disponible","nota":""}, ...}. Estados: pendiente | disponible | no_disponible | no_aplica';
COMMENT ON COLUMN clientes.checklist_actualizado_en IS
  'Fecha de la última actualización del checklist documental (desde el perfil del cliente, la debida diligencia o la carga masiva)';

-- Índice GIN para poder filtrar/reportar por estado de documentos
CREATE INDEX IF NOT EXISTS idx_clientes_checklist_documental
  ON clientes USING GIN (checklist_documental);

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT id, nombre_empresa, nombre_cliente, checklist_actualizado_en, checklist_documental
-- FROM clientes
-- WHERE checklist_documental <> '{}'::jsonb
-- LIMIT 10;
