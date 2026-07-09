/**
 * GET /api/admin-list-users
 * Retorna TODOS los user_profiles + sus membresías de tenant.
 * Usa SUPABASE_SERVICE_ROLE_KEY para bypassear RLS.
 * Solo debe llamarse desde el frontend cuando isSuperAdmin === true.
 */

const SUPABASE_URL = 'https://akczzwsfggzcfqyytyho.supabase.co'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada.' })
  }

  try {
    // 1. Todos los perfiles
    const profilesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?select=*&order=created_at.asc`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    )
    if (!profilesRes.ok) {
      const err = await profilesRes.json().catch(() => ({}))
      return res.status(500).json({ error: err.message || 'Error al leer user_profiles' })
    }
    const profiles = await profilesRes.json()

    // 2. Todas las membresías con nombre del tenant
    const memsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_tenant_memberships?select=user_id,rol,tenant_id,tenants(id,nombre)`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Accept': 'application/json',
        },
      }
    )
    const mems = memsRes.ok ? await memsRes.json() : []

    // 3. Agrupar membresías por user_id
    const memsByUser = {}
    for (const m of mems) {
      if (!memsByUser[m.user_id]) memsByUser[m.user_id] = []
      memsByUser[m.user_id].push({
        id:     m.tenants?.id,
        nombre: m.tenants?.nombre,
        rol:    m.rol,
      })
    }

    // 4. Enriquecer perfiles
    const result = profiles.map(p => ({
      ...p,
      _tenants: memsByUser[p.id] || [],
    }))

    return res.status(200).json({ usuarios: result })

  } catch (err) {
    console.error('[admin-list-users]', err)
    return res.status(500).json({ error: err.message || 'Error interno' })
  }
}
