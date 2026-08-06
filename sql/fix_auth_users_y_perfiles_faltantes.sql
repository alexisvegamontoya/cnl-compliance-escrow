-- ============================================================
-- Arreglo: (A) listado de usuarios roto  (B) "Usuario sin perfil activo"
--
-- Diagnóstico del 2026-08-06:
--   A) GET /auth/v1/admin/users devuelve HTTP 500
--      {"error_code":"unexpected_failure","msg":"Database error finding users"}
--      Causa: 2 filas de auth.users que GoTrue no puede leer porque tienen
--      NULL en columnas de token que su modelo espera como texto NOT NULL.
--      Basta una fila así para tumbar TODO el listado → la pantalla
--      "Gestión de Usuarios" muestra 0 usuarios.
--
--   B) 3 usuarios existen en Auth y tienen membresía, pero no tienen fila en
--      user_profiles. api/_auth.js los rechaza con "Usuario sin perfil activo"
--      en cualquier llamada a /api/*:
--        rlopez@csn.co.cr, mjaner@castrogarnier.com, dcabalceta@theebsla.com
--
-- EJECUTAR COMPLETO en Supabase → SQL Editor → New query → Run
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASO 1 (diagnóstico, no modifica nada)
-- Muestra cuántas filas tienen NULL en cada columna de token.
-- ────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE confirmation_token         IS NULL) AS confirmation_token,
  count(*) FILTER (WHERE recovery_token             IS NULL) AS recovery_token,
  count(*) FILTER (WHERE email_change               IS NULL) AS email_change,
  count(*) FILTER (WHERE email_change_token_new     IS NULL) AS email_change_token_new,
  count(*) FILTER (WHERE email_change_token_current IS NULL) AS email_change_token_current,
  count(*) FILTER (WHERE phone_change               IS NULL) AS phone_change,
  count(*) FILTER (WHERE phone_change_token         IS NULL) AS phone_change_token,
  count(*) FILTER (WHERE reauthentication_token     IS NULL) AS reauthentication_token,
  count(*)                                                   AS total_usuarios
FROM auth.users;

-- Ver exactamente cuáles son las filas problemáticas
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
WHERE confirmation_token         IS NULL
   OR recovery_token             IS NULL
   OR email_change               IS NULL
   OR email_change_token_new     IS NULL
   OR email_change_token_current IS NULL
   OR phone_change               IS NULL
   OR phone_change_token         IS NULL
   OR reauthentication_token     IS NULL
ORDER BY created_at;


-- ────────────────────────────────────────────────────────────
-- PASO 2 (A) Reparar las filas de auth.users
-- GoTrue trata estas columnas como texto NOT NULL: se normaliza
-- el NULL a cadena vacía, que es el valor que él mismo escribe.
-- No toca contraseñas, correos ni sesiones.
-- ────────────────────────────────────────────────────────────
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token,         ''),
  recovery_token             = COALESCE(recovery_token,             ''),
  email_change               = COALESCE(email_change,               ''),
  email_change_token_new     = COALESCE(email_change_token_new,     ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change               = COALESCE(phone_change,               ''),
  phone_change_token         = COALESCE(phone_change_token,         ''),
  reauthentication_token     = COALESCE(reauthentication_token,     '')
WHERE confirmation_token         IS NULL
   OR recovery_token             IS NULL
   OR email_change               IS NULL
   OR email_change_token_new     IS NULL
   OR email_change_token_current IS NULL
   OR phone_change               IS NULL
   OR phone_change_token         IS NULL
   OR reauthentication_token     IS NULL;


-- ────────────────────────────────────────────────────────────
-- PASO 3 (B) Crear los perfiles que faltan
-- Solo para usuarios de Auth que YA tienen una membresía asignada
-- (es decir, a los que un administrador ya dio acceso).
-- El nombre sale de los metadatos de Auth; el rol queda 'operador'
-- igual que en api/admin-invite-user.js. Es idempotente.
-- ────────────────────────────────────────────────────────────
INSERT INTO user_profiles (id, email, nombre, rol, activo, tenant_id)
SELECT
  au.id,
  lower(au.email),
  COALESCE(NULLIF(au.raw_user_meta_data->>'nombre', ''), au.email),
  'operador',
  TRUE,
  (SELECT m.tenant_id
     FROM user_tenant_memberships m
    WHERE m.user_id = au.id AND m.activo
    ORDER BY m.created_at
    LIMIT 1)
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = au.id)
  AND EXISTS (SELECT 1 FROM user_tenant_memberships m WHERE m.user_id = au.id)
ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- PASO 4 (verificación)
-- Debe salir 0 filas: nadie con acceso asignado sin perfil.
-- ────────────────────────────────────────────────────────────
SELECT au.email, au.created_at
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = au.id)
ORDER BY au.created_at;


-- ────────────────────────────────────────────────────────────
-- PASO 5 (limpieza de una política RLS recursiva)
--
-- sql/012 creó "utm_admin_tenant_read" sobre user_tenant_memberships con un
-- USING que consulta la MISMA tabla. Postgres corta eso con
-- "infinite recursion detected in policy for relation ...", y como las
-- políticas permisivas se evalúan todas, una sola recursiva rompe cualquier
-- lectura de la tabla para el rol afectado.
--
-- sql/fix_superadmin_user_visibility.sql ya la sustituyó por "utm_admin_manage"
-- usando mis_tenant_ids() (SECURITY DEFINER, no recursa), pero nunca borró la
-- vieja. Primero verifique si sigue viva:
--
--   SELECT policyname, qual FROM pg_policies
--    WHERE tablename = 'user_tenant_memberships';
--
-- Si aparece "utm_admin_tenant_read", elimínela:
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "utm_admin_tenant_read" ON user_tenant_memberships;
