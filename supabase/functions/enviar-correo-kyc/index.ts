// Edge Function: enviar-correo-kyc
// Envía por Resend (misma cuenta/clave que el resto de CNL) el enlace del portal
// de recolección KYC al cliente. La invoca el oficial desde la app (autenticado).
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')
const FROM_EMAIL = 'cumplimiento@cnl.cr'
const FROM_NAME  = 'CNL Craniley Compliance Services'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function fechaCR(iso: string | null) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return '' }
}

function correoHTML(tenant: string, nombre: string, link: string, vence: string, logo: string | null) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
  <tr><td style="background:#0A1247;padding:24px 32px;text-align:center">
    ${logo ? `<img src="${logo}" alt="${tenant}" style="height:48px;width:auto;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto">` : ''}
    <p style="color:#fff;margin:0;font-size:16px;font-weight:bold">${tenant}</p>
    <h1 style="color:rgba(255,255,255,.92);margin:8px 0 0;font-size:15px;font-weight:600">Formulario de Debida Diligencia (KYC)</h1>
    <p style="color:rgba(240,226,190,.85);margin:6px 0 0;font-size:12px">Ley 7786 · Acuerdo SUGEF 13-19</p>
  </td></tr>
  <tr><td style="background:#C31B26;height:4px"></td></tr>
  <tr><td style="padding:30px 32px">
    <p style="color:#444;font-size:15px;margin:0 0 14px">Estimado/a <strong>${nombre || 'cliente'}</strong>,</p>
    <p style="color:#444;font-size:14px;line-height:1.7;margin:0 0 16px">
      Como parte de nuestro proceso de debida diligencia, le solicitamos completar su información y adjuntar los
      documentos de respaldo en el siguiente formulario seguro. Al finalizar podrá descargar el formulario KYC,
      firmarlo y subirlo para concluir.</p>
    <div style="text-align:center;margin:26px 0">
      <a href="${link}" style="background:#C31B26;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;display:inline-block">Completar mi información</a>
    </div>
    ${vence ? `<div style="background:#fff8e6;border-left:4px solid #f59e0b;border-radius:6px;padding:12px 16px;margin:0 0 20px"><p style="margin:0;font-size:13px;color:#78350f">⏰ El enlace vence el <strong>${vence}</strong>.</p></div>` : ''}
    <p style="color:#888;font-size:12px;line-height:1.6;margin:0">Si el botón no funciona, copie y pegue este enlace:<br>
      <a href="${link}" style="color:#0A1247;word-break:break-all">${link}</a></p>
  </td></tr>
  <tr><td style="background:#f8f9fb;border-top:1px solid #eee;padding:18px 32px;text-align:center">
    <p style="color:#aaa;font-size:11px;margin:0">Enviado por <strong>${FROM_NAME}</strong> en nombre de ${tenant}. Sus datos son confidenciales.</p>
  </td></tr>
</table></td></tr></table></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY no configurada.' }, 500)
    const { token, link } = await req.json()
    if (!token || !link) return json({ error: 'Faltan datos (token/link).' }, 400)

    // Buscar la solicitud (service role)
    const r = await fetch(`${SUPABASE_URL}/rest/v1/solicitudes_kyc?token=eq.${encodeURIComponent(token)}&select=correo_cliente,nombre_cliente,vence_en,tenants(nombre,logo_url)`, {
      headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    const rows = await r.json()
    const sol = Array.isArray(rows) ? rows[0] : null
    if (!sol) return json({ error: 'Solicitud no encontrada.' }, 404)

    const tenant = sol.tenants?.nombre || FROM_NAME
    const html = correoHTML(tenant, sol.nombre_cliente || '', link, fechaCR(sol.vence_en), sol.tenants?.logo_url || null)

    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [sol.correo_cliente],
        reply_to: FROM_EMAIL,
        subject: `Complete su información de debida diligencia — ${tenant}`,
        html,
      }),
    })
    if (!envio.ok) {
      const t = await envio.text()
      return json({ error: 'Resend: ' + t.slice(0, 300) }, 502)
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
