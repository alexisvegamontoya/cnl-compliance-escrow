-- =====================================================
-- Política de BORRADO para informes_generados
-- =====================================================
-- Contexto (2026-08-11): el Informe de Labores permite depurar copias
-- duplicadas del historial (planes de trabajo/capacitación que se insertan
-- cada vez que se generan). Hasta ahora solo el superadmin podía borrar
-- (política inf_superadmin_all). Se agrega una política acotada para que el
-- Oficial de Cumplimiento pueda eliminar duplicados de SU PROPIO tenant,
-- espejo de inf_tenant_insert / inf_tenant_select.

CREATE POLICY inf_tenant_delete ON public.informes_generados
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()));
