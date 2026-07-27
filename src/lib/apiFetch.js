/**
 * apiFetch.js — llamadas a las funciones de /api con la sesión del usuario.
 *
 * Las funciones serverless usan la service role key (saltan RLS), así que
 * verifican la identidad del solicitante con el token que se manda acá.
 * Toda llamada a /api/* debe pasar por este helper.
 */
import { supabase } from './supabase'

/**
 * fetch hacia /api/* con el Authorization: Bearer <token> de la sesión activa.
 * @param {string} ruta   ej. '/api/admin-list-users'
 * @param {RequestInit} opciones
 */
export async function apiFetch(ruta, opciones = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token

  if (!token) {
    throw new Error('Su sesión expiró. Vuelva a iniciar sesión.')
  }

  const headers = {
    ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
    ...opciones.headers,
    Authorization: `Bearer ${token}`,
  }

  return fetch(ruta, { ...opciones, headers })
}

/**
 * Igual que apiFetch pero devuelve el JSON ya parseado y lanza en caso de error,
 * con el mensaje que envía el servidor.
 */
export async function apiJson(ruta, opciones = {}) {
  const res = await apiFetch(ruta, opciones)

  let json = {}
  try {
    json = await res.json()
  } catch {
    // respuesta sin cuerpo JSON (p. ej. 502 del proxy)
  }

  if (!res.ok) {
    throw new Error(json.error || `Error ${res.status} al llamar ${ruta}`)
  }
  return json
}
