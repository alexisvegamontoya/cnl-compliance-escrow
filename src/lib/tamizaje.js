// Tamizaje de listas internacionales (ONU/OFAC/PEP/…) reutilizable.
// Usa el mismo RPC y umbrales que la Consulta PEP (0.85 = coincidencia, 0.65 = revisar).
import { supabase } from './supabase'

export async function tamizarPersona(nombre, identificacion) {
  const { data, error } = await supabase.rpc('buscar_en_listas', {
    p_nombre: String(nombre || '').trim(),
    p_identificacion: (identificacion || '').toString().trim() || null,
  })
  if (error) throw error
  const res = data || []
  const coincidencias = res.filter(r => (r.similitud || 0) >= 0.65)
  const hayAlerta = coincidencias.some(r => (r.similitud || 0) >= 0.85)
  const hayPEP = coincidencias.some(r => r.fuente === 'ICD_CR_PEP' || r.tipo_lista === 'pep')
  const estado_listas = hayAlerta ? 'alerta' : coincidencias.length > 0 ? 'revisar' : 'verificado'
  return { res, coincidencias, hayAlerta, hayPEP, estado_listas }
}

// Etiqueta legible del estado de listas.
export const ETIQUETA_LISTAS = {
  alerta: 'Coincidencia en listas',
  revisar: 'Posible coincidencia — revisar',
  verificado: 'Sin coincidencias',
}
