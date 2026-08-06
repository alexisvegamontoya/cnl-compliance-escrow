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

/** Consulta de tenants ya acotada a los sujetos obligados de esta app. */
export function tenantsDeLaApp(select = '*') {
  return supabase.from('tenants').select(select).eq(APP_FLAG, true)
}
