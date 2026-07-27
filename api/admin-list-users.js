/**
 * GET /api/admin-list-users
 * Retorna TODOS los usuarios de Auth + sus perfiles + sus membresías.
 * Usa SUPABASE_SERVICE_ROLE_KEY para bypasear RLS y leer auth.users.
 * Exige sesión de superadministrador (ver _auth.js).
 */

import { requireSuperAdmin, SUPABASE_URL } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const auth = await requireSuperAdmin(req, res)
  if (!auth.ok) return

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    // 1. Todos los usuarios de Auth (paginado, máx 1000)
    const authRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000&page=1`,
      { headers }
    )
    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}))
      return res.status(500).json({ error: err.message || 'Error al leer auth.users' })
    }
    const authData = await authRes.json()
    const authUsers = authData.users || []

    // 2. Todos los perfiles (user_profiles)
    const profilesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?select=*`,
      { headers }
    )
    const profiles = profilesRes.ok ? await profilesRes.json() : []
    const profilesById = {}
    for (const p of profiles) profilesById[p.id] = p

    // 3. Todas las membresías con nombre del tenant
    const memsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_tenant_memberships?select=user_id,rol,tenants(id,nombre)`,
      { headers }
    )
    const mems = memsRes.ok ? await memsRes.json() : []
    const memsByUser = {}
    for (const m of mems) {
      if (!memsByUser[m.user_id]) memsByUser[m.user_id] = []
      memsByUser[m.user_id].push({
        id:     m.tenants?.id,
        nombre: m.tenants?.nombre,
        rol:    m.rol,
      })
    }

    // 4. Combinar: auth user + profile + membresías
    const resultado = authUsers.map(au => {
      const perfil = profilesById[au.id] || {}
      return {
        id:         au.id,
        email:      au.email,
        nombre:     perfil.nombre || au.user_metadata?.nombre || au.email,
        rol:        perfil.rol || 'sin_perfil',
        activo:     perfil.activo !== false,
        created_at: au.created_at,
        // campos extra del perfil si existen
        ...perfil,
        // membresías siempre desde la tabla
        _tenants: memsByUser[au.id] || [],
        // marcar si no tiene perfil creado
        _sin_perfil: !profilesById[au.id],
      }
    })

    return res.status(200).json({ usuarios: resultado })

  } catch (err) {
    console.error('[admin-list-users]', err)
    return res.status(500).json({ error: err.message || 'Error interno' })
  }
}
