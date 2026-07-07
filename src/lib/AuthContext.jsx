import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]               = useState(null)
  const [profile, setProfile]               = useState(null)
  const [tenant, setTenant]                 = useState(null)          // tenant activo
  const [tenantsDisponibles, setTenants]    = useState([])            // todos los tenants del usuario
  const [loading, setLoading]               = useState(true)
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false)

  // Detectar si el link actual es de invitación (hash o query param)
  function isInviteUrl() {
    const hash = window.location.hash
    const search = window.location.search
    return hash.includes('type=invite') || search.includes('type=invite')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      // Detectar invitación: evento SIGNED_IN con URL de invite
      if (event === 'SIGNED_IN' && isInviteUrl()) {
        setNeedsPasswordSetup(true)
      }
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
      // Cargar perfil y membresías en paralelo
      const [{ data: prof }, { data: memberships }] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        supabase
          .from('user_tenant_memberships')
          .select('*, tenants(*)')
          .eq('user_id', userId)
          .eq('activo', true),
      ])

      setProfile(prof)

      const esSuperAdmin = prof?.rol === 'superadmin'

      if (esSuperAdmin) {
        // Superadmin: cargar TODOS los tenants para poder navegar como cualquiera
        const { data: allTenants } = await supabase
          .from('tenants')
          .select('*')
          .order('nombre')
        if (allTenants && allTenants.length > 0) {
          const lista = allTenants.map(t => ({ ...t, rol_tenant: 'superadmin' }))
          setTenants(lista)
          const saved = localStorage.getItem('cnl_tenant_activo')
          const encontrado = lista.find(t => t.id === saved)
          setTenant(encontrado || lista[0])
        }
      } else if (memberships && memberships.length > 0) {
        // Construir lista de tenants disponibles, inyectando el rol de membresía
        const lista = memberships
          .filter(m => m.tenants)
          .map(m => ({ ...m.tenants, rol_tenant: m.rol }))

        setTenants(lista)

        // Seleccionar tenant activo: preferir el guardado en localStorage
        const saved = localStorage.getItem('cnl_tenant_activo')
        const encontrado = lista.find(t => t.id === saved)
        setTenant(encontrado || lista[0])

      } else if (prof?.tenant_id) {
        // Fallback legacy: usuario sin membresías usa tenant_id de su perfil
        const { data: t } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', prof.tenant_id)
          .single()
        if (t) {
          setTenant(t)
          setTenants([t])
        }
      }
    } finally {
      setLoading(false)
    }
  }

  // Cambiar de tenant activo (para usuarios con múltiples membresías)
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
  const isAdmin  