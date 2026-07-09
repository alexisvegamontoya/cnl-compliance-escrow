import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]            = useState(null)
  const [profile, setProfile]            = useState(null)
  const [tenant, setTenant]              = useState(null)
  const [tenantsDisponibles, setTenants] = useState([])
  const [loading, setLoading]            = useState(true)
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false)

  useEffect(() => {
    // ── Leer la URL ANTES de que Supabase la borre al procesar el token ──
    const hash   = window.location.hash
    const search = window.location.search
    if (hash.includes('type=invite') || search.includes('type=invite')) {
      setNeedsPasswordSetup(true)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else {
        setProfile(null)
        setTenant(null)
        setTenants([])
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    try {
      const [{ data: prof }, { data: memberships }] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', userId).single(),
        supabase.from('user_tenant_memberships').select('*, tenants(*)').eq('user_id', userId).eq('activo', true),
      ])

      setProfile(prof)

      const esSuperAdmin = prof?.rol === 'superadmin'

      if (esSuperAdmin) {
        // Superadmin: cargar TODOS los tenants para navegar como cualquiera
        const { data: allTenants } = await supabase
          .from('tenants').select('*').order('nombre')
        if (allTenants && allTenants.length > 0) {
          const lista = allTenants.map(t => ({ ...t, rol_tenant: 'superadmin' }))
          setTenants(lista)
          const saved = localStorage.getItem('cnl_tenant_activo')
          const encontrado = lista.find(t => t.id === saved)
          setTenant(encontrado || lista[0])
        }
      } else if (memberships && memberships.length > 0) {
        const lista = memberships
          .filter(m => m.tenants)
          .map(m => ({ ...m.tenants, rol_tenant: m.rol }))
        setTenants(lista)
        const saved = localStorage.getItem('cnl_tenant_activo')
        const encontrado = lista.find(t => t.id === saved)
        setTenant(encontrado || lista[0])
      } else if (prof?.tenant_id) {
        const { data: t } = await supabase
          .from('tenants').select('*').eq('id', prof.tenant_id).single()
        if (t) {
          setTenant(t)
          setTenants([t])
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const cambiarTenant = useCallback((tenantId) => {
    const t = tenantsDisponibles.find(t => t.id === tenantId)
    if (t) {
      setTenant(t)
      localStorage.setItem('cnl_tenant_activo', tenantId)
    }
  }, [tenantsDisponibles])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    localStorage.removeItem('cnl_tenant_activo')
    await supabase.auth.signOut()
  }

  const isSuperAdmin = profile?.rol === 'superadmin'
  const isAdmin = isSuperAdmin || profile?.rol === 'admin_tenant' ||
    tenantsDisponibles.some(t => t.id === tenant?.id && t.rol_tenant === 'admin_tenant')

  return (
    <AuthContext.Provider value={{
      session, profile, tenant, tenantsDisponibles, cambiarTenant,
      loading, signIn, signOut, isSuperAdmin, isAdmin,
      needsPasswordSetup, setNeedsPasswordSetup,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
