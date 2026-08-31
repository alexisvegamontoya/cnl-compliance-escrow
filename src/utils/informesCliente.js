/**
 * informesCliente.js — Informes imprimibles (para PDF) del expediente del cliente:
 * Consulta de Listas, Calificación de Riesgo y Debida Diligencia. HTML autocontenido
 * con estilos aislados bajo la clase .inf (no filtran a la app). Se convierten a PDF
 * con htmlAPdfBlob y se guardan en la carpeta del oficial (no en el servidor).
 */
const e = (v) => (v === null || v === undefined) ? '' : String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fecha = () => new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })
const fila = (l, v) => (v || v === 0) ? `<tr><td class="l">${e(l)}</td><td class="v">${e(v)}</td></tr>` : ''

const CCSS_L = { al_dia: 'Inscrito — al día', morosidad: 'Inscrito — en morosidad', arreglo: 'Inscrito — arreglo de pago', no_inscrito: 'No inscrito' }
const SUGEF_L = { no: 'No es sujeto obligado', 15: 'Sujeto obligado — Art. 15', '15bis': 'Sujeto obligado — Art. 15 bis', '15ter': 'Sujeto obligado — Art. 15 ter', pendiente: 'Inscripción pendiente / en trámite' }
const LISTAS_L = { alerta: 'COINCIDENCIA — requiere revisión', revisar: 'POSIBLE COINCIDENCIA — revisar', verificado: 'SIN COINCIDENCIAS' }
const LISTAS_COLOR = { alerta: '#c31b26', revisar: '#a87813', verificado: '#1a5738' }
const NIVEL_COLOR = { alto: '#c31b26', medio: '#a87813', bajo: '#1a5738' }

const ESTILO = `
  .inf { font-family: Arial, Helvetica, sans-serif; color:#14141a; font-size:12px; padding:6px 10px; }
  .inf * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .inf .head { border-bottom:2px solid #0a1247; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
  .inf .head .tt { font-size:15px; font-weight:bold; color:#0a1247; }
  .inf .head .st { font-size:12px; color:#45454f; margin-top:2px; }
  .inf .head .rt { text-align:right; font-size:10px; color:#6b6b76; }
  .inf .head img { height:48px; width:auto; object-fit:contain; }
  .inf h2 { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#6b6b76; border-bottom:1px solid #e4e4ea; padding-bottom:4px; margin:16px 0 8px; }
  .inf table.d { width:100%; border-collapse:collapse; }
  .inf table.d td { padding:4px 7px; vertical-align:top; border-bottom:1px solid #f0f0f4; }
  .inf table.d td.l { width:42%; color:#6b6b76; }
  .inf table.d td.v { font-weight:600; }
  .inf table.g { width:100%; border-collapse:collapse; font-size:11px; }
  .inf table.g th, .inf table.g td { border:1px solid #e4e4ea; padding:5px 7px; text-align:left; }
  .inf table.g th { background:#eef2fc; color:#0a1247; }
  .inf .badge { display:inline-block; padding:6px 14px; border-radius:6px; font-weight:bold; font-size:13px; color:#fff; }
  .inf .box { border:1px solid #e4e4ea; border-radius:6px; padding:10px 12px; margin:8px 0; font-size:11px; line-height:1.5; }
  .inf .legal { font-size:9.5px; color:#6b6b76; line-height:1.5; border-top:1px solid #e4e4ea; margin-top:16px; padding-top:8px; }
  .inf .firma { margin-top:34px; display:grid; grid-template-columns:1fr 1fr; gap:36px; }
  .inf .firma .ln { border-top:1px solid #45454f; padding-top:5px; text-align:center; font-size:10px; color:#45454f; }
`

function shell({ tenant, logo, titulo, subtitulo, cuerpo }) {
  const so = tenant || '[Sujeto obligado]'
  return `<style>${ESTILO}</style><div class="inf">
    <div class="head">
      <div style="display:flex;align-items:center;gap:12px">
        ${logo ? `<img src="${e(logo)}" alt="">` : ''}
        <div><div class="tt">${e(so)}</div><div class="st">${e(titulo)}</div></div>
      </div>
      <div class="rt"><div>${e(subtitulo || '')}</div><div>Generado: ${fecha()}</div></div>
    </div>
    ${cuerpo}
  </div>`
}

