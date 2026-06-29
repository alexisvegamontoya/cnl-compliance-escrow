-- ============================================================
-- Migración: RLS basada en user_tenant_memberships
--
-- Objetivo: Cada usuario solo puede ver/editar datos de los
-- sujetos obligados a los que pertenece (membresías activas).
-- El superadmin tiene acceso total.
--
-- EJECUTAR COMPLETO en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- FUNCIÓN AUXILIAR: tenant_ids del usuario actual
-- Evita repetir la subquery en cada policy
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mis_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Membresías activas (nuevo modelo)
  SELECT tenant_id FROM user_tenant_memberships
  WHERE user_id = auth.uid() AND activo = TRUE
  UNION
  -- Fallback legacy: tenant_id en user_profiles
  SELECT tenant_id FROM user_profiles
  WHERE id = auth.uid() AND tenant_id IS NOT NULL
$$;

-- ──────────────────────────────────────────────────────────────
-- FUNCIÓN AUXILIAR: ¿es superadmin el usuario actual?
-- ──────────────────────────────────────────────────────────────
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


-- ============================================================
-- TABLA: transacciones
-- ============================================================
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation"       ON transacciones;
DROP POLICY IF EXISTS "superadmin_all"         ON transacciones;
DROP POLICY IF EXISTS "txn_superadmin_all"     ON transacciones;
DROP POLICY IF EXISTS "txn_tenant_select"      ON transacciones;
DROP POLICY IF EXISTS "txn_tenant_insert"      ON transacciones;
DROP POLICY IF EXISTS "txn_tenant_update"      ON transacciones;
DROP POLICY IF EXISTS "txn_tenant_delete"      ON transacciones;

-- Superadmin: acceso total
CREATE POLICY "txn_superadmin_all" ON transacciones
  FOR ALL TO authenticated
  USING (es_superadmin())
  WITH CHECK (es_superadmin());

-- Usuarios: solo su(s) tenant(s)
CREATE POLICY "txn_tenant_select" ON transacciones
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "txn_tenant_insert" ON transacciones
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "txn_tenant_update" ON transacciones
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "txn_tenant_delete" ON transacciones
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()));


-- ============================================================
-- TABLA: clientes
-- ============================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation"        ON clientes;
DROP POLICY IF EXISTS "superadmin_all"          ON clientes;
DROP POLICY IF EXISTS "cli_superadmin_all"      ON clientes;
DROP POLICY IF EXISTS "cli_tenant_select"       ON clientes;
DROP POLICY IF EXISTS "cli_tenant_insert"       ON clientes;
DROP POLICY IF EXISTS "cli_tenant_update"       ON clientes;
DROP POLICY IF EXISTS "cli_tenant_delete"       ON clientes;

CREATE POLICY "cli_superadmin_all" ON clientes
  FOR ALL TO authenticated
  USING (es_superadmin()) WITH CHECK (es_superadmin());

CREATE POLICY "cli_tenant_select" ON clientes
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "cli_tenant_insert" ON clientes
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "cli_tenant_update" ON clientes
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()));

CREATE POLICY "cli_tenant_delete" ON clientes
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT mis_tenant_ids()));


-- ============================================================
-- TABLA: user_profiles
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_profile"            ON user_profiles;
DROP POLICY IF EXISTS "superadmin_all"         ON user_profiles;
DROP POLICY IF EXISTS "up_superadmin_all"      ON user_profiles;
DROP POLICY IF EXISTS "up_own"                 ON user_profiles;
DROP POLICY IF EXISTS "up_same_tenant"         ON user_profiles;

-- Superadmin: todo
CREATE POLICY "up_superadmin_all" ON user_profiles
  FOR ALL TO authenticated
  USING (es_superadmin()) WITH CHECK (es_superadmin());

-- Cada usuario: su propio perfil
CREATE POLICY "up_own" ON user_profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin de tenant: ver perfiles del mismo tenant
CREATE POLICY "up_same_tenant" ON user_profiles
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT mis_tenant_ids())
    OR id IN (
      SELECT utm.user_id FROM user_tenant_memberships utm
      WHERE utm.tenant_id IN (SELECT mis_tenant_ids())
    )
  );


-- ============================================================
-- TABLA: ros_reportes (o la que uses para ROS)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ros_reportes') THEN

    EXECUTE 'ALTER TABLE ros_reportes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "ros_superadmin_all" ON ros_reportes';
    EXECUTE 'DROP POLICY IF EXISTS "ros_tenant_all"     ON ros_reportes';
    EXECUTE 'DROP POLICY IF EXISTS "superadmin_all"     ON ros_reportes';
    EXECUTE 'DROP POLICY IF EXISTS "tenant_isolation"   ON ros_reportes';

    EXECUTE $p$
      CREATE POLICY "ros_superadmin_all" ON ros_reportes
        FOR ALL TO authenticated
        USING (es_superadmin()) WITH CHECK (es_superadmin())
    $p$;

    EXECUTE $p$
      CREATE POLICY "ros_tenant_all" ON ros_reportes
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT mis_tenant_ids()))
        WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()))
    $p$;

  END IF;
END $$;


