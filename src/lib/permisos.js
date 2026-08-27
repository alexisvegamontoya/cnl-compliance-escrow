// ============================================================
// permisos.js — Control de acceso por rol (fuente única de verdad)
//
// El rol es POR EMPRESA: vive en user_tenant_memberships.rol. El superadmin
// (user_profiles.rol='superadmin') tiene acceso total y global.
//
// Nivel por módulo (ruta): 'total' (ver y editar) | 'lectura' (solo ver).
// Ausente en el mapa = SIN acceso.
//
// Gobierna: el menú lateral (Sidebar), el guardián de rutas (Layout) y el
// helper soloLectura() que las pantallas pueden usar para desactivar edición.
// ============================================================

export const ROLES_FUNCIONALES = {
  oficial_cumplimiento: 'Oficial de Cumplimiento',
  operativo:            'Operativo',
  financiero:           'Financiero',
  gerencia:             'Gerencia',
  admin_tenant:         'Administrador del Sujeto Obligado',
}

// Roles que puede asignar un administrador en la pantalla de Usuarios.
export const ROLES_ASIGNABLES = [
  { valor: 'oficial_cumplimiento', label: 'Oficial de Cumplimiento' },
  { valor: 'operativo',            label: 'Operativo' },
  { valor: 'financiero',           label: 'Financiero' },
  { valor: 'gerencia',             label: 'Gerencia' },
  { valor: 'admin_tenant',         label: 'Administrador del Sujeto Obligado' },
]

const T = 'total'
const L = 'lectura'

// Módulos operativos con acceso TOTAL (base del oficial de cumplimiento).
const OPERATIVO_TOTAL = {
  '/': T,
  '/clientes': T, '/sicveca/clientes': T, '/listas': T, '/debida-diligencia': T, '/calificacion': T,
  '/transacciones': T, '/xml': T, '/informes': T,
  '/ros': T, '/compliance': T, '/denuncias': T, '/grupo/cumplimiento': T,
  '/normativa': T, '/asistente-ia': T,
  '/perfil': T,
  '/admin/auditoria': L,
}

// Mapa rol → { ruta: nivel }. Ausente = sin acceso.
export const PERMISOS = {
  // Administrador del sujeto obligado: todo lo operativo + gestión de su empresa.
  admin_tenant: {
    ...OPERATIVO_TOTAL,
    '/admin/usuarios': T,
    '/admin/tenants': L,
    '/admin/auditoria': T,
  },

  // Oficial de cumplimiento: poder total operativo (no administra usuarios).
  oficial_cumplimiento: { ...OPERATIVO_TOTAL },

  // Operativo.
  operativo: {
    '/': T,
    '/clientes': T, '/sicveca/clientes': T, '/listas': T, '/debida-diligencia': T, '/calificacion': T,
    '/transacciones': T,
    '/denuncias': T,
    '/normativa': L, '/asistente-ia': T,
    '/perfil': T,
  },

  // Financiero.
  financiero: {
    '/': T,
    '/transacciones': T, '/xml': T,
    '/denuncias': T,
    '/normativa': L, '/asistente-ia': T,
    '/perfil': T,
  },

  // Gerencia: supervisión (mayormente lectura).
  gerencia: {
    '/': T,
    '/clientes': L, '/sicveca/clientes': L, '/listas': L, '/debida-diligencia': L, '/calificacion': L,
    '/transacciones': L, '/informes': T,
    '/ros': L, '/compliance': T, '/denuncias': L, '/grupo/cumplimiento': T,
    '/normativa': L, '/asistente-ia': T,
    '/perfil': T,
    '/admin/auditoria': L,
  },
}

// Alias de roles heredados: mientras no se reasignen, conservan el acceso actual
// (total operativo) para no dejar a nadie sin acceso de golpe.
const ALIAS = {
  operador: 'oficial_cumplimiento',
  usuario:  'oficial_cumplimiento',
  grupo:    'oficial_cumplimiento', // miembro pleno de un grupo de empresas
}

/** Normaliza el rol recibido a una clave conocida de PERMISOS. */
function rolNormalizado(rol) {
  if (!rol) return 'oficial_cumplimiento'
  if (PERMISOS[rol]) return rol
  if (ALIAS[rol]) return ALIAS[rol]
  return 'oficial_cumplimiento' // desconocido → acceso operativo por defecto
}

/** Mapa de permisos del rol. Superadmin → null (acceso total a todo). */
export function permisosDe(rol) {
  if (rol === 'superadmin') return null
  return PERMISOS[rolNormalizado(rol)]
}

/** ¿El rol puede ver/entrar a esta ruta? */
export function puedeVer(rol, ruta) {
  const p = permisosDe(rol)
  if (p === null) return true          // superadmin
  return Object.prototype.hasOwnProperty.call(p, ruta)
}

/** Nivel de acceso a una ruta: 'total' | 'lectura' | null (sin acceso). */
export function nivelAcceso(rol, ruta) {
  const p = permisosDe(rol)
  if (p === null) return 'total'
  return p[ruta] || null
}

/** ¿El rol tiene esta ruta en modo SOLO LECTURA? */
export function soloLectura(rol, ruta) {
  return nivelAcceso(rol, ruta) === 'lectura'
}
