import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { puedeVer } from '../../lib/permisos'
import BellNotificaciones from './BellNotificaciones'

const modulo1 = [
  { to: '/transacciones', icon: '💰', label: 'Transacciones' },
  { to: '/xml',           icon: '📄', label: 'Generar XML' },
  { to: '/informes',      icon: '📈', label: 'Informes' },
]

const clientesItems = [
  { to: '/clientes',          icon: '👥', label: 'Gestión de Clientes' },
  { to: '/listas',            icon: '🔎', label: 'PEP / Listas Internacionales' },
  { to: '/debida-diligencia', icon: '🛡️', label: 'Debida Diligencia' },
  { to: '/calificacion',      icon: '🎯', label: 'Calificación de Riesgo' },
]

const operaciones = [
  { to: '/ros',       icon: '🚨', label: 'Operaciones Sospechosas' },
  { to: '/compliance',icon: '📊', label: 'Nivel de Cumplimiento' },
  { to: '/denuncias', icon: '📥', label: 'Canal de Denuncias' },
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

function NavItem({ to, icon, label, end, onClose }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
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

function Seccion({ titulo, items, onClose }) {
  if (!items.length) return null
  return (
    <>
      <div className="border-t border-brand-700 my-3" />
      <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider px-3 py-2">
        {titulo}
      </p>
      {items.map(item => <NavItem key={item.to} {...item} onClose={onClose} />)}
    </>
  )
}

export default function Sidebar({ open, onClose }) {
  const { tenant, tenantsDisponibles, cambiarTenant, profile, signOut, isSuperAdmin, misGrupos, rolTenant, moduloHabilitado } = useAuth()
  const tieneGrupos = (misGrupos?.length || 0) > 0

  // El menú se filtra por el rol efectivo sobre la empresa activa.
  const ver = (to) => puedeVer(rolTenant, to)
  const filtrar = (items) => items.filter(i => ver(i.to))

  const cliVis = [
    ...filtrar(clientesItems),
    ...(moduloHabilitado('kyc') && ver('/recoleccion-kyc')
      ? [{ to: '/recoleccion-kyc', icon: '📨', label: 'Recolección KYC' }] : []),
  ]
  const sicVis = filtrar(modulo1)
  const opeVis = [
    ...filtrar(operaciones),
    ...((tieneGrupos || isSuperAdmin) && ver('/grupo/cumplimiento')
      ? [{ to: '/grupo/cumplimiento', icon: '🏢', label: 'Cumplimiento por Grupo' }] : []),
  ]
  const docVis = filtrar(documentos)
  const admVis = [
    ...filtrar(adminItems),
    ...(isSuperAdmin ? [
      { to: '/admin/cumplimiento-global', icon: '🌐', label: 'Cumplimiento Global' },
      { to: '/admin/grupos', icon: '🗂️', label: 'Grupos de Empresas' },
      { to: '/admin/modulos', icon: '🧩', label: 'Módulos por S.O.' },
    ] : []),
  ]

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-64 bg-brand-900 text-white flex flex-col
      transition-transform duration-300 ease-in-out
      ${open ? 'translate-x-0' : '-translate-x-full'}
      md:relative md:translate-x-0 md:z-auto
    `}>
      {/* Logo + campana + botón cerrar (móvil) */}
      <div className="px-4 py-4 border-b border-brand-700 flex items-center gap-2">
        <img src="/logo-blanco.png" alt="CNL Craniley Compliance Services" className="flex-1 max-w-[160px]" />
        <BellNotificaciones />
        <button
          className="md:hidden text-brand-300 hover:text-white ml-1 p-1"
          onClick={onClose}
          aria-label="Cerrar menú"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tenant info */}
      {tenant && (
        <div className={`px-4 py-3 mx-3 my-3 rounded-lg ${isSuperAdmin ? 'bg-amber-900 border border-amber-700' : 'bg-brand-800'}`}>
          <p className={`text-xs uppercase tracking-wider mb-1 ${isSuperAdmin ? 'text-amber-300' : 'text-brand-300'}`}>
            {isSuperAdmin ? 'Navegando como' : 'Sujeto Obligado'}
          </p>
          {tenantsDisponibles.length > 1 ? (
            <select
              value={tenant.id}
              onChange={e => cambiarTenant(e.target.value)}
              className={`w-full text-sm font-medium text-white border rounded-lg px-2 py-1.5 mb-1 ${isSuperAdmin ? 'bg-amber-800 border-amber-600' : 'bg-brand-700 border-brand-600'}`}
            >
              {tenantsDisponibles.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm font-medium text-white leading-tight truncate">{tenant.nombre}</p>
          )}
          <p className={`text-xs mt-0.5 truncate ${isSuperAdmin ? 'text-amber-300' : 'text-brand-300'}`}>
            {tenant.actividad_apnfd}
          </p>
          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${isSuperAdmin ? 'bg-amber-700 text-amber-100' : 'bg-brand-600 text-white'}`}>
            Tipo {tenant.tipo_sujeto}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">

        <NavItem to="/" icon="📊" label="Dashboard" end onClose={onClose} />

        <Seccion titulo="Clientes"     items={cliVis} onClose={onClose} />
        <Seccion titulo="SICVECA"      items={sicVis} onClose={onClose} />
        <Seccion titulo="Operaciones"  items={opeVis} onClose={onClose} />
        <Seccion titulo="Documentos"   items={docVis} onClose={onClose} />
        <Seccion titulo="Administración" items={admVis} onClose={onClose} />
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
