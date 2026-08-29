/**
 * kycDocumento.js — Genera el formulario KYC imprimible que el cliente descarga,
 * firma y vuelve a subir en el portal de recolección.
 */
const TIPO_ID = { 1: 'Cédula de identidad', 2: 'Cédula jurídica', 3: 'DIMEX', 4: 'Pasaporte' }
const GENERO = { M: 'Masculino', F: 'Femenino', otro: 'Otro' }

function fila(label, valor) {
  if (!valor && valor !== 0) return ''
  return `<tr><td class="l">${label}</td><td class="v">${String(valor)}</td></tr>`
}

export function generarKycHTML({ tenant, tipoPersona, datos = {} }) {
  const esJ = tipoPersona === 'juridica'
  const fecha = new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })
  const nombre = esJ ? datos.nombre_empresa : [datos.nombre_cliente, datos.primer_apellido, datos.segundo_apellido].filter(Boolean).join(' ')
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
  ] : [
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
    <h2>Información del crédito</h2>
    <table class="datos"><tbody>
      ${fila('Monto solicitado', datos.credito_monto ? `USD ${datos.credito_monto}` : '')}
      ${fila('Garantía', datos.credito_garantia)}
      ${fila('Plan de inversión', datos.credito_plan_inversion)}
    </tbody></table>` : ''

  const declaracion = `Declaro bajo fe de juramento que la información aquí suministrada es veraz, completa y exacta.
Autorizo a ${tenant || 'la entidad'} a verificar la información y a solicitar, procesar y conservar mis datos conforme a la Ley 7786 y sus reformas.
Los fondos involucrados no provienen de actividades ilícitas de las contempladas en la legislación costarricense.
Me comprometo a mantener actualizada esta información.`

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>KYC — ${nombre || ''}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#14141a;padding:26px 34px}
  .head{border-bottom:2px solid #34438c;padding-bottom:12px;margin-bottom:16px}
  .head h1{font-size:16px;color:#1a2348}
  .head p{font-size:11px;color:#6b6b76;margin-top:3px}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b6b76;border-bottom:1px solid #e4e4ea;padding-bottom:4px;margin:16px 0 8px}
  table.datos{width:100%;border-collapse:collapse}
  table.datos td{padding:4px 6px;vertical-align:top}
  table.datos .l{width:38%;color:#6b6b76}
  table.datos .v{font-weight:600}
  .decl{border:1px solid #cfcfd7;border-radius:6px;padding:12px 14px;margin-top:16px;font-size:11px;line-height:1.7;color:#45454f}
  .firma{margin-top:48px;display:flex;justify-content:space-between;gap:30px}
  .firma .b{flex:1;text-align:center}
  .firma .linea{border-top:1px solid #45454f;margin-top:44px;padding-top:5px;font-size:11px}
  .foot{margin-top:26px;border-top:1px solid #e4e4ea;padding-top:8px;font-size:9px;color:#9a9aa4;text-align:center}
  @media print{@page{margin:1.4cm}}
</style></head><body>
  <div class="head">
    <h1>Formulario Conozca a su Cliente (KYC) — ${esJ ? 'Persona Jurídica' : 'Persona Física'}</h1>
    <p>${tenant || ''} · Debida diligencia ALA/CFT — Ley 7786 · Acuerdo SUGEF 13-19 · ${fecha}</p>
  </div>
  <h2>${esJ ? 'Datos de la empresa' : 'Datos personales'}</h2>
  <table class="datos"><tbody>${filasDatos}</tbody></table>
  ${filasCredito}
  <div class="decl"><strong>Declaración del cliente</strong><br>${declaracion.replace(/\n/g, '<br>')}</div>
  <div class="firma">
    <div class="b"><div class="linea">Firma del cliente${esJ ? ' / representante legal' : ''}<br>${nombre || ''}</div></div>
    <div class="b"><div class="linea">Fecha</div></div>
  </div>
  <div class="foot">Documento generado por el portal de recolección de ${tenant || 'CNL Craniley'} · ${fecha}</div>
  <script>window.onload=function(){window.print()}</script>
</body></html>`
}
