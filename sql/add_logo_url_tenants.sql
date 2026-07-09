-- Agregar columna logo_url a la tabla tenants
-- Ejecutar en Supabase SQL Editor

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Crear bucket de almacenamiento para logos (si no existe)
-- Ejecutar en Supabase Storage: crear bucket "logos-tenants" con acceso público

-- Política de acceso para el bucket logos-tenants:
-- INSERT: solo roles autenticados con rol superadmin
-- SELECT: público (para mostrar el logo en documentos impresos)
-- UPDATE/DELETE: solo superadmin
