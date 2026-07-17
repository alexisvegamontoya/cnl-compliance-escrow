// ============================================================
// Generador XML SICVECA — Formato ArchivoSICVECA (FacilidadesCrediticias.xsd)
// Basado en el esquema XSD oficial de SUGEF para Clase 47 APNFD
// ============================================================

/**
 * Escapa caracteres especiales para XML
 */
function escapeXml(val) {
  if (val === null || val === undefined) return ''
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Convierte fecha de YYYY-MM-DD a dd/MM/YYYY (formato requerido por SICVECA)
 */
function fmtFecha(fecha) {
  if (!fecha) return ''
  // Si ya viene en formato dd/MM/YYYY, dejarlo igual
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) return fecha
  // Convertir de YYYY-MM-DD
  const [yr, mo, dy] = fecha.substring(0, 10).split('-')
  return `${dy}/${mo}/${yr}`
}

/**
 * Genera el XML SICVECA para un período dado
 * Formato: ArchivoSICVECA / FacilidadesCrediticias.xsd (SUGEF)
 *
 * @param {Object} config - Configuración del sujeto obligado
 * @param {Array}  transacciones - Lista de transacciones del período
 * @returns {string} XML como string
 */
export function generarXMLSICVECA(config, transacciones) {
  const {
    clase_dato,
    archivo,
    cedula_juridica,
    tipo_carga = 1,
    tipo_moneda = 1,
    periodo,           // string 'YYYY-MM-DD' (se usa solo el año y mes; día siempre 01)
    version_clase = '1.00',
    version_archivo = '1.00',
  } = config

  // Periodo: siempre día 01, formato dd/MM/YYYY (ej: 01/04/2026)
  const periodoStr = typeof periodo === 'string' ? periodo.substring(0, 10) : ''
  const [yr, mo] = periodoStr.split('-')
  const periodoFmt = `01/${mo}/${yr}`

  let registros = ''
  transacciones.forEach((t, idx) => {
    const registroId = idx + 1
    const accion = 'insertar'  // Siempre 'insertar' para SICVECA; TipoCarga maneja correcciones
    const esFisica = [1, 3, 5].includes(Number(t.tipo_identificacion))

    // Siempre se incluyen los 4 campos de nombre; vacíos según aplique
    const nombreCliente   = esFisica ? escapeXml(t.nombre_cliente || '') : ''
    const primerApellido  = esFisica ? escapeXml(t.primer_apellido || '') : ''
    const segundoApellido = esFisica ? escapeXml(t.segundo_apellido || '') : ''
    const nombreEmpresa   = !esFisica ? escapeXml(t.nombre_empresa || '') : ''

    registros += `
        <Registro id="${registroId}" accion="${accion}">
            <NumeroIdentificacion>${escapeXml(t.numero_identificacion)}</NumeroIdentificacion>
            <TipoIdentificacion>${t.tipo_identificacion}</TipoIdentificacion>
            <NombreCliente>${nombreCliente}</NombreCliente>
            <PrimerApellidoCliente>${primerApellido}</PrimerApellidoCliente>
            <SegundoApellidoCliente>${segundoApellido}</SegundoApellidoCliente>
            <NombreEmpresa>${nombreEmpresa}</NombreEmpresa>
            <TipoReporte>${t.tipo_reporte}</TipoReporte>
            <TipoOperacion>${t.tipo_operacion}</TipoOperacion>
            <TipoMovimiento>${t.tipo_movimiento}</TipoMovimiento>
            <TipoIngreso>${t.tipo_ingreso ?? 0}</TipoIngreso>
            <TipoSalida>${t.tipo_salida ?? 0}</TipoSalida>
            <TipoMonedaMovimiento>${t.tipo_moneda_movimiento}</TipoMonedaMovimiento>
            <MontoMovimiento>${Number(t.monto_movimiento).toFixed(2)}</MontoMovimiento>
            ${t.fecha_transaccion ? `<FechaTransaccion>${fmtFecha(t.fecha_transaccion)}</FechaTransaccion>` : ''}
            ${t.motivo_transaccion ? `<MotivoTransaccion>${escapeXml(t.motivo_transaccion)}</MotivoTransaccion>` : ''}
            <OrigenRecursos>${escapeXml(t.origen_recursos || '')}</OrigenRecursos>
            ${t.motivo_credito ? `<MotivoCredito>${t.motivo_credito}</MotivoCredito>` : ''}
        </Registro>`
  })

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ArchivoSICVECA NS0:noNamespaceSchemaLocation="FacilidadesCrediticias.xsd" xmlns:NS0="http://www.w3.org/2001/XMLSchema-instance">
    <Encabezado>
        <ClaseDato>${clase_dato}</ClaseDato>
        <VersionClaseDato>${version_clase}</VersionClaseDato>
        <Archivo>${archivo}</Archivo>
        <VersionArchivo>${version_archivo}</VersionArchivo>
        <Periodo>${periodoFmt}</Periodo>
        <IdEntidad>${escapeXml(cedula_juridica)}</IdEntidad>
        <TipoCarga>${tipo_carga}</TipoCarga>
        <TipoMoneda>${tipo_moneda}</TipoMoneda>
    </Encabezado>
    <Datos>${registros}
    </Datos>
</ArchivoSICVECA>`
}

/**
 * Descarga el XML como archivo en el navegador
 */
export function descargarXML(xmlContent, nombreArchivo) {
  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombreArchivo}.xml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
