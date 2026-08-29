/**
 * kycDocumento.js — Genera el formulario KYC imprimible que el cliente descarga,
 * firma y vuelve a subir en el portal. Replica la ficha del gestor de clientes,
 * incluyendo la Declaración (Ley 7786) y la Advertencia SUGEF.
 */
const TIPO_ID = { 1: 'Cédula de identidad', 2: 'Cédula jurídica', 3: 'DIMEX', 4: 'Pasaporte' }
const GENERO = { M: 'Masculino', F: 'Femenino', otro: 'Otro' }

function fila(label, valor) {
  if (!valor && valor !== 0) return ''
  return `<tr><td class="lbl">${label}</td><td class="val">${String(valor)}</td></tr>`
}

export function generarKycHTML({ tenant, tipoPersona, datos = {} }) {
  const esJ = tipoPersona === 'juridica'
  const fecha = new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })
  const tenantNombre = tenant || '[Sujeto obligado]'
  const nombre = esJ ? datos.nombre_empresa
    : [datos.nombre_cliente, datos.primer_apellido, datos.segundo_apellido].filter(Boolean).join(' ')
  const dir = [datos.direccion_exacta, datos.canton, datos.provincia].filter(Boolean).join(', ')

  const filasDatos = esJ ? [
    fila('Razón social', datos.nombre_empresa),
    fila('Cédula jurídica', datos.cedula_juridica),
    fila('País de constitución', datos.pais_constitucion),
    fila('Fecha de constitución', datos.fecha_constitucion),
    fila('Actividad económica', datos.actividad_economica),
    fila('Dirección', dir),
    fila('Persona de contacto', datos.nombre_contacto),
    fila('Teléfono', datos.telefono),
    fila('Correo electrónico', datos.correo_electronico),
    fila('Representante legal', datos.rep_nombre),
    fila('Identificación del representante', datos.rep_identificacion),
    fila('Propósito de la relación', datos.proposito_relacion),
    fila('Origen de los fondos', datos.origen_fondos),
    fila('Ingreso mensual estimado', datos.ingreso_mensual_est ? `USD ${datos.ingreso_mensual_est}` : ''),
  ].join('') : [
    fila('Nombre completo', nombre),
    fila('Tipo de identificación', TIPO_ID[datos.tipo_identificacion] || datos.tipo_identificacion),
    fila('Número de identificación', datos.numero_identificacion),
    fila('Fecha de nacimiento', datos.fecha_nacimiento),
    fila('Género', GENERO[datos.genero] || datos.genero),
    fila('Estado civil', datos.estado_civil),
    fila('Profesión u oficio', datos.profesion_nombre),
    fila('Actividad económica', datos.actividad_economica),
    fila('País de nacimiento', datos.pais_nacimiento),
    fila('País de residencia', datos.pais_residencia),
    fila('Dirección', dir),
    fila('Teléfono', datos.telefono),
    fila('Correo electrónico', datos.correo_electronico),
    fila('Propósito de la relación', datos.proposito_relacion),
    fila('Origen de los fondos', datos.origen_fondos),
    fila('Ingreso mensual estimado', datos.ingreso_mensual_est ? `USD ${datos.ingreso_mensual_est}` : ''),
  ].join('')

  const filasCredito = (datos.credito_monto || datos.credito_garantia || datos.credito_plan_inversion) ? `
    <div class="seccion"><h2>Información del crédito</h2>
    <table class="datos"><tbody>
      ${fila('Monto solicitado', datos.credito_monto ? `USD ${datos.credito_monto}` : '')}
      ${fila('Garantía', datos.credito_garantia)}
      ${fila('Plan de inversión', datos.credito_plan_inversion)}
    </tbody></table></div>` : ''

  const declaracion = `Para efectos del presente contrato declaro expresamente lo siguiente:
1. Tanto mi actividad, como profesión u oficio, son lícitos y los ejerzo dentro de los marcos legales.
2. Los dineros y fondos involucrados no provienen de ninguna actividad ilícita de las contempladas en la legislación costarricense.
3. Las declaraciones contenidas en este documento son exactas, completas y verídicas en la forma que aparecen descritas; por lo tanto, la falsedad, omisión o error en ellas tendrán las consecuencias estipuladas por la ley.
4. Me obligo con ${tenantNombre} a mantener actualizada la información suministrada, de acuerdo con los procedimientos que para tal efecto tenga dispuesta la compañía.
5. Autorizo a ${tenantNombre}, en forma expresa, para reportar, procesar, solicitar, suministrar o divulgar, únicamente a las entidades legalmente autorizadas, de conformidad con la Ley 7786, todo lo relativo a mi información.`

  const advertencia = `Se advierte al público que esta empresa es supervisada solamente en materia de prevención de legitimación de capitales, financiamiento al terrorismo y financiamiento de la proliferación de armas de destrucción masiva, y además se encuentra sujeta a disposiciones vinculantes de la Unidad de Inteligencia Financiera del Instituto Costarricense sobre Drogas. Por lo tanto, la SUGEF no supervisa en materia financiera esta empresa, ni los negocios que ofrece, ni su seguridad, estabilidad o solvencia.`

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>KYC — ${nombre || ''}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#14141a;padding:20px 30px}
  .header{border-bottom:2px solid #34438c;padding-bottom:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start}
  .tenant-nombre{font-size:15px;font-weight:bold;color:#1a2348}
  .header-right{text-align:right;font-size:10px;color:#6b6b76}
  .header-right .titulo-doc{font-size:12px;font-weight:bold;color:#14141a;margin-bottom:4px}
  .seccion{margin-bottom:14px}
  .seccion h2{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;color:#6b6b76;border-bottom:1px solid #e4e4ea;padding-bottom:4px;margin-bottom:8px}
  table.datos{width:100%;border-collapse:collapse}
  table.datos td{padding:3px 6px;vertical-align:top}
  table.datos .lbl{width:38%;color:#6b6b76}
  table.datos .val{font-weight:500;color:#14141a}
  .declaracion{border:1px solid #cfcfd7;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:10px;line-height:1.6;color:#45454f}
  .declaracion h4{font-size:10px;font-weight:bold;text-transform:uppercase;color:#45454f;margin-bottom:6px}
  .advertencia{border:1px solid #ec969b;border-radius:6px;padding:8px 12px;margin-bottom:16px;background:#fdf3f3;font-size:9.5px;line-height:1.5;color:#4e0b10}
  .advertencia strong{display:block;margin-bottom:4px;font-size:10px}
  .firmas{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:26px}
  .firma-bloque{text-align:center}
  .firma-linea{border-top:1px solid #45454f;margin-top:44px;padding-top:5px}
  .firma-nombre{font-weight:600;font-size:10px;margin-bottom:2px}
  .firma-rol{font-size:9px;color:#6b6b76}
  .footer{margin-top:16px;border-top:1px solid #e4e4ea;padding-top:8px;font-size:9px;color:#9a9aa4;text-align:center}
  @media print{body{padding:10px 15px}@page{margin:1.2cm}}
</style></head><body>
  <div class="header">
    <div><div class="tenant-nombre">${tenantNombre}</div></div>
    <div class="header-right">
      <div class="titulo-doc">FICHA DE IDENTIFICACIÓN DE CLIENTE (KYC)</div>
      <div>Tipo: ${esJ ? 'Persona Jurídica' : 'Persona Física'}</div>
      <div>Fecha: ${fecha}</div>
    </div>
  </div>

  <div class="seccion"><h2>${esJ ? 'Datos de la empresa' : 'Datos personales'}</h2>
    <table class="datos"><tbody>${filasDatos}</tbody></table>
  </div>
  ${filasCredito}

  <div class="declaracion"><h4>Declaración del cliente — Ley 7786</h4><p>${declaracion.replace(/\n/g, '<br>')}</p></div>
  <div class="advertencia"><strong>ADVERTENCIA SUGEF</strong>${advertencia}</div>

  <div class="firmas">
    <div class="firma-bloque"><div class="firma-linea">
      <div class="firma-nombre">${nombre || ''}</div>
      <div class="firma-rol">${esJ ? 'Representante legal / Firma autorizada' : 'Firma del cliente'}</div>
      <div class="firma-rol" style="margin-top:3px">Identificación: ${esJ ? (datos.cedula_juridica || '') : (datos.numero_identificacion || '___________')}</div>
    </div></div>
    <div class="firma-bloque"><div class="firma-linea"><div class="firma-nombre">Fecha</div></div></div>
  </div>

  <div class="footer">Documento generado por el portal de recolección de ${tenantNombre} · ${fecha}</div>
  <script>window.onload=function(){window.print()}</script>
</body></html>`
}
