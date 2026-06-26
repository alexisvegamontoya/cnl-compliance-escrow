import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import BellNotificaciones from './BellNotificaciones'

const modulo1 = [
  { to: '/transacciones', icon: '💰', label: 'Transacciones' },
  { to: '/clientes',      icon: '👤', label: 'Clientes' },
  { to: '/xml',           icon: '📄', label: 'Generar XML' },
  { to: '/informes',      icon: '📈', label: 'Informes' },
]

const operaciones = [
  { to: '/ros',             icon: '🚨', label: 'Operaciones Sospechosas' },
  { to: '/calificacion',    icon: '🎯', label: 'Calificación de Clientes' },
  { to: '/compliance',      icon: '📊', label: 'Nivel de Cumplimiento' },
  { to: '/denuncias',       icon: '📥', label: 'Canal de Denuncias' },
  { to: '/listas',          icon: '🔎', label: 'PEP / Listas' },
  { to: '/debida-diligencia', icon: '🛡️', label: 'Debida Diligencia' },
]

const documentos = [
  { to: '/normativa',    icon: '📚', label: 'Normativa' },
  { to: '/asistente-ia', icon: '🤖', label: 'Asistente IA' },
]

const adminItems = [
  { to: '/admin/usuarios',  icon: '👥', label: 'Usuarios' },
  { to: '/admin/tenants',   icon: '🏢', label: 'Sujetos Obligados' },
  { to: '/admin/auditoria', icon: '🔍', label: 'Historial Auditoría' },
]

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-brand-600 text-white font-medium'
            : 'text-brand-200 hover:bg-brand-800 hover:text-white'
        }`
      }
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const { tenant, profile, signOut, isAdmin, isSuperAdmin } = useAuth()

  return (
    <aside className="w-64 bg-brand-900 text-white flex flex-col min-h-screen">
      {/* Logo + campana */}
      <div className="px-4 py-4 border-b border-brand-700 flex items-center gap-2">
        <img src="/logo-blanco.png" alt="CNL Craniley Compliance Services" className="flex-1 max-w-[160px]" />
        <BellNotificaciones />
      </div>

      {/* Tenant info */}
      {tenant && (
        <div className="px-4 py-3 bg-brand-800 mx-3 my-3 rounded-lg">
          <p className="text-xs text-brand-300 uppercase tracking-wider mb-1">Sujeto Obligado</p>
          <p className="text-sm font-medium text-white leading-tight truncate">{tenant.nombre}</p>
          <p className="text-xs text-brand-300 mt-0.5 truncate">{tenant.actividad_apnfd}</p>
          <span className="inline-block mt-1 text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full">
            Tipo {tenant.tipo_sujeto}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">

        <NavItem to="/" icon="📊" label="Dashboard" end />

        <div className="border-t border-brand-700 my-3" />
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider px-3 py-2">
          SICVECA
        </p>
        {modulo1.map(item => (
          <NavItem key={item.to} {...item} />
        ))}

        <div className="border-t border-brand-700 my-3" />
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider px-3 py-2 mt-1">
          Operaciones
        </p>
        {operaciones.map(item => (
          <NavItem key={item.to} {...item} />
        ))}

        <div className="border-t border-brand-700 my-3" />
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider px-3 py-2">
          Documentos
        </p>
        {documentos.map(item => (
          <NavItem key={item.to} {...item} />
        ))}

        {(isAdmin || isSuperAdmin) && (
          <>
            <div className="border-t border-brand-700 my-3" />
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider px-3 py-2">
              Administración
            </p>
            {adminItems.map(item => (
              <NavItem key={item.to} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-brand-700">
        <Link to="/perfil" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-brand-800 transition-colors group">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {profile?.nombre?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile?.nombre || profile?.email}</p>
            <p className="text-xs text-brand-300 capitalize">{profile?.rol?.replace('_', ' ')}</p>
          </div>
        </Link>
        <button
          onClick={signOut}
          className="w-full mt-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-brand-400 hover:text-white hover:bg-brand-800 transition-colors text-xs"
          title="Cerrar sesión"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
