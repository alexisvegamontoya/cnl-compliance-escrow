-- ============================================================
-- Agrega campos de fecha de gestiones de cumplimiento a clientes
-- Ejecutar en Supabase → SQL Editor → Run
-- ============================================================

-- Fechas de gestiones de cumplimiento por cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_calificacion_riesgo  DATE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_consulta_listas       DATE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_debida_diligencia     DATE;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
-- SELECT id, nombre_empresa, nombre_cliente,
--        fecha_calificacion_riesgo, fecha_consulta_listas, fecha_debida_diligencia
-- FROM clientes LIMIT 10;
