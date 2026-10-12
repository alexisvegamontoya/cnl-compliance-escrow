/**
 * Vercel Serverless Function — Integración con CNL Gestión Regulatoria
 *
 * Invocado por:
 *   - Vercel Cron: GET /api/regulatorio-sync (diario 12:30 UTC = 6:30 AM Costa Rica)
 *   - Botón manual: POST /api/regulatorio-sync (superadmin, desde el dashboard)
 *
 * Trae de Gestión Regulatoria (reg-procesar-evento, origen «cumplimiento»):
 *   1. GET /calificaciones → calificación regulatoria por empresa (índice, nivel, pendientes)
 *      → tabla calificacion_regulatoria (una fila por tenant). Distinta del «Nivel de Cumplimiento»
 *      que calcula esta app (src/lib/nivelCumplimiento.js).
 *   2. GET / (regulatorio.version_vigente) → normativa aprobada con su archivo
 *      → bucket «normativa» + tabla normativa (origen = 'regulatorio'); la versión anterior del mismo
 *      documento queda inactiva. Luego acusa recibo (POST /acuse).
 *
 * Variables de entorno en Vercel:
 *   REGULATORIO_URL      — https://dsjmwpgnuvfbxlrlluzn.supabase.co/functions/v1/reg-procesar-evento
 *   REGULATORIO_SECRETO  — secreto de integración «cumplimiento» (lo entrega Gestión Regulatoria)
 *   SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET — ya existentes
 * Requiere sql/regulatorio_integracion.sql aplicado.
 */

import { requireCronOSesion } from './_auth.js'

const digitos = (s) => String(s ?? '').replace(/\D/g, '')

// Código de documento de Regulatorio → tipo de la tabla normativa de esta app
function tipoNormativa(documento) {
  const d = String(documento ?? '').toUpperCase()
  if (/C[OÓ]DIGO DE [EÉ]TICA|ETICA/.test(d)) return 'politica'
  if (/MANUAL|REGLAMENTO/.test(d)) return 'reglamento'
  if (/POL[IÍ]TICA/.test(d)) return 'politica'
  if (/PROCEDIMIENTO|METODOLOG/.test(d)) return 'procedimiento'
  return 'documento'
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireCronOSesion(req, res)
  if (!auth.ok) return
  if (!auth.esCron && auth.perfil?.rol !== 'superadmin') return res.status(403).json({ error: 'Solo superadmin' })

  const url = process.env.REGULATORIO_URL
  const secreto = process.env.REGULATORIO_SECRETO
  if (!url || !secreto) return res.status(200).json({ omitido: true, motivo: 'Falta REGULATORIO_URL o REGULATORIO_SECRETO' })
  const admin = auth.admin
  const cab = { 'x-integracion-origen': 'cumplimiento', 'x-integracion-secreto': secreto, 'Content-Type': 'application/json' }

  const { data: tenants } = await admin.from('tenants').select('id, cedula_juridica')
  const porCedula = new Map((tenants ?? []).map((t) => [digitos(t.cedula_juridica), t.id]))
  const r = { calificaciones: 0, sin_empresa: [], normativa: 0, errores: [] }

  // 1. Calificaciones
  try {
    const resp = await fetch(`${url}/calificaciones`, { headers: cab })
    if (!resp.ok) throw new Error(`calificaciones ${resp.status}`)
    const { calificaciones = [] } = await resp.json()
    const filas = []
    for (const c of calificaciones) {
      const tenantId = porCedula.get(digitos(c.cedula_juridica))
      if (!tenantId) { r.sin_empresa.push(c.razon_social); continue }
      filas.push({
        tenant_id: tenantId, indice: c.indice, nivel: c.nivel, componentes: c.componentes ?? {}, pendientes: c.pendientes ?? [],
        total_pendientes: c.total_pendientes ?? 0, calculado_en: c.calculado_en ?? new Date().toISOString(), sincronizado_en: new Date().toISOString(),
      })
    }
    if (filas.length) {
      const { error } = await admin.from('calificacion_regulatoria').upsert(filas, { onConflict: 'tenant_id' })
      if (error) throw new Error(error.message)
    }
    r.calificaciones = filas.length
  } catch (e) { r.errores.push(`Calificaciones: ${e.message}`) }

  // 2. Normativa aprobada
  try {
    const resp = await fetch(`${url}?tipo=regulatorio.version_vigente&limite=50`, { headers: cab })
    if (!resp.ok) throw new Error(`normativa ${resp.status}`)
    const { eventos = [] } = await resp.json()
    for (const e of eventos) {
      try {
        const tenantId = porCedula.get(digitos(e.cedula_juridica))
        if (!tenantId) throw new Error(`sin empresa con cédula ${e.cedula_juridica}`)
        const p = e.payload ?? {}
        const ref = `regulatorio:${p.version_id}`
        const { data: ya } = await admin.from('normativa').select('id').eq('origen_ref', ref).maybeSingle()
        if (!ya) {
          let ruta = null, nombre = e.nombre_archivo || `${p.documento ?? 'normativa'}.pdf`, bytes = null
          if (e.url_pdf) {
            const arch = await fetch(e.url_pdf)
            if (!arch.ok) throw new Error(`descarga ${arch.status}`)
            const buf = new Uint8Array(await arch.arrayBuffer())
            bytes = buf.length
            ruta = `${tenantId}/${Date.now()}_${nombre.replace(/[^\w.\- ]+/g, '_')}`
            const { error: errS } = await admin.storage.from('normativa').upload(ruta, buf, { contentType: arch.headers.get('content-type') ?? 'application/octet-stream' })
            if (errS) throw new Error(`storage: ${errS.message}`)
          }
          // La versión anterior del mismo documento deja de estar activa
          if (p.documento_normativo_id) {
            await admin.from('normativa').update({ activo: false }).eq('tenant_id', tenantId).eq('origen_documento', `regulatorio:${p.documento_normativo_id}`).eq('activo', true)
          }
          const { error } = await admin.from('normativa').insert({
            tenant_id: tenantId, nombre: p.documento ?? 'Normativa interna', tipo: tipoNormativa(p.documento),
            descripcion: 'Versión aprobada en CNL Gestión Regulatoria', version: p.version != null ? String(p.version) : null,
            fecha_aprobacion_jd: p.fecha_aprobacion ?? null, fecha_vigencia: (p.fecha_aprobacion ?? e.creado_en ?? '').slice(0, 10) || null,
            url_archivo: ruta, nombre_archivo: ruta ? nombre : null, tamano_bytes: bytes, activo: true,
            origen: 'regulatorio', origen_ref: ref, origen_documento: p.documento_normativo_id ? `regulatorio:${p.documento_normativo_id}` : null,
          })
          if (error) throw new Error(error.message)
          r.normativa++
        }
        await fetch(`${url}/acuse`, { method: 'POST', headers: cab, body: JSON.stringify({ evento_id: e.id, recibido_en: new Date().toISOString() }) })
      } catch (err) { r.errores.push(`Normativa ${e.payload?.documento ?? e.id}: ${err.message}`) }
    }
  } catch (e) { r.errores.push(`Normativa: ${e.message}`) }

  return res.status(200).json(r)
}
