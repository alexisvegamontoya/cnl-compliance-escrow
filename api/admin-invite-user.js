/**
 * POST /api/admin-invite-user
 *
 * Crea un nuevo usuario en Supabase Auth con contraseña provisional
 * y registra sus membresías a uno o varios sujetos obligados.
 * El usuario deberá cambiar su contraseña al primer ingreso.
 *
 * Requiere en Vercel → Settings → Environment Variables:
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Body:
 *   { email, nombre, password, tenants: [{ tenant_id, rol }] }
 */

import { requireSuperAdmin, SUPABASE_URL } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const auth = await requireSuperAdmin(req, res)
  if (!auth.ok) return

  const supabaseAdmin = auth.admin
  const { email, nombre, password, tenants } = req.body || {}

  if (!email || !nombre || !password) {
    return res.status(400).json({ error: 'Se requieren email, nombre y contraseña provisional.' })
  }
  if (!Array.isArray(tenants) || tenants.length === 0) {
    return res.status(400).json({ error: 'Seleccione al menos un sujeto obligado.' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña provisional debe tener al menos 6 caracteres.' })
  }

  try {
    // 1. Crear usuario con contraseña provisional y flag de cambio obligatorio
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email:          email.trim(),
      password:       password,
      email_confirm:  true,           // confirmar email automáticamente
      user_metadata:  {
        nombre:               nombre.trim(),
        must_change_password: true,   // flag para forzar cambio al primer login
      },
    })

    if (createError) {
      const msg = createError.message || JSON.stringify(createError)
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico.' })
      }
      return res.status(400).json({ error: `Error al crear usuario: ${msg}` })
    }

    const userId = created?.user?.id
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
      }, { onConflict: 'id' })

    // Sin perfil el usuario puede iniciar sesión pero /api lo rechaza con
    // "Usuario sin perfil activo", así que se deshace la creación en Auth en vez
    // de dejar la cuenta a medias.
    if (profError) {
      console.error('[admin-invite-user] user_profiles error:', profError)
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
      return res.status(500).json({
        error: 'No se pudo crear el perfil del usuario: ' + profError.message,
      })
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
      .upsert(memberships, { onConflict: 'user_id,tenant_id' })

    if (memError) {
      console.error('[admin-invite-user] memberships error:', memError)
      return res.status(500).json({
        error: 'Usuario creado pero falló la asignación de sujetos obligados: ' + memError.message
      })
    }

    // 4. Habilitar al usuario en esta aplicación. La base la comparten
    //    compliance, evaluador de riesgos y capacitación; sin esta fila la
    //    cuenta existe pero no entra acá. No es bloqueante: si la migración
    //    todavía no se aplicó, el alta igual se completa.
    const { error: accesoError } = await supabaseAdmin
      .from('user_app_access')
      .upsert({ user_id: userId, app: 'compliance', activo: true },
              { onConflict: 'user_id,app' })
    if (accesoError) {
      console.error('[admin-invite-user] user_app_access error:', accesoError)
    }

    return res.status(200).json({
      ok:      true,
      userId,
      message: `Usuario ${email} creado correctamente. Puede ingresar con la contraseña provisional asignada.`
    })

  } catch (err) {
    console.error('[admin-invite-user] excepción:', err)
    return res.status(500).json({ error: err.message || 'Error interno del servidor' })
  }
}
