/**
 * POST /api/admin-invite-user
 *
 * Crea un nuevo usuario en Supabase Auth (invitación por correo)
 * y registra sus membresías a uno o varios sujetos obligados.
 *
 * Requiere en Vercel → Settings → Environment Variables:
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Body:
 *   { email, nombre, tenants: [{ tenant_id, rol }] }
 */

const SUPABASE_URL = 'https://akczzwsfggzcfqyytyho.supabase.co'

async function sbFetch(path, serviceKey, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${SUPABASE_URL}${path}`, opts)
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch (_) { data = text }
  return { ok: res.ok, status: res.status, data }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada.' })
  }

  const { email, nombre, tenants } = req.body || {}

  if (!email || !nombre || !Array.isArray(tenants) || tenants.length === 0) {
    return res.status(400).json({
      error: 'Se requieren email, nombre y al menos un sujeto obligado.'
    })
  }

  try {
    // 1. Invitar al usuario vía Supabase Auth Admin API
    const inviteRes = await sbFetch('/auth/v1/invite', serviceKey, 'POST', {
      email:       email.trim(),
      data:        { nombre: nombre.trim() },
      redirect_to: 'https://aplicacion-de-cumplimiento-de-cnl.vercel.app',
    })

    if (!inviteRes.ok) {
      const msg = inviteRes.data?.msg || inviteRes.data?.message || JSON.stringify(inviteRes.data)
      if (msg?.toLowerCase().includes('already')) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico.' })
      }
      return res.status(400).json({ error: `Error al invitar: ${msg}` })
    }

    const userId = inviteRes.data?.id
    if (!userId) {
      return res.status(500).json({ error: 'No se pudo obtener el ID del usuario creado.' })
    }

    // 2. Crear perfil en user_profiles
    const profRes = await sbFetch('/rest/v1/user_profiles', serviceKey, 'POST', {
      id:     userId,
      email:  email.toLowerCase().trim(),
      nombre: nombre.trim(),
      rol:    'operador',
      activo: true,
    })
    // Ignorar error 409 (ya existe el perfil)
    if (!profRes.ok && profRes.status !== 409) {
      console.error('[admin-invite-user] user_profiles error:', profRes.data)
      // No bloqueamos — continuamos con membresías
    }

    // 3. Insertar membresías
    const memberships = tenants.map(t => ({
      user_id:   userId,
      tenant_id: t.tenant_id,
      rol:       t.rol || 'operador',
      activo:    true,
    }))

    const memRes = await sbFetch(
      '/rest/v1/user_tenant_memberships?on_conflict=user_id,tenant_id',
      serviceKey, 'POST', memberships
    )

    if (!memRes.ok) {
      console.error('[admin-invite-user] memberships error:', memRes.data)
      return res.status(500).json({
        error: 'Usuario creado pero falló la asignación de sujetos obligados: ' +
               (memRes.data?.message || JSON.stringify(memRes.data))
      })
    }

    return res.status(200).json({
      ok:      true,
      userId,
      message: `Invitación enviada a ${email}. El usuario recibirá un correo para establecer su contraseña.`
    })

  } catch (err) {
    console.error('[admin-invite-user] excepción:', err)
    return res.status(500).json({ error: err.message || 'Error interno del servidor' })
  }
}
