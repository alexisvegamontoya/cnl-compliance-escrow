import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, tenantsDeLaApp, APP_ID } from './supabase'

const AuthContext = createContext(null)

// Roles que DEBEN tener MFA activo y usar AAL2
const ROLES_MFA_OBLIGATORIO = ['superadmin', 'admin_tenant']

export function AuthProvider({ children }) {
  const [session, setSession]            = useState(null)
  const [profile, setProfile]            = useState(null)
  const [tenant, setTenant]              = useState(null)
  const [tenantsDisponibles, setTenants] = useState([])
  const [loading, setLoading]            = useState(true)
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  // MFA enforcement para roles admin
  const [needsMFAEnroll, setNeedsMFAEnroll]       = useState(false) // sin MFA inscrito
  const [needsMFAChallenge, setNeedsMFAChallenge] = useState(false) // inscrito pero sesión AAL1
  // Usuario válido en la base compartida, pero sin habilitación para esta app
  const [sinAccesoApp, setSinAccesoApp] = useState(false)

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

      // ── Contraseña provisional: forzar cambio ─────────────────────────
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser?.user_metadata?.must_change_password === true) {
        setMustChangePassword(true)
      } else {
        setMustChangePassword(false)
      }

      // ── MFA enforcement para roles admin ──────────────────────────────
      const rolEsAdmin = ROLES_MFA_OBLIGATORIO.includes(prof?.rol)
      if (rolEsAdmin) {
        try {
          const { data: factors } = await supabase.auth.mfa.listFactors()
          const tieneTotp = factors?.totp?.some(f => f.status === 'verified')

          if (!tieneTotp) {
            // Admin sin MFA → forzar inscripción
            setNeedsMFAEnroll(true)
            setNeedsMFAChallenge(false)
          } else {
            // Tiene MFA pero puede estar en sesión AAL1 (sólo contraseña)
            const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
            if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
              setNeedsMFAChallenge(true)
              setNeedsMFAEnroll(false)
            } else {
              // AAL2 OK → limpiar flags
              setNeedsMFAEnroll(false)
              setNeedsMFAChallenge(false)
            }
          }
        } catch {
          // Si falla la consulta MFA no bloqueamos al usuario
        }
      } else {
        setNeedsMFAEnroll(false)
        setNeedsMFAChallenge(false)
      }

      const esSuperAdmin = prof?.rol === 'superadmin'

      // ── Habilitación para esta aplicación ─────────────────────────────
      // La base la comparten compliance, evaluador de riesgos y capacitación.
      // Un usuario dado de alta solo en otra app no debe entrar acá.
      // Si la tabla todavía no existe (migración sin aplicar) no se bloquea
      // a nadie: el error deja el acceso abierto a propósito.
      const { data: acceso, error: accesoErr } = await supabase
        .from('user_app_access')
        .select('app')
        .eq('user_id', userId)
        .eq('app', APP_ID)
        .eq('activo', true)
        .maybeSingle()
      setSinAccesoApp(!accesoErr && !esSuperAdmin && !acceso)

      if (esSuperAdmin) {
        // Superadmin: cargar TODOS los tenants para navegar como cualquiera
        const { data: allTenants } = await tenantsDeLaApp('*').order('nombre')
        if (allTenants && allTenants.length > 0) {
          const lista = allTenants.map(t => ({ ...t, rol_tenant: 'superadmin' }))
          setTenants(lista)
          const saved = localStorage.getItem('cnl_tenant_activo')
          const encontrado = lista.find(t => t.id === saved)
          setTenant(encontrado || lista[0])
        }
      } else if (memberships && memberships.length > 0) {
        // La base es compartida con las otras apps: hay membresías a sujetos
        // obligados que no pertenecen a compliance y no deben aparecer acá.
        const lista = memberships
          .filter(m => m.tenants?.app_compliance)
          .map(m => ({ ...m.tenants, rol_tenant: m.rol }))
        setTenants(lista)
        const saved = localStorage.getItem('cnl_tenant_activo')
        const encontrado = lista.find(t => t.id === saved)
        setTenant(encontrado || lista[0] || null)
      } else if (prof?.tenant_id) {
        const { data: t } = await supabase
          .from('tenants').select('*').eq('id', prof.tenant_id)
          .eq('app_compliance', true).maybeSingle()
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
      mustChangePassword, setMustChangePassword,
      needsMFAEnroll, setNeedsMFAEnroll,
      needsMFAChallenge, setNeedsMFAChallenge,
      sinAccesoApp,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
