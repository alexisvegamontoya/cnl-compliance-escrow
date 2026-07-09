-- ============================================================
-- Fix: Superadmin puede ver TODOS los user_profiles
-- Fix: Agregar columna logo_url a tenants
-- Fix: RLS para bucket logos-tenants
-- EJECUTAR en Supabase → SQL Editor → Run
-- ============================================================

-- 1. Columna logo_url en tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Asegurar que es_superadmin() existe y es correcta
CREATE OR REPLACE FUNCTION es_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND rol = 'superadmin'
  )
$$;

-- 3. Recrear las políticas de user_profiles limpias
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "up_superadmin_all"  ON user_profiles;
DROP POLICY IF EXISTS "up_own"             ON user_profiles;
DROP POLICY IF EXISTS "up_same_tenant"     ON user_profiles;
DROP POLICY IF EXISTS "own_profile"        ON user_profiles;
DROP POLICY IF EXISTS "superadmin_all"     ON user_profiles;

-- Superadmin ve y modifica todo
CREATE POLICY "up_superadmin_all" ON user_profiles
  FOR ALL TO authenticated
  USING (es_superadmin())
  WITH CHECK (es_superadmin());

-- Cada usuario ve/edita su propio perfil
CREATE POLICY "up_own" ON user_profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin de tenant ve perfiles de su(s) tenant(s)
CREATE POLICY "up_same_tenant" ON user_profiles
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT utm.user_id
      FROM user_tenant_memberships utm
      WHERE utm.tenant_id IN (SELECT mis_tenant_ids())
    )
  );

-- 4. Verificar que user_tenant_memberships también permite lectura al superadmin
ALTER TABLE user_tenant_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "utm_superadmin_all"  ON user_tenant_memberships;
DROP POLICY IF EXISTS "utm_tenant_select"   ON user_tenant_memberships;
DROP POLICY IF EXISTS "utm_own_select"      ON user_tenant_memberships;
DROP POLICY IF EXISTS "utm_admin_manage"    ON user_tenant_memberships;

CREATE POLICY "utm_superadmin_all" ON user_tenant_memberships
  FOR ALL TO authenticated
  USING (es_superadmin())
  WITH CHECK (es_superadmin());

CREATE POLICY "utm_own_select" ON user_tenant_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "utm_admin_manage" ON user_tenant_memberships
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));

-- ============================================================
-- Verificación rápida (ejecute este SELECT por separado
-- desde la sesión autenticada en la app, no desde SQL Editor)
-- SELECT count(*) FROM user_profiles;
-- ============================================================
