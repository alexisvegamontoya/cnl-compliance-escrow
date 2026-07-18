-- ============================================================
-- CNL Compliance App — Esquema Supabase (Módulo 1)
-- ============================================================

-- PASO 1: Habilitar extensión uuid
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLA: tenants (Sujetos Obligados)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                    TEXT NOT NULL,
  cedula_juridica           TEXT UNIQUE NOT NULL,
  actividad_apnfd           TEXT NOT NULL,
  clase_dato                INTEGER NOT NULL,
  archivo                   INTEGER NOT NULL,
  tipo_sujeto               TEXT NOT NULL CHECK (tipo_sujeto IN ('I', 'II', 'III')),
  meses_periodo             INTEGER NOT NULL CHECK (meses_periodo IN (2, 3, 4)),
  tipo_moneda_default       INTEGER DEFAULT 1,
  monto_minimo_usd          NUMERIC,
  email_oficial_cumplimiento TEXT,
  activo                    BOOLEAN DEFAULT TRUE,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: user_profiles (vinculada a Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES tenants(id),
  nombre      TEXT,
  email       TEXT,
  rol         TEXT NOT NULL CHECK (rol IN ('superadmin', 'admin_tenant', 'usuario')),
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: clientes (clientes del sujeto obligado)
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL REFERENCES tenants(id),
  numero_identificacion         TEXT NOT NULL,
  tipo_identificacion           INTEGER NOT NULL,
  nombre_cliente                TEXT,
  primer_apellido               TEXT,
  segundo_apellido              TEXT,
  nombre_empresa                TEXT,
  ingreso_mensual_est           NUMERIC,   -- Ingreso mensual estimado en USD (análisis transaccional SICVECA)
  calificacion_riesgo           TEXT,
  notas                         TEXT,
  activo                        BOOLEAN DEFAULT TRUE,
  created_at                    TIMESTAMPTZ DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, numero_identificacion)
);

-- ============================================================
-- TABLA: transacciones
-- ============================================================
CREATE TABLE IF NOT EXISTS transacciones (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  cliente_id                  UUID REFERENCES clientes(id),
  -- Identificación del cliente (snapshot al momento del registro)
  numero_identificacion       TEXT NOT NULL,
  tipo_identificacion         INTEGER NOT NULL,
  nombre_cliente              TEXT,
  primer_apellido             TEXT,
  segundo_apellido            TEXT,
  nombre_empresa              TEXT,
  -- Clasificación de la operación
  tipo_reporte                INTEGER NOT NULL,   -- 1=Efectivo, 2=APNFD, 3=Ambos
  tipo_operacion              INTEGER NOT NULL,   -- 1=Única, 2=Múltiple
  tipo_movimiento             INTEGER NOT NULL,   -- 1=Ingreso, 2=Salida, 3=Ingreso/Salida
  tipo_ingreso                INTEGER DEFAULT 0,
  tipo_salida                 INTEGER DEFAULT 0,
  tipo_moneda_movimiento      INTEGER NOT NULL,   -- 1=CRC, 2=USD, 3=EUR, 4=Otra
  monto_movimiento            NUMERIC NOT NULL,
  fecha_transaccion           DATE,
  motivo_transaccion          TEXT,
  origen_recursos             INTEGER,
  ubicacion_cliente           TEXT,
  motivo_credito              INTEGER DEFAULT 0,
  ubicacion_comprador_vendedor TEXT,
  pais_origen_recursos        TEXT,
  pais_destino_recursos       TEXT,
  -- Período de reporte
  periodo                     DATE NOT NULL,     -- Primer día del mes del período
  -- Estado del registro
  accion                      TEXT DEFAULT 'insertar' CHECK (accion IN ('insertar', 'modificar', 'eliminar')),
  enviado_sugef               BOOLEAN DEFAULT FALSE,
  fecha_envio_sugef           TIMESTAMPTZ,
  -- Metadatos
  created_by                  UUID REFERENCES auth.users(id),
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: periodos_reporte (control de períodos por tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS periodos_reporte (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  periodo     DATE NOT NULL,          -- Primer día del mes
  tipo_carga  INTEGER DEFAULT 1,      -- 1=Nueva, 2=Prórroga, 3=Reenvío, 4=Cambio
  estado      TEXT DEFAULT 'abierto' CHECK (estado IN ('abierto', 'generado', 'enviado')),
  xml_nombre  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, periodo)
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_transacciones_tenant_periodo ON transacciones(tenant_id, periodo);
CREATE INDEX idx_transacciones_cliente ON transacciones(cliente_id);
CREATE INDEX idx_clientes_tenant ON clientes(tenant_id);
CREATE INDEX idx_clientes_identificacion ON clientes(tenant_id, numero_identificacion);

-- ============================================================
-- ROW LEVEL SECURITY (Multi-tenancy)
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos_reporte ENABLE ROW LEVEL SECURITY;

-- Función para obtener el tenant_id del usuario actual
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Función para verificar si el usuario es superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND rol = 'superadmin');
$$ LANGUAGE sql SECURITY DEFINER;

-- Políticas: tenants
CREATE POLICY "Superadmin ve todos los tenants"
  ON tenants FOR ALL USING (is_superadmin());
CREATE POLICY "Usuarios ven su propio tenant"
  ON tenants FOR SELECT USING (id = get_user_tenant_id());

-- Políticas: user_profiles
CREATE POLICY "Superadmin gestiona todos los usuarios"
  ON user_profiles FOR ALL USING (is_superadmin());
CREATE POLICY "Usuarios ven perfiles de su tenant"
  ON user_profiles FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Usuario ve su propio perfil"
  ON user_profiles FOR SELECT USING (id = auth.uid());

-- Políticas: clientes
CREATE POLICY "Usuarios acceden a clientes de su tenant"
  ON clientes FOR ALL USING (tenant_id = get_user_tenant_id() OR is_superadmin());

-- Políticas: transacciones
CREATE POLICY "Usuarios acceden a transacciones de su tenant"
  ON transacciones FOR ALL USING (tenant_id = get_user_tenant_id() OR is_superadmin());

-- Políticas: periodos_reporte
CREATE POLICY "Usuarios acceden a períodos de su tenant"
  ON periodos_reporte FOR ALL USING (tenant_id = get_user_tenant_id() OR is_superadmin());

-- ============================================================
-- TRIGGER: actualizar updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transacciones_updated_at
  BEFORE UPDATE ON transacciones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DATOS INICIALES: Actividades APNFD
-- ============================================================
-- Descomentar y ajustar para crear el primer superadmin tenant:
/*
INSERT INTO tenants (nombre, cedula_juridica, actividad_apnfd, clase_dato, archivo, tipo_sujeto, meses_periodo, monto_minimo_usd)
VALUES ('CNL Craniley (Admin)', '3101000000', 'Administrador', 0, 0, 'I', 2, 0);
*/
