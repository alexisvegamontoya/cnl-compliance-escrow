-- ¿Cuántos clientes hay en total?
SELECT COUNT(*) AS total_clientes FROM clientes;

-- ¿Cuáles son, con su tenant y estado activo?
SELECT
  c.id,
  c.nombre_cliente,
  c.nombre_empresa,
  c.numero_identificacion,
  c.activo,
  c.tenant_id,
  t.nombre AS nombre_tenant
FROM clientes c
LEFT JOIN tenants t ON t.id = c.tenant_id
ORDER BY c.creado_en DESC
LIMIT 20;