const nombreDe = (c) => c?.nombre_empresa || `${c?.nombre_cliente || ''} ${c?.primer_apellido || ''} ${c?.segundo_apellido || ''}`.trim()

function bloqueCliente(c) {
  return `<table class="d"><tbody>
    ${fila('Nombre / Razón social', nombreDe(c))}
    ${fila('Identificación', c?.numero_identificacion || c?.cedula_juridica)}
    ${fila('Actividad económica', c?.actividad_eco_nombre || c?.profesion_nombre || c?.actividad_economica)}
    ${fila('País', c?.pais_ubicacion || c?.pais_residencia || c?.pais_constitucion || c?.pais_nacimiento)}
    ${fila('Inscripción CCSS', CCSS_L[c?.ccss_estado])}
    ${fila('Condición SUGEF (Ley 7786)', SUGEF_L[c?.sugef_estado])}
  </tbody></table>`
}

// ── 1. Consulta de Listas Internacionales ──
export function informeListasHTML({ tenant, logo, cliente, screening }) {
  const est = screening?.estado_listas || 'verificado'
  const coincidencias = screening?.coincidencias || []
  const tablaCoinc = coincidencias.length ? `
    <h2>Coincidencias encontradas</h2>
    <table class="g"><thead><tr><th>Fuente</th><th>Nombre en lista</th><th>Similitud</th></tr></thead>
    <tbody>${coincidencias.map(r => `<tr><td>${e(r.fuente)}</td><td>${e(r.nombre_completo)}</td><td>${Math.round((r.similitud || 0) * 100)}%</td></tr>`).join('')}</tbody></table>`
    : `<div class="box">No se encontraron coincidencias del cliente en las listas consultadas (ONU, OFAC, OFSI, INTERPOL, GAFI, GAFILAT, ICD/PEP).</div>`
  const cuerpo = `
    <h2>Datos del cliente</h2>${bloqueCliente(cliente)}
    <h2>Resultado del tamizaje</h2>
    <p style="margin:6px 0 10px"><span class="badge" style="background:${LISTAS_COLOR[est]}">${LISTAS_L[est]}</span></p>
    ${screening?.hayPEP ? '<div class="box" style="border-color:#f2c9a2;background:#fdf8ec">Se identificó una posible condición de <strong>Persona Expuesta Políticamente (PEP)</strong>. Aplique debida diligencia reforzada.</div>' : ''}
    ${tablaCoinc}
    <div class="legal">Consulta realizada contra listas de sanciones y observados (ONU, OFAC/SDN, OFSI-UK, INTERPOL, GAFI, GAFILAT e ICD Costa Rica). Este reporte constituye evidencia de la verificación conforme al Acuerdo SUGEF 13-19 y debe conservarse en el expediente del cliente por un mínimo de 5 años (Ley 7786, Art. 24).</div>`
  return shell({ tenant, logo, titulo: 'Consulta de Listas Internacionales — ALA/CFT', subtitulo: `Cliente: ${nombreDe(cliente)}`, cuerpo })
}

