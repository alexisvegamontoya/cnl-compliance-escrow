/**
 * POST /api/admin-set-password
 *
 * Le fija una contraseña nueva a cualquier usuario. Es la vía para cuando
 * alguien pierde el acceso: los hashes no se pueden leer de vuelta, así que
 * "recuperar" la contraseña siempre significa reemplazarla.
 *
 * Solo superadmin. La comprobación va acá y no en el navegador: esta función
 * corre con la service role key, que salta la RLS, y la URL es pública.
 *
 * Body:
 *   { userId, password, forzarCambio? }
 *
 * forzarCambio (por defecto true) levanta el flag must_change_password, que
 * hace que la app le pida al usuario establecer una contraseña personal en el
 * siguiente ingreso (src/pages/CambiarClaveObligatoria.jsx).
 */

import { requireSuperAdmin } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const auth = await requireSuperAdmin(req, res)
  if (!auth.ok) return

  const supabaseAdmin = auth.admin
  const { userId, password, forzarCambio = true } = req.body || {}

  if (!userId || !password) {
    return res.status(400).json({ error: 'Se requieren userId y password.' })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' })
  }

  try {
    // El usuario tiene que existir antes de tocar nada, para poder devolver un
    // 404 claro en vez del error genérico de la API de administración.
    const { data: existente, error: getError } =
      await supabaseAdmin.auth.admin.getUserById(userId)

    if (getError || !existente?.user) {
      return res.status(404).json({ error: 'El usuario no existe en el sistema de autenticación.' })
    }

    // user_metadata se reemplaza completo en cada actualización, así que hay
    // que reenviar lo que ya tenía o se pierde el nombre y demás.
    const metadata = {
      ...(existente.user.user_metadata || {}),
      must_change_password: forzarCambio === true,
    }

    const { error: updError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: metadata,
    })

    if (updError) {
      return res.status(400).json({
        error: updError.message || 'No se pudo actualizar la contraseña.',
      })
    }

    const { data: perfil } = await supabaseAdmin
      .from('user_profiles')
      .select('email, nombre')
      .eq('id', userId)
      .maybeSingle()

    const quien = perfil?.nombre || perfil?.email || existente.user.email || 'el usuario'

    console.log(
      `[admin-set-password] ${auth.user.email} cambió la contraseña de ${existente.user.email}`
    )

    return res.status(200).json({
      ok: true,
      message: forzarCambio
        ? `Contraseña de ${quien} actualizada. Se le pedirá cambiarla en su próximo ingreso.`
        : `Contraseña de ${quien} actualizada.`,
    })
  } catch (err) {
    console.error('[admin-set-password] excepción:', err)
    return res.status(500).json({ error: err.message || 'Error interno del servidor' })
  }
}
