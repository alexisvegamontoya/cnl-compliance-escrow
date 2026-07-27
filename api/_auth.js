/**
 * _auth.js — verificación de identidad para las funciones serverless.
 *
 * Los archivos que empiezan con "_" no se publican como ruta en Vercel, así que
 * este módulo solo es accesible desde las otras funciones de api/.
 *
 * Toda función de api/ usa la SERVICE_ROLE_KEY, que salta la RLS. Por eso la
 * identidad del solicitante tiene que comprobarse acá: el endpoint es una URL
 * pública y cualquier validación hecha en el navegador es solo cosmética.
 *
 * Uso:
 *   import { requireSesion, requireSuperAdmin, requireCronOSesion } from './_auth.js'
 *
 *   const auth = await requireSuperAdmin(req, res)
 *   if (!auth.ok) return            // el helper ya respondió 401/403
 *   // auth.user, auth.perfil disponibles
 */

import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://akczzwsfggzcfqyytyho.supabase.co'

/** Cliente con service role — solo para uso interno de las funciones. */
export function clienteAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Extrae el token del header Authorization: Bearer <token>. */
function tokenDe(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null
}

/**
 * Valida la sesión del solicitante.
 * @returns {{ok: true, user, perfil, admin}} o {{ok: false}} tras responder al cliente.
 */
export async function requireSesion(req, res) {
  const admin = clienteAdmin()
  if (!admin) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada.' })
    return { ok: false }
  }

  const token = tokenDe(req)
  if (!token) {
    res.status(401).json({ error: 'No autenticado.' })
    return { ok: false }
  }

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) {
    res.status(401).json({ error: 'Sesión inválida o expirada.' })
    return { ok: false }
  }

  const { data: perfil } = await admin
    .from('user_profiles')
    .select('id, rol, activo')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!perfil || perfil.activo === false) {
    res.status(403).json({ error: 'Usuario sin perfil activo.' })
    return { ok: false }
  }

  return { ok: true, user: data.user, perfil, admin }
}

/** Igual que requireSesion, pero además exige rol superadmin. */
export async function requireSuperAdmin(req, res) {
  const auth = await requireSesion(req, res)
  if (!auth.ok) return auth

  if (auth.perfil.rol !== 'superadmin') {
    res.status(403).json({ error: 'Requiere permisos de superadministrador.' })
    return { ok: false }
  }
  return auth
}

/** Igual que requireSesion, pero exige superadmin o admin de sujeto obligado. */
export async function requireAdmin(req, res) {
  const auth = await requireSesion(req, res)
  if (!auth.ok) return auth

  if (!['superadmin', 'admin_tenant'].includes(auth.perfil.rol)) {
    res.status(403).json({ error: 'Requiere permisos de administrador.' })
    return { ok: false }
  }
  return auth
}

/**
 * Para endpoints que corren por cron y también a demanda desde la app.
 * Acepta el CRON_SECRET de Vercel o una sesión de usuario válida.
 */
export async function requireCronOSesion(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && tokenDe(req) === secret) {
    return { ok: true, esCron: true, admin: clienteAdmin() }
  }
  return await requireSesion(req, res)
}
