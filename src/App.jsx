import { useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { puedeVer } from './lib/permisos'
import { CatalogoDocumentalProvider } from './lib/CatalogoDocumentalContext'
import Login from './components/auth/Login'
import Sidebar from './components/layout/Sidebar'

// Cada pantalla se descarga la primera vez que se entra a ella, no al arrancar.
// Así el bundle inicial no arrastra librerías que solo usan algunos módulos
// (xlsx en carga masiva y exportaciones, recharts en los dashboards).
const SetPassword             = lazy(() => import('./pages/SetPassword'))
const MFAGate                 = lazy(() => import('./components/auth/MFAGate'))
const StatusPage              = lazy(() => import('./pages/StatusPage'))
const CambiarClaveObligatoria = lazy(() => import('./pages/CambiarClaveObligatoria'))
const Dashboard               = lazy(() => import('./pages/Dashboard'))
const Transacciones           = lazy(() => import('./pages/Transacciones'))
const GenerarXML              = lazy(() => import('./pages/GenerarXML'))
const Clientes                = lazy(() => import('./pages/Clientes'))
const GestionClientes         = lazy(() => import('./pages/GestionClientes'))
const SujetosObligados        = lazy(() => import('./pages/admin/SujetosObligados'))
const Usuarios                = lazy(() => import('./pages/admin/Usuarios'))
const Informes                = lazy(() => import('./pages/Informes'))
const Ros                     = lazy(() => import('./pages/Ros'))
const Normativa               = lazy(() => import('./pages/Normativa'))
const CalificacionRiesgo      = lazy(() => import('./pages/CalificacionRiesgo'))
const ComplianceDashboard     = lazy(() => import('./pages/ComplianceDashboard'))
const CumplimientoGlobal      = lazy(() => import('./pages/CumplimientoGlobal'))
const CumplimientoPorGrupo    = lazy(() => import('./pages/CumplimientoPorGrupo'))
const GestionGrupos           = lazy(() => import('./pages/admin/GestionGrupos'))
const CanalDenuncias          = lazy(() => import('./pages/CanalDenuncias'))
const Perfil                  = lazy(() => import('./pages/Perfil'))
const AuditLog                = lazy(() => import('./pages/admin/AuditLog'))
const ConsultaPEP             = lazy(() => import('./pages/ConsultaPEP'))
const DebilidaDiligencia      = lazy(() => import('./pages/DebilidaDiligencia'))
const ModuloIA                = lazy(() => import('./pages/ModuloIA'))

/** Indicador mientras se descarga el módulo de una sección (dentro del layout). */
function CargandoSeccion() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-gray-400">Cargando sección…</div>
    </div>
  )
}

/** Indicador para las pantallas que se muestran fuera del layout. */
function CargandoPantalla() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-lg">Cargando…</div>
    </div>
  )
}

