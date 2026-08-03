/**
 * imprimirDocumento.js
 * Helper compartido para generar documentos imprimibles (Informe de Labores,
 * Plan de Trabajo, Plan de Capacitación) en una ventana nueva.
 *
 * Se usa este enfoque —en lugar de window.print() sobre la propia app— porque
 * la aplicación se monta dentro de #root: cualquier regla @media print que
 * oculte el layout deja también oculto el contenido del informe (página en
 * blanco). Generando un documento independiente el resultado es predecible y
 * además no se recortan los textos largos de los <textarea>.
 */

/** Escapa texto para insertarlo con seguridad en el HTML del documento. */
export function esc(v) {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Escapa y convierte saltos de línea en <br> (para textos de textarea). */
export function escMultilinea(v) {
  return esc(v).replace(/\r?\n/g, '<br>')
}

export function fechaLarga(d = new Date()) {
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Construye el HTML completo del documento.
 * @param {string} titulo        Título principal (ej. "INFORME DE LABORES")
 * @param {string} subtitulo     Línea bajo el título
 * @param {string} cuerpo        HTML de las secciones del documento
 * @param {object} tenant        Sujeto obligado
 * @param {object} profile       Usuario que genera el documento
 * @param {string} orientacion   'portrait' | 'landscape'
 */
export function documentoHTML({ titulo, subtitulo = '', cuerpo, tenant, profile, orientacion = 'portrait' }) {
  const tenantNombre = tenant?.nombre || '[Sujeto obligado]'
  const logoHtml = tenant?.logo_url
    ? `<img src="${esc(tenant.logo_url)}" alt="${esc(tenantNombre)}" class="logo-img" />`
    : `<div class="logo-inicial">${esc(tenantNombre[0] || 'S')}</div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${esc(titulo)} — ${esc(tenantNombre)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px; color: #14141a; background: #fff;
      padding: 20px 30px;
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #0a1247; padding-bottom: 14px; margin-bottom: 18px;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .logo-img { height: 58px; width: auto; object-fit: contain; }
    .logo-inicial {
      width: 58px; height: 58px; border-radius: 10px;
      background: #0a1247; color: #fff; font-size: 26px; font-weight: bold;
      display: flex; align-items: center; justify-content: center;
    }
    .tenant-nombre { font-size: 15px; font-weight: bold; color: #0a1247; }
    .tenant-cedula { font-size: 10px; color: #6b6b76; margin-top: 2px; }
    .header-right { text-align: right; font-size: 10px; color: #6b6b76; }
    .header-right .titulo-doc { font-size: 12px; font-weight: bold; color: #14141a; margin-bottom: 4px; }

    .portada {
      border: 2px solid #0a1247; border-radius: 8px; background: #f2f3f8;
      padding: 18px; margin-bottom: 18px; text-align: center;
      page-break-inside: avoid;
    }
    .portada .confidencial {
      font-size: 9px; text-transform: uppercase; letter-spacing: .12em;
      color: #0a1247; font-weight: bold;
    }
    .portada h1 { font-size: 20px; color: #0a1247; margin: 8px 0 4px; }
    .portada h2 { font-size: 13px; color: #45454f; font-weight: 600; }
    .portada .periodo { font-size: 11px; color: #6b6b76; margin-top: 4px; }
    .meta-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
      margin-top: 14px; text-align: left;
    }
    .meta-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
    .meta-item { background: #fff; border: 1px solid #e4e4ea; border-radius: 6px; padding: 7px 9px; }
    .meta-item .lbl { font-size: 8.5px; color: #9a9aa4; text-transform: uppercase; letter-spacing: .04em; }
    .meta-item .val { font-size: 10.5px; font-weight: bold; color: #14141a; margin-top: 2px; }

    section.bloque { margin-bottom: 16px; page-break-inside: avoid; }
    section.bloque > h3 {
      font-size: 12px; font-weight: bold; color: #0a1247;
      border-bottom: 1px solid #cfcfd7; padding-bottom: 5px; margin-bottom: 9px;
    }
    .texto { font-size: 10.5px; line-height: 1.65; color: #45454f; text-align: justify; }
    .texto p + p { margin-top: 7px; }
    .vacio { font-size: 10.5px; color: #9a9aa4; font-style: italic; }

    table.datos { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    table.datos th, table.datos td { border: 1px solid #e4e4ea; padding: 5px 7px; text-align: left; vertical-align: top; }
    table.datos th { background: #eef2fc; color: #0a1247; font-weight: bold; }
    table.datos tr:nth-child(even) td { background: #f7f7f9; }
    table.datos td.centro, table.datos th.centro { text-align: center; }
    table.datos tr.total td { background: #eef2fc; font-weight: bold; color: #0a1247; }

    .stats { display: grid; gap: 8px; margin-bottom: 9px; }
    .stats.c3 { grid-template-columns: repeat(3, 1fr); }
    .stats.c4 { grid-template-columns: repeat(4, 1fr); }
    .stat { background: #f7f7f9; border: 1px solid #e4e4ea; border-radius: 6px; padding: 8px 10px; }
    .stat .val { font-size: 15px; font-weight: bold; color: #0a1247; }
    .stat .val.rojo { color: #c31b26; }
    .stat .val.naranja { color: #a87813; }
    .stat .val.verde { color: #1a5738; }
    .stat .lbl { font-size: 9px; color: #6b6b76; margin-top: 2px; }

    .aviso { border-radius: 6px; padding: 9px 12px; font-size: 10.5px; line-height: 1.55; }
    .aviso.ok { background: #eff7f1; border: 1px solid #b4dbc3; color: #15442c; }
    .aviso.warn { background: #fdf4ec; border: 1px solid #f2c9a2; color: #62310e; }

    ul.legal { list-style: disc; padding-left: 18px; font-size: 9.5px; line-height: 1.6; color: #55555f; }
    ul.legal li { margin-bottom: 3px; }

    .firmas {
      display: grid; grid-template-columns: 1fr 1fr; gap: 40px;
      margin-top: 26px; page-break-inside: avoid;
    }
    .firma { text-align: center; }
    .firma .linea { border-top: 1px solid #45454f; margin-top: 46px; padding-top: 6px; }
    .firma .nombre { font-size: 11px; font-weight: bold; color: #14141a; }
    .firma .cargo { font-size: 9.5px; color: #6b6b76; margin-top: 2px; }
    .firma .fecha { font-size: 9px; color: #9a9aa4; margin-top: 4px; }

    .pie {
      margin-top: 22px; padding-top: 10px; border-top: 1px solid #e4e4ea;
      text-align: center; font-size: 9px; color: #9a9aa4; line-height: 1.5;
    }

    @page { size: A4 ${orientacion}; margin: 1.2cm; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div>
        <div class="tenant-nombre">${esc(tenantNombre)}</div>
        ${tenant?.cedula_juridica ? `<div class="tenant-cedula">Cédula jurídica: ${esc(tenant.cedula_juridica)}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <div class="titulo-doc">${esc(titulo)}</div>
      ${subtitulo ? `<div>${esc(subtitulo)}</div>` : ''}
      <div>Generado: ${esc(fechaLarga())}</div>
      ${profile?.nombre ? `<div>Por: ${esc(profile.nombre)}</div>` : ''}
    </div>
  </div>

  ${cuerpo}

</body>
</html>`
}

/**
 * Imprime el contenido de un nodo que ya está renderizado (con estilos en línea)
 * copiándolo a una ventana nueva.
 *
 * Se evita a propósito el truco de `position: fixed` dentro de @media print:
 * Chrome repite los elementos fijos en cada página impresa, por lo que el
 * encabezado se dibuja encima del texto a partir de la segunda hoja.
 */
export function imprimirNodo(idElemento, { titulo = 'Documento', orientacion = 'portrait', anchoMax = '780px' } = {}) {
  const nodo = document.getElementById(idElemento)
  if (!nodo) {
    alert('No se encontró el contenido a imprimir.')
    return
  }
  const w = window.open('', '_blank', 'width=1000,height=760')
  if (!w) {
    alert('El navegador bloqueó la ventana emergente. Permita las ventanas emergentes para este sitio e intente de nuevo.')
    return
  }
  w.document.open()
  w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${esc(titulo)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #14141a;
      background: #fff; margin: 0 auto; padding: 0; max-width: ${anchoMax};
    }
    img { max-width: 100%; }
    table { page-break-inside: auto; break-inside: auto; }
    tr, td, th { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
    h1, h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
    @page { size: A4 ${orientacion}; margin: 15mm; }
  </style>
</head>
<body>${nodo.innerHTML}</body>
</html>`)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* el usuario puede imprimir manualmente */ } }, 500)
}

/** Abre el documento en una ventana nueva y lanza el diálogo de impresión. */
export function imprimirDocumento(opts) {
  const html = documentoHTML(opts)
  const w = window.open('', '_blank', 'width=1000,height=760')
  if (!w) {
    alert('El navegador bloqueó la ventana emergente. Permita las ventanas emergentes para este sitio e intente de nuevo.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  // Pequeña espera para que se apliquen los estilos y cargue el logo
  setTimeout(() => { try { w.focus(); w.print() } catch { /* el usuario puede imprimir manualmente */ } }, 500)
}
