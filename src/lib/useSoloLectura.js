// Hook: ¿la ruta actual es SOLO LECTURA para el rol del usuario?
// Se usa en las pantallas para desactivar los botones de crear/editar/guardar.
import { useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { soloLectura } from './permisos'

export function useSoloLectura() {
  const { rolTenant } = useAuth()
  const { pathname } = useLocation()
  return soloLectura(rolTenant, pathname)
}
