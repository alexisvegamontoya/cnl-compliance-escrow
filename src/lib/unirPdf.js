// Une varias piezas (PDF, JPG, PNG) en un solo PDF, todo en el navegador: nada
// se sube al servidor. Carga pdf-lib de forma diferida (solo cuando se usa).
//
//   partes: [{ nombre, blob }] en el orden en que deben aparecer.
//   omitidosPrevios: [{ nombre, motivo }] que ya se sabe que no entran.
// Devuelve { blob, incluidos, omitidos }. Los PDF se anexan página por página;
// cada imagen ocupa una página A4 (escalada con márgenes). Lo que no se puede
// incluir (otro formato, PDF cifrado o dañado) se lista en una página final
// «Documentos no incluidos».

const A4 = [595.28, 841.89]   // puntos
const MARGEN = 36             // ~1,27 cm

// Tipo real por los primeros bytes (no confiar en la extensión del archivo).
function tipoArchivo(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png'
  // %PDF puede venir tras unos bytes de basura: buscar en el primer KB
  const cab = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  if (cab.includes('%PDF-')) return 'pdf'
  return null
}

const extension = (nombre) => {
  const m = /\.([a-z0-9]{1,6})$/i.exec(nombre || '')
  return m ? m[1].toLowerCase() : ''
}

// Las fuentes estándar de PDF solo codifican WinAnsi: normalizar el texto.
function textoSeguro(t) {
  return String(t ?? '')
    .replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "")
}

// Parte el texto en líneas que quepan en `ancho` puntos.
function envolver(texto, fuente, tam, ancho) {
  const palabras = textoSeguro(texto).split(/\s+/).filter(Boolean)
  const lineas = []
  let actual = ''
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) { actual = prueba; continue }
    if (actual) lineas.push(actual)
    // Palabra más ancha que la línea (p. ej. un nombre de archivo largo): cortarla
    let resto = p
    while (fuente.widthOfTextAtSize(resto, tam) > ancho && resto.length > 1) {
      let n = resto.length
      while (n > 1 && fuente.widthOfTextAtSize(resto.slice(0, n), tam) > ancho) n--
      lineas.push(resto.slice(0, n)); resto = resto.slice(n)
    }
    actual = resto
  }
  if (actual) lineas.push(actual)
  return lineas.length ? lineas : ['']
}

export async function unirEnUnPdf(partes = [], { omitidosPrevios = [] } = {}) {
  let pdfLib
  try { pdfLib = await import('pdf-lib') }
  catch { throw new Error('No se pudo cargar el componente para unir PDF. Revise su conexión y vuelva a intentarlo.') }
  const { PDFDocument, StandardFonts, rgb } = pdfLib

  const final = await PDFDocument.create()
  final.setTitle('Expediente KYC')
  final.setProducer('CNL Craniley Compliance')
  const incluidos = []
  const omitidos = [...omitidosPrevios]

  for (const parte of partes) {
    const nombre = parte?.nombre || 'documento'
    let bytes
    try { bytes = new Uint8Array(await parte.blob.arrayBuffer()) }
    catch { omitidos.push({ nombre, motivo: 'no se pudo leer el archivo' }); continue }
    if (!bytes.length) { omitidos.push({ nombre, motivo: 'archivo vacío' }); continue }

    const tipo = tipoArchivo(bytes)
    if (tipo === 'pdf') {
      try {
        // Sin ignoreEncryption: un PDF cifrado lanza error y se omite (copiarlo
        // ignorando el cifrado produciría páginas en blanco o ilegibles).
        const origen = await PDFDocument.load(bytes, { updateMetadata: false })
        const paginas = await final.copyPages(origen, origen.getPageIndices())
        if (!paginas.length) { omitidos.push({ nombre, motivo: 'PDF sin páginas' }); continue }
        paginas.forEach(p => final.addPage(p))
        incluidos.push(nombre)
      } catch (e) {
        const cifrado = /encrypt/i.test(e?.message || '')
        omitidos.push({ nombre, motivo: cifrado ? 'PDF protegido / cifrado' : 'PDF dañado o ilegible' })
      }
      continue
    }
    if (tipo === 'jpg' || tipo === 'png') {
      try {
        const img = tipo === 'jpg' ? await final.embedJpg(bytes) : await final.embedPng(bytes)
        const pag = final.addPage(A4)
        const anchoMax = A4[0] - MARGEN * 2
        const altoMax = A4[1] - MARGEN * 2
        // Escalar para que quepa (sin agrandar más de 2x las imágenes pequeñas)
        const esc = Math.min(anchoMax / img.width, altoMax / img.height, 2)
        const w = img.width * esc, h = img.height * esc
        pag.drawImage(img, { x: (A4[0] - w) / 2, y: A4[1] - MARGEN - h, width: w, height: h })
        incluidos.push(nombre)
      } catch {
        omitidos.push({ nombre, motivo: 'imagen dañada o no compatible' })
      }
      continue
    }
    const ext = extension(nombre)
    omitidos.push({ nombre, motivo: `formato no admitido${ext ? ` (.${ext})` : ''} — solo PDF, JPG y PNG` })
  }

  // Página(s) final(es): documentos no incluidos
  if (omitidos.length) {
    const fuente = await final.embedFont(StandardFonts.Helvetica)
    const negrita = await final.embedFont(StandardFonts.HelveticaBold)
    const ancho = A4[0] - MARGEN * 2
    let pag = final.addPage(A4)
    let y = A4[1] - MARGEN
    const escribir = (txt, { f = fuente, tam = 10, color = rgb(0.08, 0.08, 0.1), sangria = 0 } = {}) => {
      for (const linea of envolver(txt, f, tam, ancho - sangria)) {
        if (y < MARGEN + tam) { pag = final.addPage(A4); y = A4[1] - MARGEN }
        pag.drawText(linea, { x: MARGEN + sangria, y: y - tam, size: tam, font: f, color })
        y -= tam + 4
      }
    }
    escribir('Documentos no incluidos', { f: negrita, tam: 16, color: rgb(0.04, 0.07, 0.28) })
    y -= 6
    escribir('Los siguientes documentos no se pudieron unir a este PDF. Consérvelos por separado: '
      + 'descárguelos uno por uno desde la solicitud KYC.', { tam: 10, color: rgb(0.35, 0.35, 0.4) })
    y -= 10
    omitidos.forEach((o, i) => {
      escribir(`${i + 1}. ${o.nombre}`, { f: negrita, tam: 10 })
      escribir(`Motivo: ${o.motivo}`, { tam: 9, color: rgb(0.42, 0.42, 0.46), sangria: 14 })
      y -= 4
    })
  }

  if (final.getPageCount() === 0) throw new Error('No hubo ningún documento que se pudiera incluir en el PDF.')
  const salida = await final.save()
  return { blob: new Blob([salida], { type: 'application/pdf' }), incluidos, omitidos }
}
