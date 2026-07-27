/**
 * DELETE /api/admin-delete-user
 * Elimina un usuario de Supabase Auth y sus registros asociados.
 * Requiere SUPABASE_SERVICE_ROLE_KEY en Vercel env vars.
 * Exige sesión de superadministrador (ver _auth.js).
 * Body: { userId: string }
 */

import { requireSuperAdmin, SUPABASE_URL } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const auth = await requireSuperAdmin(req, res)
  if (!auth.ok) return

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const { userId } = req.body || {}
  if (!userId) {
    return res.status(400).json({ error: 'Se requiere userId.' })
  }

  // Un superadmin no puede eliminarse a sí mismo: dejaría la plataforma sin acceso
  if (userId === auth.user.id) {
    return res.status(400).json({ error: 'No puede eliminar su propio usuario.' })
  }

  try {
    // 1. Eliminar membresías
    await fetch(`${SUPABASE_URL}/rest/v1/user_tenant_memberships?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    })

    // 2. Eliminar perfil
    await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    })

    // 3. Eliminar de Auth (debe ser el último paso)
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    })

    if (!authRes.ok) {
      const data = await authRes.json().catch(() => ({}))
      return res.status(400).json({ error: data.message || 'Error al eliminar de Auth' })
    }

    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('[admin-delete-user]', err)
    return res.status(500).json({ error: err.message || 'Error interno' })
  }
}
