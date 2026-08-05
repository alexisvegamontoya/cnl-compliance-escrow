/**
 * CatalogoDocumentalContext.jsx
 * Carga los catálogos de documentos visibles para el usuario y los distribuye a
 * todo el módulo de clientes (checklist, calificación de cumplimiento, plantilla
 * de carga masiva y expediente imprimible).
 *
 * El catálogo estándar SUGEF 13-19 vive en src/lib/checklistDocumental.js; la
 * tabla `catalogo_documentos` guarda solo los ajustes de cada sujeto obligado
 * (sql/add_catalogo_documentos_tenant.sql).
 *
 * Se cargan en UNA consulta todas las filas que la RLS deja ver — las del propio
 * sujeto obligado, o las de todos si es superadmin — y se indexan por tenant.
 * Así una pantalla que mezcla clientes de varios sujetos obligados (la vista
 * consolidada del superadmin) califica a cada cliente con el catálogo de SU
 * sujeto obligado, y ningún catálogo ajeno llega tarde ni parpadea.
 *
 * Si la migración todavía no se ejecutó, `disponible` queda en false y la app
 * sigue funcionando con el catálogo estándar.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import { CATALOGO_ESTANDAR, resolverCatalogo } from './checklistDocumental'

const CatalogoDocumentalContext = createContext(null)

const VACIO = {
  catalogo:          CATALOGO_ESTANDAR,
  catalogoDeTenant:  () => CATALOGO_ESTANDAR,
  personalizaciones: [],
  loading:           false,
  disponible:        true,
  error:             null,
  tenantId:          null,
  recargar:          async () => {},
}

export function CatalogoDocumentalProvider({ children }) {
  const { session, tenant } = useAuth()
  const userId   = session?.user?.id || null
  const tenantId = tenant?.id || null

  const [filas, setFilas]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [disponible, setDisponible] = useState(true)
  const [error, setError]           = useState(null)

  const recargar = useCallback(async () => {
    if (!userId) { setFilas([]); return }
    setLoading(true)
    // Sin filtro de tenant: la RLS ya limita las filas a los sujetos obligados
    // del usuario (todas, si es superadmin). Solo son las diferencias contra el
    // catálogo estándar, así que el volumen es mínimo.
    const { data, error } = await supabase.from('catalogo_documentos').select('*')

    if (error) {
      // Tabla inexistente (migración pendiente) → catálogo estándar, sin ruido
      setDisponible(false)
      setError(error.message)
      setFilas([])
    } else {
      setDisponible(true)
      setError(null)
      setFilas(data || [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { recargar() }, [recargar])

  // Catálogo ya resuelto de cada sujeto obligado que tenga personalizaciones
  const porTenant = useMemo(() => {
    const agrupadas = new Map()
    filas.forEach(f => {
      if (!agrupadas.has(f.tenant_id)) agrupadas.set(f.tenant_id, [])
      agrupadas.get(f.tenant_id).push(f)
    })
    const catalogos = new Map()
    agrupadas.forEach((fs, id) => catalogos.set(id, resolverCatalogo(fs)))
    return catalogos
  }, [filas])

  /** Catálogo de un sujeto obligado. Sin personalizaciones → el estándar. */
  const catalogoDeTenant = useCallback(
    (id) => (id && porTenant.get(id)) || CATALOGO_ESTANDAR,
    [porTenant]
  )

  const catalogo = useMemo(() => catalogoDeTenant(tenantId), [catalogoDeTenant, tenantId])

  // Filas del sujeto obligado activo — es lo que edita ConfigDocumentosModal
  const personalizaciones = useMemo(
    () => filas.filter(f => f.tenant_id === tenantId),
    [filas, tenantId]
  )

  const value = useMemo(
    () => ({ catalogo, catalogoDeTenant, personalizaciones, loading, disponible, error, tenantId, recargar }),
    [catalogo, catalogoDeTenant, personalizaciones, loading, disponible, error, tenantId, recargar]
  )

  return (
    <CatalogoDocumentalContext.Provider value={value}>
      {children}
    </CatalogoDocumentalContext.Provider>
  )
}

/**
 * Catálogo de documentos vigente para el sujeto obligado activo.
 * Fuera del provider devuelve el catálogo estándar, de modo que ningún
 * componente se rompe por usarse aislado.
 */
export function useCatalogoDocumental() {
  return useContext(CatalogoDocumentalContext) || VACIO
}

/**
 * Catálogo de un sujeto obligado concreto — para el superadmin, que puede estar
 * consultando clientes de un sujeto obligado distinto al que tiene activo.
 * Sin tenant indicado devuelve el catálogo estándar, nunca el del activo.
 */
export function useCatalogoDeTenant(tenantId) {
  const { catalogoDeTenant } = useCatalogoDocumental()
  return useMemo(() => catalogoDeTenant(tenantId), [catalogoDeTenant, tenantId])
}

/**
 * Resolutor `(cliente) => catálogo` para las pantallas que listan clientes de
 * varios sujetos obligados a la vez: cada cliente se califica con el catálogo
 * que exige SU sujeto obligado, no el del que esté activo en la sesión.
 */
export function useCatalogoPorCliente() {
  const { catalogoDeTenant } = useCatalogoDocumental()
  return useCallback((cliente) => catalogoDeTenant(cliente?.tenant_id), [catalogoDeTenant])
}
