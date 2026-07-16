/**
 * POST /api/admin-invite-user
 *
 * Crea un nuevo usuario en Supabase Auth (invitación por correo)
 * y registra sus membresías a uno o varios sujetos obligados.
 *
 * Requiere en Vercel → Settings → Environment Variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Body:
 *   { email, nombre, tenants: [{ tenant_id, rol }] }
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = process.env.SUPABASE_URL      || 'https://akczzwsfggzcfqyytyho.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''

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

  // Cliente admin con service_role (solo server-side)
  const supabaseAdmin = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  try {
    // 1. Invitar al usuario vía SDK oficial
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.trim(),
      {
        data:        { nombre: nombre.trim() },
        redirectTo:  'https://cnl-compliance-app.vercel.app',
      }
    )

    if (inviteError) {
      const msg = inviteError.message || JSON.stringify(inviteError)
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico.' })
      }
      return res.status(400).json({ error: `Error al invitar: ${msg}` })
    }

    const userId = inviteData?.user?.id
    if (!userId) {
      return res.status(500).json({ error: 'No se pudo obtener el ID del usuario creado.' })
    }

    // 2. Crear perfil en user_profiles
    const { error: profError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id:     userId,
        email:  email.toLowerCase().trim(),
        nombre: nombre.trim(),
        rol:    'operador',
        activo: true,
      }, { onConflict: 'id', ignoreDuplicates: false })

    if (profError) {
      console.error('[admin-invite-user] user_profiles error:', profError)
      // No bloqueamos — continuamos con membresías
    }

    // 3. Insertar membresías
    const memberships = tenants.map(t => ({
      user_id:   userId,
      tenant_id: t.tenant_id,
      rol:       t.rol || 'operador',
      activo:    true,
    }))

    const { error: memError } = await supabaseAdmin
      .from('user_tenant_memberships')
      .upsert(memberships, { onConflict: 'user_id,tenant_id', ignoreDuplicates: false })

    if (memError) {
      console.error('[admin-invite-user] memberships error:', memError)
      return res.status(500).json({
        error: 'Usuario creado pero falló la asignación de sujetos obligados: ' + memError.message
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