-- ============================================================
-- TABLA: calificacion_clientes (si existe)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calificacion_clientes') THEN

    EXECUTE 'ALTER TABLE calificacion_clientes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "cal_superadmin_all" ON calificacion_clientes';
    EXECUTE 'DROP POLICY IF EXISTS "cal_tenant_all"     ON calificacion_clientes';

    EXECUTE $p$
      CREATE POLICY "cal_superadmin_all" ON calificacion_clientes
        FOR ALL TO authenticated
        USING (es_superadmin()) WITH CHECK (es_superadmin())
    $p$;

    EXECUTE $p$
      CREATE POLICY "cal_tenant_all" ON calificacion_clientes
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT mis_tenant_ids()))
        WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()))
    $p$;

  END IF;
END $$;


-- ============================================================
-- TABLA: expedientes_dd (debida diligencia)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expedientes_dd') THEN

    EXECUTE 'ALTER TABLE expedientes_dd ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "dd_superadmin_all" ON expedientes_dd';
    EXECUTE 'DROP POLICY IF EXISTS "dd_tenant_all"     ON expedientes_dd';

    EXECUTE $p$
      CREATE POLICY "dd_superadmin_all" ON expedientes_dd
        FOR ALL TO authenticated
        USING (es_superadmin()) WITH CHECK (es_superadmin())
    $p$;

    EXECUTE $p$
      CREATE POLICY "dd_tenant_all" ON expedientes_dd
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT mis_tenant_ids()))
        WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()))
    $p$;

  END IF;
END $$;


-- ============================================================
-- TABLA: denuncias (canal de denuncias)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'denuncias') THEN

    EXECUTE 'ALTER TABLE denuncias ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "den_superadmin_all" ON denuncias';
    EXECUTE 'DROP POLICY IF EXISTS "den_tenant_all"     ON denuncias';
    EXECUTE 'DROP POLICY IF EXISTS "den_public_insert"  ON denuncias';

    EXECUTE $p$
      CREATE POLICY "den_superadmin_all" ON denuncias
        FOR ALL TO authenticated
        USING (es_superadmin()) WITH CHECK (es_superadmin())
    $p$;

    EXECUTE $p$
      CREATE POLICY "den_tenant_all" ON denuncias
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT mis_tenant_ids()))
        WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()))
    $p$;

    -- Permitir inserción anónima (denuncias públicas sin login)
    EXECUTE $p$
      CREATE POLICY "den_public_insert" ON denuncias
        FOR INSERT TO anon
        WITH CHECK (true)
    $p$;

  END IF;
END $$;


-- ============================================================
-- TABLA: audit_log / auditoria
-- ============================================================
DO $$
DECLARE tname text;
BEGIN
  FOR tname IN SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('audit_log', 'auditoria', 'audit_logs')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tname);
    EXECUTE format('DROP POLICY IF EXISTS "aud_superadmin_all" ON %I', tname);
    EXECUTE format('DROP POLICY IF EXISTS "aud_tenant_select"  ON %I', tname);

    EXECUTE format($p$
      CREATE POLICY "aud_superadmin_all" ON %I
        FOR ALL TO authenticated
        USING (es_superadmin()) WITH CHECK (es_superadmin())
    $p$, tname);

    EXECUTE format($p$
      CREATE POLICY "aud_tenant_select" ON %I
        FOR SELECT TO authenticated
        USING (tenant_id IN (SELECT mis_tenant_ids()))
    $p$, tname);

    EXECUTE format($p$
      CREATE POLICY "aud_tenant_insert" ON %I
        FOR INSERT TO authenticated
        WITH CHECK (tenant_id IN (SELECT mis_tenant_ids()))
    $p$, tname);
  END LOOP;
END $$;


-- ============================================================
-- TABLA: feed_items (noticias regulatorias — lectura global)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feed_items') THEN
    EXECUTE 'ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "feed_authenticated_read" ON feed_items';
    EXECUTE $p$
      CREATE POLICY "feed_authenticated_read" ON feed_items
        FOR SELECT TO authenticated USING (true)
    $p$;
  END IF;
END $$;


-- ============================================================
-- TABLA: notificaciones
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notificaciones') THEN
    EXECUTE 'ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "notif_own" ON notificaciones';
    EXECUTE 'DROP POLICY IF EXISTS "notif_superadmin" ON notificaciones';

    EXECUTE $p$
      CREATE POLICY "notif_superadmin" ON notificaciones
        FOR ALL TO authenticated
        USING (es_superadmin()) WITH CHECK (es_superadmin())
    $p$;

    EXECUTE $p$
      CREATE POLICY "notif_own" ON notificaciones
        FOR ALL TO authenticated
        USING (user_id = auth.uid() OR tenant_id IN (SELECT mis_tenant_ids()))
        WITH CHECK (user_id = auth.uid() OR tenant_id IN (SELECT mis_tenant_ids()))
    $p$;
  END IF;
END $$;


-- ============================================================
-- TABLA: tenants (solo lectura para usuarios autenticados)
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_superadmin_all"  ON tenants;
DROP POLICY IF EXISTS "tenants_member_read"     ON tenants;
DROP POLICY IF EXISTS "superadmin_all"          ON tenants;
DROP POLICY IF EXISTS "authenticated_read"      ON tenants;

CREATE POLICY "tenants_superadmin_all" ON tenants
  FOR ALL TO authenticated
  USING (es_superadmin()) WITH CHECK (es_superadmin());

CREATE POLICY "tenants_member_read" ON tenants
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT mis_tenant_ids())
    OR es_superadmin()
  );
