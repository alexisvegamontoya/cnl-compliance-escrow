/**
 * POST /api/admin-invite-user
 *
 * Crea un nuevo usuario en Supabase Auth (invitación por correo)
 * y registra sus membresías a uno o varios sujetos obligados.
 *
 * Requiere variable de entorno en Vercel:
 *   SUPABASE_SERVICE_ROLE_KEY  (NUNCA exponerla en el frontend)
 *
 * Body esperado:
 *   {
 *     email:    string,
 *     nombre:   string,
 *     tenants:  [{ tenant_id: string, rol: 'operador' | 'admin_tenant' }]
 *   }
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { email, nombre, tenants } = req.body || {}

  // Validaciones básicas
  if (!email || !nombre || !Array.isArray(tenants) || tenants.length === 0) {
    return res.status(400).json({
      error: 'Se requieren email, nombre y al menos un sujeto obligado.'
    })
  }

  try {
    // 1. Invitar al usuario vía Supabase Auth
    //    Supabase enviará un correo con link para establecer contraseña.
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://cnl-compliance-app.vercel.app'}/login` }
    )

    if (authErr) {
      // Si el usuario ya existe en Auth, intentar recuperarlo
      if (authErr.message?.includes('already been registered')) {
        return res.status(409).json({
          error: 'Ya existe un usuario con ese correo electrónico.'
        })
      }
      throw authErr
    }

    const userId = authData.user.id

    // 2. Crear / actualizar perfil en user_profiles
    const { error: profErr } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id:     userId,
        email:  email.toLowerCase().trim(),
        nombre: nombre.trim(),
        rol:    'operador',   // rol de sistema; no superadmin
        activo: true,
      }, { onConflict: 'id' })

    if (profErr) throw profErr

    // 3. Insertar membresías a los tenants seleccionados
    const memberships = tenants.map(t => ({
      user_id:   userId,
      tenant_id: t.tenant_id,
      rol:       t.rol || 'operador',
      activo:    true,
    }))

    const { error: memErr } = await supabaseAdmin
      .from('user_tenant_memberships')
      .upsert(memberships, { onConflict: 'user_id,tenant_id' })

    if (memErr) throw memErr

    return res.status(200).json({
      ok:     true,
      userId,
      message: `Invitación enviada a ${email}. El usuario recibirá un correo para establecer su contraseña.`
    })

  } catch (err) {
    console.error('[admin-invite-user]', err)
    return res.status(500).json({
      error: err.message || 'Error interno del servidor'
    })
  }
}
