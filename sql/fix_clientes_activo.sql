-- Normalizar clientes existentes que tienen activo = NULL
-- (registros creados antes del módulo de Gestión de Clientes)
UPDATE clientes SET activo = true WHERE activo IS NULL;

-- También asegurarse que tipo_persona tenga valor por defecto
UPDATE clientes SET tipo_persona = 'fisica' WHERE tipo_persona IS NULL OR tipo_persona = '';
