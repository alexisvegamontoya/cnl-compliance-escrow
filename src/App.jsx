import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './components/auth/Login'
import SetPassword from './pages/SetPassword'
import MFAGate from './components/auth/MFAGate'
import StatusPage from './pages/StatusPage'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './pages/Dashboard'
import Transacciones from './pages/Transacciones'
import GenerarXML from './pages/GenerarXML'
import Clientes from './pages/Clientes'
import GestionClientes from './pages/GestionClientes'
import SujetosObligados from './pages/admin/SujetosObligados'
import Usuarios from './pages/admin/Usuarios'
import Informes from './pages/Informes'
import Ros from './pages/Ros'
import Normativa from './pages/Normativa'
import CalificacionRiesgo from './pages/CalificacionRiesgo'
import ComplianceDashboard from './pages/ComplianceDashboard'
import CanalDenuncias from './pages/CanalDenuncias'
import Perfil from './pages/Perfil'
import AuditLog from './pages/admin/AuditLog'
import ConsultaPEP from './pages/ConsultaPEP'
import DebilidaDiligencia from './pages/DebilidaDiligencia'
import ModuloIA from './pages/ModuloIA'
import CambiarClaveObligatoria from './pages/CambiarClaveObligatoria'

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
          {children}
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
  const { session, loading, needsPasswordSetup, mustChangePassword, setMustChangePassword, needsMFAEnroll, needsMFAChallenge } = useAuth()

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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
