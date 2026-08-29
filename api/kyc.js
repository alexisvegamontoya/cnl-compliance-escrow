/**
 * api/kyc.js — Backend del portal público de Recolección KYC.
 *
 * El cliente NO tiene sesión: todo se valida por el `token` de la solicitud.
 * Usa el service role (salta RLS) y por eso la identidad se comprueba acá.
 *
 *   GET  /api/kyc?token=...            → configuración + datos + documentos
 *   POST /api/kyc { token, action }    → guardar | upload-url | registrar-doc | enviar
 */
import { clienteAdmin } from './_auth.js'

async function cargarSolicitud(admin, token) {
  if (!token) return { error: 'Falta el token.', code: 400 }
  const { data: sol } = await admin
    .from('solicitudes_kyc')
    .select('*, tenants(nombre, actividad_apnfd, clase_dato)')
    .eq('token', token)
    .maybeSingle()
  if (!sol) return { error: 'Enlace no válido.', code: 404 }
  if (sol.vence_en && new Date(sol.vence_en) < new Date()) return { error: 'El enlace venció. Solicite uno nuevo.', code: 410 }
  if (sol.estado === 'aprobada') return { error: 'Esta solicitud ya fue procesada.', code: 409 }
  return { sol }
}

export default async function handler(req, res) {
  const admin = clienteAdmin()
  if (!admin) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada.' })

  const token = req.method === 'GET' ? req.query?.token : req.body?.token
  const { sol, error, code } = await cargarSolicitud(admin, token)
  if (error) return res.status(code).json({ error })

  // ── GET: configuración del portal ──
  if (req.method === 'GET') {
    const [{ data: docs }, { data: machotes }] = await Promise.all([
      admin.from('solicitudes_kyc_documentos').select('doc_id, nombre_archivo, subido_en').eq('solicitud_id', sol.id),
      admin.from('machotes').select('id, clave, nombre, archivo_url, sector').eq('activo', true),
    ])
    return res.status(200).json({
      tenant:      sol.tenants?.nombre || '',
      tipoPersona: sol.tipo_persona,
      sector:      sol.sector || null,
      estado:      sol.estado,
      nombre:      sol.nombre_cliente || '',
      datos:       sol.datos || {},
      docs:        docs || [],
      machotes:    (machotes || []).filter(m => !m.sector || m.sector === sol.sector),
      preguntasExtra:  sol.preguntas_extra || [],
      documentosExtra: sol.documentos_extra || [],
      venceEn:     sol.vence_en,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' })
  if (sol.estado === 'recibida') return res.status(409).json({ error: 'Ya enviaste tu información. Gracias.' })

  const action = req.body?.action

  if (action === 'guardar') {
    const { error: e } = await admin.from('solicitudes_kyc')
      .update({ datos: req.body.datos || {}, estado: 'en_proceso' }).eq('id', sol.id)
    if (e) return res.status(500).json({ error: e.message })
    return res.status(200).json({ ok: true })
  }

  if (action === 'upload-url') {
    const docId = String(req.body.docId || 'doc').replace(/[^a-z0-9_-]/gi, '_')
    const ext = (String(req.body.filename || '').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${sol.tenant_id}/${sol.id}/${docId}-${Date.now()}.${ext}`
    const { data, error: e } = await admin.storage.from('kyc').createSignedUploadUrl(path)
    if (e) return res.status(500).json({ error: e.message })
    return res.status(200).json({ path, token: data.token, signedUrl: data.signedUrl })
  }

  if (action === 'registrar-doc') {
    const { docId, etiqueta, path, filename } = req.body
    if (!path) return res.status(400).json({ error: 'Falta la ruta del archivo.' })
    // Un solo archivo por doc_id: si ya había, se reemplaza el registro (el archivo viejo queda huérfano y se limpia luego).
    await admin.from('solicitudes_kyc_documentos').delete().eq('solicitud_id', sol.id).eq('doc_id', docId)
    const { error: e } = await admin.from('solicitudes_kyc_documentos').insert({
      solicitud_id: sol.id, tenant_id: sol.tenant_id,
      doc_id: docId, etiqueta: etiqueta || null, archivo_path: path, nombre_archivo: filename || null,
    })
    if (e) return res.status(500).json({ error: e.message })
    return res.status(200).json({ ok: true })
  }

  if (action === 'enviar') {
    const { error: e } = await admin.from('solicitudes_kyc')
      .update({ estado: 'recibida', recibida_en: new Date().toISOString(), datos: req.body.datos || sol.datos })
      .eq('id', sol.id)
    if (e) return res.status(500).json({ error: e.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'Acción no válida.' })
}
