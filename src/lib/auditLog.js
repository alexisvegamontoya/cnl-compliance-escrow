import { supabase } from './supabase'

/**
 * Registra una acción en el audit_log
 * @param {Object} params
 * @param {string} params.accion - 'crear' | 'editar' | 'eliminar' | 'exportar' | 'login' | etc
 * @param {string} [params.tabla] - tabla afectada
 * @param {string} [params.registro_id] - UUID del registro afectado
 * @param {string} [params.descripcion] - descripción legible
 * @param {string} [params.tenant_id]
 */
export async function logAudit({ accion, tabla, registro_id, descripcion, tenant_id }) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Obtener tenant_id si no se pasó
    let tId = tenant_id
    if (!tId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      tId = profile?.tenant_id
    }

    await supabase.from('audit_log').insert({
      tenant_id:   tId,
      user_id:     user.id,
      user_email:  user.email,
      accion,
      tabla,
      registro_id: registro_id ? String(registro_id) : null,
      descripcion,
    })
  } catch (_) {
    // No interrumpir el flujo principal si el log falla
  }
}
