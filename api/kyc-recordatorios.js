/**
 * api/kyc-recordatorios.js — Recordatorio de vencimiento del KYC.
 *
 * Invocado por:
 *   - Vercel Cron: GET /api/kyc-recordatorios (diario)
 *   - Manual: POST /api/kyc-recordatorios (usuario con sesión)
 *
 * Busca las solicitudes cuyo plazo (vence_en, 3 días) ya pasó y que aún NO se
 * recibieron ni aprobaron, y envía un correo al cliente CON COPIA al oficial
 * (correo_oficial) avisando que no se ha recibido la información. Marca
 * recordatorio_vencimiento_en para no repetirlo.
 */
import { requireCronOSesion, SUPABASE_URL } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const auth = await requireCronOSesion(req, res)
  if (!auth.ok) return
  const admin = auth.admin
  if (!admin) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada.' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const base = (process.env.APP_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(/\/$/, '')
  const ahora = new Date().toISOString()
  const en24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const ABIERTAS = ['enviada', 'en_proceso', 'rechazada']

  const enviarCorreo = (sol, extra) => fetch(`${SUPABASE_URL}/functions/v1/enviar-correo-kyc`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sol.token, link: `${base}/portal/${sol.token}`, ...extra }),
  })

  let enviados = 0, previos = 0
  const fallos = []

  // 1) Recordatorio ANTES de vencer: vence en las próximas 24h, sin recordatorio previo.
  const { data: porVencer } = await admin
    .from('solicitudes_kyc')
    .select('id, token')
    .in('estado', ABIERTAS)
    .gte('vence_en', ahora).lte('vence_en', en24h)
    .is('recordatorio_previo_en', null)
    .limit(200)
  for (const sol of porVencer || []) {
    try {
      const r = await enviarCorreo(sol, { tipo: 'recordatorio' })
      if (!r.ok) { fallos.push({ id: sol.id, error: (await r.text()).slice(0, 160) }); continue }
      await admin.from('solicitudes_kyc').update({ recordatorio_previo_en: ahora }).eq('id', sol.id)
      previos++
    } catch (e) { fallos.push({ id: sol.id, error: String(e?.message || e) }) }
  }

  // 2) Aviso de VENCIMIENTO: plazo vencido, con copia al oficial, sin repetir.
  const { data: pendientes, error } = await admin
    .from('solicitudes_kyc')
    .select('id, token, correo_oficial')
    .in('estado', ABIERTAS)
    .lt('vence_en', ahora)
    .is('recordatorio_vencimiento_en', null)
    .limit(200)
  if (error) return res.status(500).json({ error: error.message })
  for (const sol of pendientes || []) {
    try {
      const r = await enviarCorreo(sol, { tipo: 'recordatorio', cc: sol.correo_oficial || null })
      if (!r.ok) { fallos.push({ id: sol.id, error: (await r.text()).slice(0, 160) }); continue }
      await admin.from('solicitudes_kyc').update({ recordatorio_vencimiento_en: ahora }).eq('id', sol.id)
      enviados++
    } catch (e) { fallos.push({ id: sol.id, error: String(e?.message || e) }) }
  }

  return res.status(200).json({ ok: true, previos, enviados, fallos })
}
