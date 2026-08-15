-- ============================================================
-- Fase 2 — Campos de calificación de riesgo en la ficha del cliente
-- App: Cumplimiento · Tabla: clientes
-- Cada columna guarda el VALOR DE RIESGO elegido (0.5 = menor … 3 = mayor),
-- alineado con las opciones de la metodología. Todas son opcionales (NULL).
-- Aplicar en el SQL Editor del proyecto de Cumplimiento.
-- ============================================================

ALTER TABLE public.clientes
  -- Comunes (persona física y jurídica)
  ADD COLUMN IF NOT EXISTS manejo_efectivo        numeric,  -- efectivo
  ADD COLUMN IF NOT EXISTS opera_transfronterizo  numeric,  -- transfronterizo (geo)
  -- Persona física
  ADD COLUMN IF NOT EXISTS situacion_laboral      numeric,  -- como_labor (canales)
  ADD COLUMN IF NOT EXISTS cant_lugares           numeric,  -- cant_lugares (canales)
  -- Persona jurídica
  ADD COLUMN IF NOT EXISTS niveles_societarios    numeric,  -- struct_acc (cliente)
  ADD COLUMN IF NOT EXISTS cant_personal          numeric,  -- struct_admin (cliente)
  ADD COLUMN IF NOT EXISTS opera_internacional    numeric,  -- op_internacional (geo)
  ADD COLUMN IF NOT EXISTS posicion_mercado       numeric,  -- posicion_mkt (productos)
  ADD COLUMN IF NOT EXISTS estructura_ventas      numeric,  -- struct_ventas (productos)
  ADD COLUMN IF NOT EXISTS cant_sucursales        numeric,  -- cant_sucursales (canales)
  ADD COLUMN IF NOT EXISTS tipo_vendedor          numeric;  -- tipo_vendedor (canales)

-- Refrescar el esquema expuesto por PostgREST
NOTIFY pgrst, 'reload schema';
