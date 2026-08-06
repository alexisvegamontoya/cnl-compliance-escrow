import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Esta base de Supabase la comparten tres aplicaciones (compliance,
 * evaluador de riesgos y capacitación), así que `tenants` contiene sujetos
 * obligados que no son de acá. La columna app_compliance marca cuáles sí.
 */
export const APP_ID   = 'compliance'
export const APP_FLAG = 'app_compliance'

/**
 * Sujetos obligados de esta app, ordenados por nombre.
 *
 * Si la columna app_compliance todavía no existe (migración sin aplicar),
 * Postgres responde 42703 y se reintenta sin filtro: es preferible mostrar de
 * más a dejar la aplicación sin ningún sujeto obligado.
 */
export async function tenantsDeLaApp(select = '*', orden = 'nombre') {
  const filtrada = await supabase.from('tenants').select(select).eq(APP_FLAG, true).order(orden)
  if (!filtrada.error) return filtrada
  if (filtrada.error.code === '42703') {
    return supabase.from('tenants').select(select).order(orden)
  }
  return filtrada
}

/**
 * Trae TODAS las filas de una consulta, en tandas.
 *
 * PostgREST corta en 1000 filas y no avisa: la respuesta llega igual de
 * exitosa, solo que incompleta. En tablas grandes (transacciones, clientes)
 * eso hace que los conteos y los agrupamientos salgan mal en silencio.
 *
 * Recibe una FÁBRICA de consultas porque cada builder de supabase-js se
 * consume al ejecutarse y hay que construir uno nuevo por tanda. La consulta
 * debe traer un .order() estable, o la paginación puede repetir u omitir filas.
 *
 *   const { data } = await traerTodo(() =>
 *     supabase.from('transacciones').select('periodo').eq('tenant_id', id).order('id'))
 */
export async function traerTodo(fabricaConsulta, tam = 1000) {
  const filas = []
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await fabricaConsulta().range(desde, desde + tam - 1)
    if (error) return { data: null, error }
    filas.push(...(data || []))
    if (!data || data.length < tam) break
  }
  return { data: filas, error: null }
}

/** ¿Este tenant pertenece a la app? Sin la columna, no se excluye a nadie. */
export function esDeLaApp(t) {
  return !!t && t[APP_FLAG] !== false
}