// ── 2. Calificación de Riesgo ──
export function informeRiesgoHTML({ tenant, logo, cliente, calificacion }) {
  const nivel = (calificacion?.calificacion_manual || calificacion?.calificacion || cliente?.calificacion_riesgo || 'bajo').toLowerCase()
  const filaF = (l, s, p) => `<tr><td>${e(l)}</td><td>${s != null ? Number(s).toFixed(2) : '—'}</td><td>${p || ''}</td></tr>`
  const cuerpo = `
    <h2>Datos del cliente</h2>${bloqueCliente(cliente)}
    <h2>Resultado</h2>
    <p style="margin:6px 0 10px">Nivel de riesgo: <span class="badge" style="background:${NIVEL_COLOR[nivel] || '#6b6b76'}">${nivel.toUpperCase()}</span>
      ${calificacion?.score_total != null ? `<span style="margin-left:10px;color:#6b6b76">Puntaje total: <strong>${Number(calificacion.score_total).toFixed(2)}</strong> / 3.00</span>` : ''}</p>
    ${calificacion ? `<h2>Factores de riesgo</h2>
      <table class="g"><thead><tr><th>Factor</th><th>Puntaje (0.5–3)</th><th></th></tr></thead><tbody>
        ${filaF('Cliente', calificacion.score_cliente)}
        ${filaF('Geográfico', calificacion.score_geo)}
        ${filaF('Productos / servicios', calificacion.score_productos)}
        ${filaF('Canales', calificacion.score_canales)}
        <tr style="background:#eef2fc;font-weight:bold"><td>Puntaje ponderado total</td><td>${Number(calificacion.score_total).toFixed(2)}</td><td></td></tr>
      </tbody></table>` : '<div class="box">Calificación no disponible; genere la calificación de riesgo del cliente.</div>'}
    ${calificacion?.observaciones ? `<h2>Observaciones</h2><div class="box">${e(calificacion.observaciones)}</div>` : ''}
    <div class="legal">Calificación de riesgo ALA/CFT/FPADM conforme al Acuerdo SUGEF 13-19 (metodología por factores: cliente, geográfico, productos/servicios y canales). Escala: 0–1 bajo · 1.01–2 medio · 2.01–3 alto.</div>`
  return shell({ tenant, logo, titulo: 'Calificación de Riesgo del Cliente', subtitulo: `Cliente: ${nombreDe(cliente)}`, cuerpo })
}

// ── 3. Debida Diligencia ──
export function informeDDHTML({ tenant, logo, cliente, screening, checklistItems = [] }) {
  const est = screening?.estado_listas || 'verificado'
  const EST_DOC = { disponible: 'Recibido', pendiente: 'Pendiente', no_disponible: 'No disponible', no_aplica: 'No aplica' }
  const cl = cliente?.checklist_documental || {}
  const estadoDoc = (id) => {
    const it = cl[id]
    return typeof it === 'object' ? (it?.estado || 'pendiente') : (it ? 'disponible' : 'pendiente')
  }
  const tablaChk = checklistItems.length ? `
    <h2>Documentación (debida diligencia)</h2>
    <table class="g"><thead><tr><th>Documento</th><th>Estado</th></tr></thead>
    <tbody>${checklistItems.map(it => `<tr><td>${e(it.label || it.nombre || it.id)}</td><td>${EST_DOC[estadoDoc(it.id)] || 'Pendiente'}</td></tr>`).join('')}</tbody></table>` : ''
  const nivel = (cliente?.calificacion_riesgo || 'bajo').toLowerCase()
  const cuerpo = `
    <h2>Datos del cliente</h2>${bloqueCliente(cliente)}
    <h2>Resultado de la debida diligencia</h2>
    <table class="d"><tbody>
      ${fila('Tamizaje de listas', LISTAS_L[est])}
      ${fila('Persona Expuesta Políticamente (PEP)', screening?.hayPEP ? 'Sí — aplicar debida diligencia reforzada' : 'No identificada')}
      ${fila('Calificación de riesgo', nivel.toUpperCase())}
    </tbody></table>
    ${tablaChk}
    <div class="box">${est === 'verificado' && !screening?.hayPEP
      ? 'No se identificaron alertas en el tamizaje de listas ni condición PEP. Se recomienda aplicar la debida diligencia ordinaria y el monitoreo periódico según el nivel de riesgo.'
      : 'Se identificaron elementos que requieren atención (coincidencias en listas y/o condición PEP). Aplique debida diligencia reforzada y valore la aprobación de la relación comercial.'}</div>
    <div class="firma"><div class="ln">Oficial de Cumplimiento</div><div class="ln">Fecha</div></div>
    <div class="legal">Informe de debida diligencia (conozca a su cliente) conforme a la Ley 7786 y el Acuerdo SUGEF 13-19. Debe conservarse en el expediente del cliente.</div>`
  return shell({ tenant, logo, titulo: 'Informe de Debida Diligencia (KYC)', subtitulo: `Cliente: ${nombreDe(cliente)}`, cuerpo })
}