/** Aviso cuando el rol del usuario no tiene acceso al módulo solicitado. */
function SinAcceso() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <h1 className="text-lg font-bold text-gray-800">Sin acceso a este módulo</h1>
      <p className="text-sm text-gray-500 mt-1 max-w-sm">
        Tu rol no tiene permiso para ver esta sección. Si creés que es un error, contactá al administrador.
      </p>
    </div>
  )
}

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { rolTenant } = useAuth()
  const { pathname } = useLocation()
  const permitido = puedeVer(rolTenant, pathname)

  return (
    <div className="flex min-h-screen">
      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Barra superior móvil */}
        <header className="md:hidden bg-brand-900 px-4 py-3 flex items-center gap-3 sticky top-0 z-30 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white p-1 rounded-lg hover:bg-brand-800"
            aria-label="Abrir menú"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/logo-blanco.png" alt="CNL Craniley Compliance" className="h-7" />
        </header>

        <main className="flex-1 overflow-auto bg-gray-50">
          {/* El sidebar se mantiene visible mientras carga la sección */}
          <Suspense fallback={<CargandoSeccion />}>
            {permitido ? children : <SinAcceso />}
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function PrivateRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400">Cargando…</div>
    </div>
  )
  return session ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { session, loading, needsPasswordSetup, mustChangePassword, setMustChangePassword, needsMFAEnroll, needsMFAChallenge, sinAccesoApp, signOut } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-lg">Iniciando CNL Compliance…</div>
    </div>
  )

  // Si viene de un link de invitación, mostrar página de configurar contraseña
  if (needsPasswordSetup && session) {
    return <SetPassword />
  }

  // Usuario con contraseña provisional — forzar cambio antes de continuar
  if (mustChangePassword && session) {
    return <CambiarClaveObligatoria onCambiada={() => setMustChangePassword(false)} />
  }

  // MFA enforcement: admin sin MFA inscrito o sin AAL2 en sesión
  if (session && (needsMFAEnroll || needsMFAChallenge)) {
    return <MFAGate />
  }

  // Cuenta válida pero sin habilitación para esta aplicación. La base es
  // compartida con el evaluador de riesgos y capacitación.
  if (session && sinAccesoApp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="card max-w-md text-center space-y-4">
          <p className="text-4xl">🔒</p>
          <h1 className="text-xl font-bold text-gray-900">Sin acceso a esta aplicación</h1>
          <p className="text-sm text-gray-500">
            Su cuenta es válida, pero no está habilitada para CNL Compliance.
            Solicite el acceso al administrador del sistema.
          </p>
          <button className="btn-secondary text-sm" onClick={signOut}>Cerrar sesión</button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={
        <PrivateRoute>
          <Layout><Dashboard /></Layout>
        </PrivateRoute>
      } />
      <Route path="/transacciones" element={
        <PrivateRoute>
          <Layout><Transacciones /></Layout>
        </PrivateRoute>
      } />
      <Route path="/xml" element={
        <PrivateRoute>
          <Layout><GenerarXML /></Layout>
        </PrivateRoute>
      } />
      <Route path="/clientes" element={
        <PrivateRoute>
          <Layout><GestionClientes /></Layout>
        </PrivateRoute>
      } />
      <Route path="/sicveca/clientes" element={
        <PrivateRoute>
          <Layout><Clientes /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/tenants" element={
        <PrivateRoute>
          <Layout><SujetosObligados /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/usuarios" element={
        <PrivateRoute>
          <Layout><Usuarios /></Layout>
        </PrivateRoute>
      } />
      <Route path="/informes" element={
        <PrivateRoute>
          <Layout><Informes /></Layout>
        </PrivateRoute>
      } />
      <Route path="/ros" element={
        <PrivateRoute>
          <Layout><Ros /></Layout>
        </PrivateRoute>
      } />
      <Route path="/normativa" element={
        <PrivateRoute>
          <Layout><Normativa /></Layout>
        </PrivateRoute>
      } />
      <Route path="/calificacion" element={
        <PrivateRoute>
          <Layout><CalificacionRiesgo /></Layout>
        </PrivateRoute>
      } />
      <Route path="/compliance" element={
        <PrivateRoute>
          <Layout><ComplianceDashboard /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/cumplimiento-global" element={
        <PrivateRoute>
          <Layout><CumplimientoGlobal /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/grupos" element={
        <PrivateRoute>
          <Layout><GestionGrupos /></Layout>
        </PrivateRoute>
      } />
      <Route path="/grupo/cumplimiento" element={
        <PrivateRoute>
          <Layout><CumplimientoPorGrupo /></Layout>
        </PrivateRoute>
      } />
      <Route path="/denuncias" element={
        <PrivateRoute>
          <Layout><CanalDenuncias /></Layout>
        </PrivateRoute>
      } />
      <Route path="/listas" element={
        <PrivateRoute>
          <Layout><ConsultaPEP /></Layout>
        </PrivateRoute>
      } />
      <Route path="/debida-diligencia" element={
        <PrivateRoute>
          <Layout><DebilidaDiligencia /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/auditoria" element={
        <PrivateRoute>
          <Layout><AuditLog /></Layout>
        </PrivateRoute>
      } />
      <Route path="/asistente-ia" element={
        <PrivateRoute>
          <Layout><ModuloIA /></Layout>
        </PrivateRoute>
      } />
      <Route path="/perfil" element={
        <PrivateRoute>
          <Layout><Perfil /></Layout>
        </PrivateRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CatalogoDocumentalProvider>
          <Suspense fallback={<CargandoPantalla />}>
            <AppRoutes />
          </Suspense>
        </CatalogoDocumentalProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
