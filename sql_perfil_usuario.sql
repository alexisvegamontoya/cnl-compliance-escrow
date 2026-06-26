-- =====================================================
-- MIGRACIÓN: Correo en user_profiles + tabla notificaciones
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Agregar columna email a user_profiles (si no existe)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS cargo TEXT;

-- 2. Poblar email desde auth.users para registros existentes
UPDATE user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
  AND up.email IS NULL;

-- 3. Tabla de notificaciones
CREATE TABLE IF NOT EXISTS notificaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  mensaje      TEXT,
  tipo         TEXT DEFAULT 'info',  -- 'info' | 'alerta' | 'exito' | 'error'
  leida        BOOLEAN DEFAULT FALSE,
  url_accion   TEXT,  -- ruta interna opcional (ej: /clientes)
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS para notificaciones
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo ven sus propias notificaciones
CREATE POLICY "notif_select_own" ON notificaciones
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_superadmin()
  );

-- Solo el sistema (service role) o superadmin pueden insertar
CREATE POLICY "notif_insert" ON notificaciones
  FOR INSERT WITH CHECK (
    is_superadmin()
    OR user_id = auth.uid()
  );

-- Marcar como leída: solo el propio usuario
CREATE POLICY "notif_update_own" ON notificaciones
  FOR UPDATE USING (user_id = auth.uid());

-- 5. Índice para consultas rápidas de no leídas por usuario
CREATE INDEX IF NOT EXISTS idx_notif_user_leida
  ON notificaciones (user_id, leida, created_at DESC);
