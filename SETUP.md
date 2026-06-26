# CNL Compliance App — Guía de configuración

## Requisitos previos
- Node.js 18+ instalado (descargar en nodejs.org)
- Cuenta en supabase.com (gratuita)
- Cuenta en vercel.com (gratuita)

---

## Paso 1 — Configurar Supabase

1. Ir a **supabase.com** → crear nuevo proyecto (anotar la contraseña de BD)
2. En el proyecto → **SQL Editor** → pegar el contenido de `supabase/schema.sql` → ejecutar
3. En **Project Settings → API** copiar:
   - `Project URL` → será `VITE_SUPABASE_URL`
   - `anon public key` → será `VITE_SUPABASE_ANON_KEY`

### Crear el primer usuario administrador
1. En Supabase → **Authentication → Users** → Invite user (poner tu correo)
2. Activar desde el correo recibido
3. En **SQL Editor** ejecutar:

```sql
-- Reemplazar con el UUID del usuario creado y los datos reales
INSERT INTO tenants (nombre, cedula_juridica, actividad_apnfd, clase_dato, archivo, tipo_sujeto, meses_periodo, monto_minimo_usd)
VALUES ('CNL Craniley S.A.', '3101000000', 'Administrador', 0, 0, 'I', 2, 0);

INSERT INTO user_profiles (id, tenant_id, nombre, email, rol)
VALUES (
  'UUID_DEL_USUARIO',  -- copiar de Authentication → Users
  (SELECT id FROM tenants WHERE cedula_juridica = '3101000000'),
  'Alexis Vega',
  'alexisvegamontoya@gmail.com',
  'superadmin'
);
```

### Crear un cliente (sujeto obligado)
```sql
-- Ejemplo: cliente con Facilidades Crediticias, Tipo I
INSERT INTO tenants (nombre, cedula_juridica, actividad_apnfd, clase_dato, archivo, tipo_sujeto, meses_periodo, monto_minimo_usd)
VALUES ('Mi Cliente S.A.', '3101782164', 'Facilidades Crediticias', 47, 4701, 'I', 2, 10000);

-- Crear usuario para ese cliente
INSERT INTO user_profiles (id, tenant_id, nombre, email, rol)
VALUES (
  'UUID_USUARIO_CLIENTE',
  (SELECT id FROM tenants WHERE cedula_juridica = '3101782164'),
  'Nombre del Usuario',
  'usuario@micliente.com',
  'usuario'
);
```

---

## Paso 2 — Configurar el proyecto local

```bash
# Entrar a la carpeta del proyecto
cd "cnl-compliance-app"

# Instalar dependencias
npm install

# Crear archivo de variables de entorno
cp .env.example .env

# Editar .env con los valores de Supabase
# VITE_SUPABASE_URL=https://xxxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...

# Iniciar en modo desarrollo
npm run dev
```

La app estará disponible en `http://localhost:5173`

---

## Paso 3 — Desplegar en Vercel (para acceso de clientes)

1. Subir el proyecto a GitHub (o GitLab)
2. Ir a **vercel.com** → Import Project → seleccionar el repositorio
3. En **Environment Variables** agregar:
   - `VITE_SUPABASE_URL` = tu URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
4. Deploy → Vercel asignará una URL como `cnl-compliance.vercel.app`
5. Opcional: configurar dominio propio `app.cnl-cr.com` en Vercel → Domains

---

## Flujo de uso — Módulo 1

### Para el sujeto obligado (usuario):
1. Ingresar a la app con su correo y contraseña
2. **Transacciones** → Nueva transacción → completar el formulario → Guardar
3. Repetir para cada transacción del período
4. **Generar XML** → Seleccionar período → Generar → Descargar XML
5. Cargar el XML en **SICVECA** (sugef.fi.cr) dentro del plazo

### Plazos SUGEF (Art. 22 Reglamento 13-19):
| Tipo de Sujeto | Frecuencia | Plazo de envío |
|----------------|------------|----------------|
| Tipo I         | Bimestral  | 20 días naturales post-corte |
| Tipo II        | Trimestral | 20 días naturales post-corte |
| Tipo III       | Cuatrimestral | 20 días naturales post-corte |

---

## Estructura de archivos

```
src/
├── App.jsx                    # Rutas y estructura principal
├── lib/
│   ├── supabase.js            # Cliente Supabase
│   ├── AuthContext.jsx        # Autenticación y perfil de usuario
│   ├── catalogos.js           # Catálogos SUGEF (actividades, tipos, etc.)
│   └── xmlGenerator.js        # Generador de XML SICVECA
├── components/
│   ├── auth/Login.jsx          # Pantalla de login
│   ├── layout/Sidebar.jsx      # Menú lateral
│   └── module1/
│       ├── TransactionForm.jsx  # Formulario de transacciones
│       ├── TransactionList.jsx  # Lista de transacciones
│       └── XMLGenerator.jsx     # Generador XML
└── pages/
    ├── Dashboard.jsx            # Inicio
    ├── Transacciones.jsx        # Página de transacciones
    ├── GenerarXML.jsx           # Página de exportación XML
    └── Clientes.jsx             # Gestión de clientes
supabase/
└── schema.sql                   # Esquema de base de datos
```

---

## Módulos futuros planificados

| Módulo | Descripción | Estado |
|--------|-------------|--------|
| 1 ✅    | Transacciones + XML SICVECA + Alertas | Listo |
| 2      | Normativa interna (PDFs por cliente) | Pendiente |
| 3      | Consulta IA (Claude API) | Pendiente |
| 4      | Dashboard de cumplimiento | Pendiente |
| 5      | ROS — Reporte de Operación Sospechosa | Pendiente |
| 6      | Evaluación de riesgos LC/FT/FPADM | Pendiente |
| 7      | Calificación de riesgo de clientes | Pendiente |
