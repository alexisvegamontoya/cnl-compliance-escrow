/**
 * imprimirFicha.js
 * Genera la ficha imprimible de un cliente (persona física o jurídica).
 * Abre una ventana nueva con el HTML formateado y llama window.print().
 */

const TIPO_ID_LABEL = {
  1: 'Cédula de identidad',
  2: 'Cédula jurídica',
  3: 'DIMEX',
  4: 'Pasaporte',
  5: 'Nite',
  6: 'Otro',
}

const RIESGO_LABEL = { alto: 'ALTO', medio: 'MEDIO', bajo: 'BAJO' }
const RIESGO_COLOR = { alto: '#dc2626', medio: '#d97706', bajo: '#16a34a' }

function fechaLarga(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-CR', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  } catch { return iso }
}

function nombreCliente(c) {
  if (c.nombre_empresa) return c.nombre_empresa
  return [c.nombre_cliente, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')
}

function filaTabla(label, value) {
  if (!value && value !== 0 && value !== false) return ''
  return `<tr>
    <td class="lbl">${label}</td>
    <td class="val">${value}</td>
  </tr>`
}

function tablaPersonas(personas, tipoRelacion, titulo) {
  const filtradas = (personas || []).filter(p => p.tipo_relacion === tipoRelacion)
  if (!filtradas.length) return ''
  return `
    <div class="seccion">
      <h3>${titulo}</h3>
      <table class="tabla-personas">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Identificación</th>
            ${tipoRelacion === 'socio' ? '<th>Participación</th>' : ''}
            ${tipoRelacion === 'junta_directiva' ? '<th>Cargo</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${filtradas.map(p => `
            <tr>
              <td>${p.nombre || '—'}</td>
              <td>${p.tipo_entidad === 'persona_juridica' ? 'Persona jurídica' : 'Persona física'}</td>
              <td>${p.identificacion ? `${p.tipo_identificacion || ''} ${p.identificacion}`.trim() : '—'}</td>
              ${tipoRelacion === 'socio' ? `<td>${p.porcentaje_participacion != null ? p.porcentaje_participacion + '%' : '—'}</td>` : ''}
              ${tipoRelacion === 'junta_directiva' ? `<td>${p.cargo || '—'}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`
}

export function imprimirFichaCliente({ cliente, personas = [], tenant, profile }) {
  const esJuridica = !!cliente.nombre_empresa ||
    [2, 4].includes(Number(cliente.tipo_identificacion))

  const fecha = new Date().toLocaleDateString('es-CR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const hora = new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })

  const tenantNombre = tenant?.nombre || '[Nombre del sujeto obligado]'
  const declarante   = profile?.nombre || profile?.email || 'Usuario del sistema'

  // ────── Declaración legal ──────
  const declaracion = `Para efectos del presente contrato declaro expresamente lo siguiente:
1. Tanto mi actividad, como profesión u oficio, son lícitos y los ejerzo dentro de los marcos legales.
2. Los dineros para cancelar el crédito provienen de ninguna actividad ilícita de las contempladas en la legislación costarricense.
3. Las declaraciones contenidas en este documento son exactas, completas y verídicas en la forma que aparecen descritas; por lo tanto, la falsedad, omisión o error en ellas, tendrán las consecuencias estipuladas por la ley.
4. Me obligo con ${tenantNombre} a mantener actualizada la información suministrada, de acuerdo con los procedimientos que para tal efecto tenga dispuesta la compañía.
5. Autorizo a ${tenantNombre}, en forma expresa, para reportar, procesar, solicitar, suministrar o divulgar, únicamente a las entidades legalmente autorizadas, de conformidad con la Ley 7786, todo lo relativo a mi información.`

  const advertencia = `Se advierte al público que esta empresa es supervisada solamente en materia de prevención de legitimación de capitales, financiamiento al terrorismo y financiamiento de la proliferación de armas de destrucción masiva, y además se encuentra sujeta a disposiciones vinculantes de la Unidad de Inteligencia Financiera del Instituto Costarricense sobre Drogas. Por lo tanto, la SUGEF no supervisa en materia financiera esta empresa, ni los negocios que ofrece, ni su seguridad, estabilidad o solvencia.`

  // ────── Header con logo ──────
  const logoHtml = tenant?.logo_url
    ? `<img src="${tenant.logo_url}" alt="${tenantNombre}" class="logo-img" />`
    : `<div class="logo-inicial">${tenantNombre[0] || 'S'}</div>`

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ficha de Cliente — ${nombreCliente(cliente)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      background: #fff;
      padding: 20px 30px;
    }
    /* ── Encabezado ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .logo-img { height: 60px; width: auto; object-fit: contain; }
    .logo-inicial {
      width: 60px; height: 60px; border-radius: 10px;
      background: #2563eb; color: #fff;
      font-size: 28px; font-weight: bold;
      display: flex; align-items: center; justify-content: center;
    }
    .tenant-nombre { font-size: 15px; font-weight: bold; color: #1e3a8a; }
    .tenant-cedula { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .header-right { text-align: right; font-size: 10px; color: #6b7280; }
    .header-right .titulo-doc {
      font-size: 12px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px;
    }
    /* ── Secciones ── */
    .seccion { margin-bottom: 14px; }
    .seccion h2 {
      font-size: 10px; font-weight: bold; text-transform: uppercase;
      letter-spacing: 0.05em; color: #6b7280;
      border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 8px;
    }
    .seccion h3 {
      font-size: 10px; font-weight: bold; text-transform: uppercase;
      letter-spacing: 0.05em; color: #374151; margin-bottom: 6px;
    }
    /* ── Tabla de datos ── */
    table.datos { width: 100%; border-collapse: collapse; }
    table.datos td { padding: 3px 6px; vertical-align: top; }
    table.datos .lbl { width: 38%; color: #6b7280; }
    table.datos .val { font-weight: 500; color: #111827; }
    /* ── Tabla de personas ── */
    table.tabla-personas {
      width: 100%; border-collapse: collapse; font-size: 10px;
    }
    table.tabla-personas th, table.tabla-personas td {
      border: 1px solid #e5e7eb; padding: 4px 8px; text-align: left;
    }
    table.tabla-personas th { background: #f3f4f6; font-weight: 600; }
    /* ── Badges de estado ── */
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;
      border: 1px solid;
    }
    .badge-pep    { background: #ede9fe; color: #6d28d9; border-color: #c4b5fd; }
    .badge-listas { background: #fef2f2; color: #b91c1c; border-color: #fca5a5; }
    .badge-ok     { background: #f0fdf4; color: #15803d; border-color: #86efac; }
    .riesgo-box {
      display: inline-block; padding: 4px 14px; border-radius: 6px;
      font-size: 12px; font-weight: bold; color: #fff; margin-bottom: 10px;
    }
    /* ── Cumplimiento documental ── */
    .cumplimiento-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 10px;
    }
    .cump-item {
      display: flex; align-items: center; gap: 6px;
      border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px;
      font-size: 10px;
    }
    .cump-item.ok  { background: #f0fdf4; border-color: #bbf7d0; }
    .cump-item.nok { background: #fef2f2; border-color: #fecaca; }
    /* ── Declaración ── */
    .declaracion {
      border: 1px solid #d1d5db; border-radius: 6px;
      padding: 10px 12px; margin-bottom: 12px;
      font-size: 10px; line-height: 1.6; color: #374151;
    }
    .declaracion h4 {
      font-size: 10px; font-weight: bold; text-transform: uppercase;
      color: #374151; margin-bottom: 6px;
    }
    /* ── Advertencia SUGEF ── */
    .advertencia {
      border: 1px solid #fca5a5; border-radius: 6px;
      padding: 8px 12px; margin-bottom: 16px;
      background: #fff7f7; font-size: 9.5px; line-height: 1.5; color: #7f1d1d;
    }
    .advertencia strong { display: block; margin-bottom: 4px; font-size: 10px; }
    /* ── Firmas ── */
    .firmas {
      display: grid; grid-template-columns: 1fr 1fr; gap: 30px;
      margin-top: 20px; page-break-inside: avoid;
    }
    .firma-bloque { text-align: center; }
    .firma-linea {
      border-top: 1px solid #374151; margin-top: 40px; padding-top: 5px;
    }
    .firma-nombre { font-weight: 600; font-size: 10px; margin-bottom: 2px; }
    .firma-rol    { font-size: 9px; color: #6b7280; }
    /* ── Pie de página ── */
    .footer {
      margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 8px;
      font-size: 9px; color: #9ca3af; text-align: center;
    }
    @media print {
      body { padding: 10px 15px; }
      @page { margin: 1.2cm; }
    }
  </style>
</head>
<body>

  <!-- ENCABEZADO -->
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div>
        <div class="tenant-nombre">${tenantNombre}</div>
        ${tenant?.cedula_juridica ? `<div class="tenant-cedula">Cédula jurídica: ${tenant.cedula_juridica}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <div class="titulo-doc">FICHA DE IDENTIFICACIÓN DE CLIENTE</div>
      <div>Tipo: ${esJuridica ? 'Persona Jurídica' : 'Persona Física'}</div>
      <div>Fecha: ${fecha}</div>
      <div>Hora: ${hora}</div>
    </div>
  </div>

  <!-- DATOS PRINCIPALES -->
  <div class="seccion">
    <h2>${esJuridica ? 'Datos de la empresa' : 'Datos personales'}</h2>
    <table class="datos">
      <tbody>
        ${esJuridica
          ? filaTabla('Nombre de la empresa', cliente.nombre_empresa)
          : filaTabla('Nombre completo', [cliente.nombre_cliente, cliente.primer_apellido, cliente.segundo_apellido].filter(Boolean).join(' '))
        }
        ${filaTabla('Tipo de identificación', TIPO_ID_LABEL[cliente.tipo_identificacion] || cliente.tipo_identificacion)}
        ${filaTabla('Número de identificación', cliente.numero_identificacion)}
        ${filaTabla('Nacionalidad', cliente.nacionalidad)}
        ${filaTabla('País de ubicación', cliente.pais_ubicacion)}
        ${filaTabla('Actividad económica', cliente.actividad_economica)}
        ${filaTabla('Teléfono', cliente.telefono)}
        ${filaTabla('Correo electrónico', cliente.correo_electronico)}
        ${filaTabla('Fecha de vinculación', fechaLarga(cliente.fecha_vinculacion))}
        ${cliente.fecha_termino_relacion
          ? filaTabla('Término de relación', fechaLarga(cliente.fecha_termino_relacion))
          : ''}
      </tbody>
    </table>
  </div>

  ${esJuridica ? tablaPersonas(personas, 'representante_legal', 'Representantes legales') : ''}
  ${esJuridica ? tablaPersonas(personas, 'junta_directiva',    'Junta directiva') : ''}
  ${esJuridica ? tablaPersonas(personas, 'socio',              'Socios / Accionistas (≥ 15%)') : ''}

  <!-- PEP Y LISTAS -->
  <div class="seccion">
    <h2>Perfil de riesgo y cumplimiento</h2>
    <div class="badges">
      ${cliente.pep
        ? '<span class="badge badge-pep">⚠️ PEP — Persona Expuesta Políticamente</span>'
        : '<span class="badge badge-ok">✓ No es PEP</span>'}
      ${cliente.aparece_en_listas
        ? '<span class="badge badge-listas">🔴 Aparece en listas internacionales</span>'
        : '<span class="badge badge-ok">✓ No aparece en listas</span>'}
    </div>
    ${cliente.calificacion_riesgo
      ? `<div class="riesgo-box" style="background:${RIESGO_COLOR[cliente.calificacion_riesgo] || '#374151'}">
           RIESGO ${RIESGO_LABEL[cliente.calificacion_riesgo] || cliente.calificacion_riesgo.toUpperCase()}
         </div>`
      : '<p style="font-size:10px;color:#6b7280;margin-bottom:10px">Sin calificación de riesgo asignada</p>'}
    <div class="cumplimiento-grid">
      <div class="cump-item ${cliente.kyc_actualizado ? 'ok' : 'nok'}">
        ${cliente.kyc_actualizado ? '✅' : '❌'} Formulario KYC actualizado
      </div>
      <div class="cump-item ${cliente.legal_actualizado ? 'ok' : 'nok'}">
        ${cliente.legal_actualizado ? '✅' : '❌'} Información legal actualizada
      </div>
      <div class="cump-item ${cliente.ingresos_actualizados ? 'ok' : 'nok'}">
        ${cliente.ingresos_actualizados ? '✅' : '❌'} Información de ingresos actualizada
      </div>
      <div class="cump-item ${!cliente.aparece_en_listas ? 'ok' : 'nok'}">
        ${!cliente.aparece_en_listas ? '✅' : '❌'} Sin coincidencias en listas
      </div>
    </div>
    ${cliente.nivel_transaccional_max_mes
      ? `<p style="font-size:10px;color:#6b7280">
           Nivel transaccional máximo mensual: <strong>USD ${Number(cliente.nivel_transaccional_max_mes).toLocaleString('es-CR')}</strong>
         </p>`
      : ''}
    ${cliente.notas
      ? `<p style="font-size:10px;color:#374151;margin-top:6px;padding:6px 8px;background:#f9fafb;border-radius:4px;border:1px solid #e5e7eb">
           <strong>Notas:</strong> ${cliente.notas}
         </p>`
      : ''}
  </div>

  <!-- DECLARACIÓN LEGAL -->
  <div class="declaracion">
    <h4>Declaración del cliente — Ley 7786</h4>
    <p>${declaracion.replace(/\n/g, '<br>')}</p>
  </div>

  <!-- ADVERTENCIA SUGEF -->
  <div class="advertencia">
    <strong>ADVERTENCIA SUGEF</strong>
    ${advertencia}
  </div>

  <!-- BLOQUES DE FIRMA -->
  <div class="firmas">
    <div class="firma-bloque">
      <div class="firma-linea">
        <div class="firma-nombre">${nombreCliente(cliente)}</div>
        <div class="firma-rol">
          ${esJuridica ? 'Representante legal / Firma autorizada' : 'Firma del cliente'}
        </div>
        <div class="firma-rol" style="margin-top:3px">
          Número de identificación: ${cliente.numero_identificacion || '___________________'}
        </div>
      </div>
    </div>
    <div class="firma-bloque">
      <div class="firma-linea">
        <div class="firma-nombre">${declarante}</div>
        <div class="firma-rol">Oficial de cumplimiento / ${tenantNombre}</div>
        <div class="firma-rol" style="margin-top:3px">Fecha: ${fecha}</div>
      </div>
    </div>
  </div>

  <!-- PIE -->
  <div class="footer">
    Documento generado por el sistema CNL Craniley Compliance · ${tenantNombre} · ${fecha} ${hora}
    ${tenant?.cedula_juridica ? '· C.J. ' + tenant.cedula_juridica : ''}
  </div>

  <script>
    window.onload = function() {
      window.print()
    }
  </script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    alert('Por favor permita ventanas emergentes para imprimir.')
    return
  }
  w.document.write(html)
  w.document.close()
}
