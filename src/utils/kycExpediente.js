/**
 * kycExpediente.js — Expediente imprimible (PDF) de una solicitud KYC recibida.
 * Incluye toda la información que llenó el cliente y los anexos: las imágenes se
 * incrustan; los PDF y otros archivos se listan con su enlace de descarga.
 */
const ETIQUETAS = {
  nombre_cliente: 'Nombre', primer_apellido: 'Primer apellido', segundo_apellido: 'Segundo apellido',
  tipo_identificacion: 'Tipo de identificación', numero_identificacion: 'N.º de identificación',
  fecha_nacimiento: 'Fecha de nacimiento', genero: 'Género', estado_civil: 'Estado civil',
  profesion_nombre: 'Profesión u oficio', actividad_economica: 'Actividad económica',
  pais_nacimiento: 'País de nacimiento', pais_residencia: 'País de residencia',
  provincia: 'Provincia', canton: 'Cantón', direccion_exacta: 'Dirección exacta',
  nombre_contacto: 'Persona de contacto', telefono: 'Teléfono', correo_electronico: 'Correo electrónico',
  proposito_relacion: 'Propósito de la relación', origen_fondos: 'Origen de los fondos',
  ingreso_mensual_est: 'Ingreso mensual estimado (USD)',
  nombre_empresa: 'Razón social', cedula_juridica: 'Cédula jurídica',
  pais_constitucion: 'País de constitución', fecha_constitucion: 'Fecha de constitución',
  rep_nombre: 'Representante legal', rep_identificacion: 'Identificación del representante',
  rep_telefono: 'Teléfono del representante', rep_correo: 'Correo del representante',
  credito_monto: 'Monto del crédito (USD)',
  credito_plan_tipo: 'Plan de inversión', credito_plan_desc: 'Descripción del plan de inversión',
  credito_garantia_tipo: 'Tipo de garantía', credito_garantia_desc: 'Descripción de la garantía',
  credito_tercero_relacion: 'Relación con el tercero (garantía)',
}
const GEN = { M: 'Masculino', F: 'Femenino', otro: 'Otro' }
const PLAN_L = { capital_trabajo: 'Capital de trabajo', compra_propiedades: 'Compra de propiedades', cancelacion_pasivos: 'Cancelación de pasivos', compra_vehiculos: 'Compra de vehículos', compra_edificio: 'Compra de edificio', construccion: 'Construcción de un proyecto', otros: 'Otros' }
const GAR_L = { uso_empresa: 'Bienes en uso de la empresa cliente', tercero: 'Bienes de un tercero', rep_socios: 'Bienes del representante legal o socios (no a nombre de la empresa)' }

export function generarExpedienteKycHTML({ tenant, solicitud, anexos = [], logo }) {
  const d = solicitud?.datos || {}
  const esJ = solicitud?.tipo_persona === 'juridica'
  const fecha = new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })
  const recibida = solicitud?.recibida_en ? new Date(solicitud.recibida_en).toLocaleDateString('es-CR') : '—'
  const nombre = solicitud?.nombre_cliente ||
    (esJ ? d.nombre_empresa : [d.nombre_cliente, d.primer_apellido].filter(Boolean).join(' ')) || '(sin nombre)'

  const extraLabels = {}
  ;(solicitud?.preguntas_extra || []).forEach(p => { extraLabels[p.clave] = p.label })
  const val = (k, v) => {
    if (k === 'genero') return GEN[v] || v
    if (k === 'credito_plan_tipo') return PLAN_L[v] || v
    if (k === 'credito_garantia_tipo') return GAR_L[v] || v
    return String(v)
  }
  const filas = Object.entries(d)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `<tr><td class="l">${ETIQUETAS[k] || extraLabels[k] || k}</td><td class="v">${val(k, v)}</td></tr>`)
    .join('') || '<tr><td colspan="2" class="l">Sin datos.</td></tr>'

  const anexosHtml = anexos.length === 0
    ? '<p class="muted">Sin documentos adjuntos.</p>'
    : `<table class="datos"><tbody>${anexos.map((a, i) =>
        `<tr><td class="l">Anexo ${i + 1}</td><td class="v">${a.etiqueta || a.doc_id} <span class="muted">— ${a.nombre_archivo || ''}</span></td></tr>`
      ).join('')}</tbody></table>
      <p class="muted" style="margin-top:6px">Cada documento se descarga como archivo independiente desde la ficha de la solicitud.</p>`

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Expediente KYC — ${nombre}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#14141a;padding:26px 34px}
  .head{border-bottom:2px solid #34438c;padding-bottom:12px;margin-bottom:16px}
  .head h1{font-size:17px;color:#1a2348}
  .head p{font-size:11px;color:#6b6b76;margin-top:3px}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b6b76;border-bottom:1px solid #e4e4ea;padding-bottom:4px;margin:18px 0 8px}
  table.datos{width:100%;border-collapse:collapse}
  table.datos td{padding:4px 6px;vertical-align:top;border-bottom:1px solid #f0f0f4}
  table.datos .l{width:40%;color:#6b6b76}
  table.datos .v{font-weight:600}
  .muted{color:#8a8a94;font-size:11px}
  .anexo{margin:14px 0;page-break-inside:avoid}
  .anexo-cab{font-weight:700;font-size:11px;color:#34438c;margin-bottom:6px;border-left:3px solid #34438c;padding-left:8px}
  .anexo-img{max-width:100%;max-height:900px;border:1px solid #e4e4ea;border-radius:4px}
  .foot{margin-top:26px;border-top:1px solid #e4e4ea;padding-top:8px;font-size:9px;color:#9a9aa4;text-align:center}
  a{color:#34438c}
  @media print{@page{margin:1.3cm} .noprint{display:none}}
</style></head><body>
  <div class="head" style="display:flex;align-items:center;gap:14px">
    ${logo ? `<img src="${logo}" alt="" style="height:54px;width:auto;object-fit:contain">` : ''}
    <div>
      <h1>Expediente de Debida Diligencia — ${esJ ? 'Persona Jurídica' : 'Persona Física'}</h1>
      <p>${tenant || ''} · Cliente: <strong>${nombre}</strong> · Recibido: ${recibida} · Generado: ${fecha}</p>
    </div>
  </div>

  <h2>Información suministrada por el cliente</h2>
  <table class="datos"><tbody>${filas}</tbody></table>

  <h2>Anexos — documentos de respaldo (${anexos.length})</h2>
  ${anexosHtml}

  <div class="foot">Expediente generado por el sistema CNL Craniley Compliance · ${tenant || ''} · ${fecha}</div>
  <button class="noprint" onclick="window.print()" style="position:fixed;top:12px;right:12px;padding:8px 14px;background:#34438c;color:#fff;border:0;border-radius:6px;cursor:pointer">Imprimir / Guardar PDF</button>
</body></html>`
}
