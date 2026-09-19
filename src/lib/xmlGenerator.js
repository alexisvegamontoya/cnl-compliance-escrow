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

  // Cada actividad APNFD tiene su propio esquema (XSD) y estructura de Registro.
  const clase = Number(clase_dato)
  const esOSFL = clase === 42   // Organizaciones Sin Fines de Lucro (Donador/Beneficiario)
  const SCHEMAS = {
    40: 'MetalesPiedrasPreciosas.xsd', 41: 'CasasEmpeno.xsd', 42: 'SinFindeLucro.xsd',
    43: 'Casinos.xsd', 44: 'AdministracionDinero.xsd', 45: 'RemesasTransferencias.xsd',
    46: 'EmisionOperacionTarjetas.xsd', 47: 'FacilidadesCrediticias.xsd',
    48: 'ServiciosFiduciarios.xsd', 49: 'BienesInmuebles.xsd',
  }
  const schema = SCHEMAS[clase] || 'FacilidadesCrediticias.xsd'
  // Actividades base + campo de ubicación + países de recursos. El elemento de
  // ubicación difiere: unas usan UbicacionCliente y otras UbicacionCompradorVendedor.
  const UBIC_EL = {
    40: 'UbicacionCompradorVendedor', 41: 'UbicacionCompradorVendedor', 49: 'UbicacionCompradorVendedor',
    44: 'UbicacionCliente', 46: 'UbicacionCliente', 48: 'UbicacionCliente',
  }
  const ubicEl = UBIC_EL[clase]

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

    // Solo aplica un código según el movimiento: en un ingreso (1) TipoSalida=0;
    // en una salida (2) TipoIngreso=0. Evita que ambos campos lleven número.
    const esIngreso = Number(t.tipo_movimiento) === 1
    const tipoIngreso = esIngreso ? (t.tipo_ingreso ?? 0) : 0
    const tipoSalida  = Number(t.tipo_movimiento) === 2 ? (t.tipo_salida ?? 0) : 0

    if (esOSFL) {
      // Reglas SICVECA para OSFL según el Tipo de Movimiento:
      //  • Ingreso (1): la contraparte se reporta como DONADOR; Beneficiario vacío; TipoSalida=0.
      //  • Salida  (2): la contraparte se reporta como BENEFICIARIO; Donador vacío (incluida
      //    la identificación de cabecera); TipoIngreso=0.
      //  • Ingreso/Salida (3): se llenan ambos bloques.
      const movi   = Number(t.tipo_movimiento)
      const donFill = (movi === 1 || movi === 3)   // llenar bloque Donador
      const benFill = (movi === 2 || movi === 3)   // llenar bloque Beneficiario
      const numId  = escapeXml(t.numero_identificacion || '')
      const tId    = t.tipo_identificacion
      const tIngresoOSFL = donFill ? (t.tipo_ingreso ?? 0) : 0
      const tSalidaOSFL  = benFill ? (t.tipo_salida ?? 0) : 0
      registros += `
        <Registro id="${registroId}" accion="${accion}">
            <NumeroIdentificacion>${donFill ? numId : ''}</NumeroIdentificacion>
            <TipoIdentificacion>${donFill ? tId : ''}</TipoIdentificacion>
            <NombreDonador>${donFill ? nombreCliente : ''}</NombreDonador>
            <PrimerApellidoDonador>${donFill ? primerApellido : ''}</PrimerApellidoDonador>
            <SegundoApellidoDonador>${donFill ? segundoApellido : ''}</SegundoApellidoDonador>
            <NombreEmpresaDonador>${donFill ? nombreEmpresa : ''}</NombreEmpresaDonador>
            <NumeroIdentificacionBeneficiario>${benFill ? numId : ''}</NumeroIdentificacionBeneficiario>
            <TipoIdentificacionBeneficiario>${benFill ? tId : ''}</TipoIdentificacionBeneficiario>
            <NombreBeneficiario>${benFill ? nombreCliente : ''}</NombreBeneficiario>
            <PrimerApellidoBeneficiario>${benFill ? primerApellido : ''}</PrimerApellidoBeneficiario>
            <SegundoApellidoBeneficiario>${benFill ? segundoApellido : ''}</SegundoApellidoBeneficiario>
            <NombreEmpresaBeneficiario>${benFill ? nombreEmpresa : ''}</NombreEmpresaBeneficiario>
            <TipoReporte>${t.tipo_reporte}</TipoReporte>
            <TipoOperacion>${t.tipo_operacion}</TipoOperacion>
            <TipoMovimiento>${t.tipo_movimiento}</TipoMovimiento>
            <TipoIngreso>${tIngresoOSFL}</TipoIngreso>
            <TipoSalida>${tSalidaOSFL}</TipoSalida>
            <TipoMonedaMovimiento>${t.tipo_moneda_movimiento}</TipoMonedaMovimiento>
            <MontoMovimiento>${Number(t.monto_movimiento).toFixed(2)}</MontoMovimiento>
            <FechaTransaccion>${fmtFecha(t.fecha_transaccion)}</FechaTransaccion>
            <MotivoTransaccion>${escapeXml(t.motivo_transaccion || '')}</MotivoTransaccion>
            <OrigenRecursos>${escapeXml(t.origen_recursos || '')}</OrigenRecursos>
            <UbicacionDonador>${escapeXml(t.ubicacion_cliente || 'CR')}</UbicacionDonador>
            <PaisOrigenRecursos>${escapeXml(t.pais_origen_recursos || 'CR')}</PaisOrigenRecursos>
            <PaisDestinoRecursos>${escapeXml(t.pais_destino_recursos || 'CR')}</PaisDestinoRecursos>
        </Registro>`
    } else if (clase === 43) {
      // Casinos: ingreso y salida por separado + movimiento neto (ganancia/pérdida).
      const monto = Number(t.monto_movimiento).toFixed(2)
      const mon = t.tipo_moneda_movimiento
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
            <TipoIngreso>${esIngreso ? (t.tipo_ingreso ?? 0) : 0}</TipoIngreso>
            <TipoMonedaMovimientoIngreso>${esIngreso ? mon : ''}</TipoMonedaMovimientoIngreso>
            <MontoMovimientoIngreso>${esIngreso ? monto : '0.00'}</MontoMovimientoIngreso>
            <TipoSalida>${!esIngreso ? (t.tipo_salida ?? 0) : 0}</TipoSalida>
            <TipoMonedaMovimientoSalida>${!esIngreso ? mon : ''}</TipoMonedaMovimientoSalida>
            <MontoMovimientoSalida>${!esIngreso ? monto : '0.00'}</MontoMovimientoSalida>
            <TipoMovimientoNeto>${esIngreso ? 1 : 2}</TipoMovimientoNeto>
            <MontoMovimientoNeto>${monto}</MontoMovimientoNeto>
            <FechaTransaccion>${fmtFecha(t.fecha_transaccion)}</FechaTransaccion>
            <MotivoTransaccion>${escapeXml(t.motivo_transaccion || '')}</MotivoTransaccion>
            <OrigenRecursos>${escapeXml(t.origen_recursos || '')}</OrigenRecursos>
            <PaisOrigenRecursos>${escapeXml(t.pais_origen_recursos || 'CR')}</PaisOrigenRecursos>
        </Registro>`
    } else if (clase === 45) {
      // Remesas/Transferencias: incluye bloque del receptor/remitente (contraparte).
      registros += `
        <Registro id="${registroId}" accion="${accion}">
            <NumeroIdentificacion>${escapeXml(t.numero_identificacion)}</NumeroIdentificacion>
            <TipoIdentificacion>${t.tipo_identificacion}</TipoIdentificacion>
            <NombreCliente>${nombreCliente}</NombreCliente>
            <PrimerApellidoCliente>${primerApellido}</PrimerApellidoCliente>
            <SegundoApellidoCliente>${segundoApellido}</SegundoApellidoCliente>
            <NombreEmpresa>${nombreEmpresa}</NombreEmpresa>
            <TipoPersonaReceptorRemitente></TipoPersonaReceptorRemitente>
            <NumeroIdentificacionReceptorRemitente></NumeroIdentificacionReceptorRemitente>
            <TipoIdentificacionReceptorRemitente></TipoIdentificacionReceptorRemitente>
            <NombreClienteReceptorRemitente></NombreClienteReceptorRemitente>
            <PrimerApellidoReceptorRemitente></PrimerApellidoReceptorRemitente>
            <SegundoApellidoReceptorRemitente></SegundoApellidoReceptorRemitente>
            <NombreEmpresaClienteReceptorRemitente></NombreEmpresaClienteReceptorRemitente>
            <TipoReporte>${t.tipo_reporte}</TipoReporte>
            <TipoOperacion>${t.tipo_operacion}</TipoOperacion>
            <TipoMovimiento>${t.tipo_movimiento}</TipoMovimiento>
            <TipoIngreso>${tipoIngreso}</TipoIngreso>
            <TipoSalida>${tipoSalida}</TipoSalida>
            <TipoMonedaMovimiento>${t.tipo_moneda_movimiento}</TipoMonedaMovimiento>
            <MontoMovimiento>${Number(t.monto_movimiento).toFixed(2)}</MontoMovimiento>
            <FechaTransaccion>${fmtFecha(t.fecha_transaccion)}</FechaTransaccion>
            <MotivoTransaccion>${escapeXml(t.motivo_transaccion || '')}</MotivoTransaccion>
            <OrigenRecursos>${escapeXml(t.origen_recursos || '')}</OrigenRecursos>
            <PaisOrigenDestino>${escapeXml(t.pais_origen_recursos || t.pais_destino_recursos || 'CR')}</PaisOrigenDestino>
            <EntidadExteriorTramitaRemesa></EntidadExteriorTramitaRemesa>
            <DestinoRecursos>${escapeXml(t.pais_destino_recursos || '')}</DestinoRecursos>
        </Registro>`
    } else if (ubicEl) {
      // Actividades: Admin. de Dinero (44), Serv. Fiduciarios (48), Bienes Inmuebles (49),
      // Metales (40), Casas de Empeño (41), Tarjetas (46) → base + <Ubicacion…> + países.
      const ubicVal = escapeXml(
        (clase === 44 || clase === 46 || clase === 48) ? (t.ubicacion_cliente || 'CR') : (t.ubicacion_comprador_vendedor || 'CR')
      )
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
            <TipoIngreso>${tipoIngreso}</TipoIngreso>
            <TipoSalida>${tipoSalida}</TipoSalida>
            <TipoMonedaMovimiento>${t.tipo_moneda_movimiento}</TipoMonedaMovimiento>
            <MontoMovimiento>${Number(t.monto_movimiento).toFixed(2)}</MontoMovimiento>
            <FechaTransaccion>${fmtFecha(t.fecha_transaccion)}</FechaTransaccion>
            <MotivoTransaccion>${escapeXml(t.motivo_transaccion || '')}</MotivoTransaccion>
            <OrigenRecursos>${escapeXml(t.origen_recursos || '')}</OrigenRecursos>
            <${ubicEl}>${ubicVal}</${ubicEl}>
            <PaisOrigenRecursos>${escapeXml(t.pais_origen_recursos || 'CR')}</PaisOrigenRecursos>
            <PaisDestinoRecursos>${escapeXml(t.pais_destino_recursos || 'CR')}</PaisDestinoRecursos>
        </Registro>`
    } else {
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
            <TipoIngreso>${tipoIngreso}</TipoIngreso>
            <TipoSalida>${tipoSalida}</TipoSalida>
            <TipoMonedaMovimiento>${t.tipo_moneda_movimiento}</TipoMonedaMovimiento>
            <MontoMovimiento>${Number(t.monto_movimiento).toFixed(2)}</MontoMovimiento>
            ${t.fecha_transaccion ? `<FechaTransaccion>${fmtFecha(t.fecha_transaccion)}</FechaTransaccion>` : ''}
            ${t.motivo_transaccion ? `<MotivoTransaccion>${escapeXml(t.motivo_transaccion)}</MotivoTransaccion>` : ''}
            <OrigenRecursos>${escapeXml(t.origen_recursos || '')}</OrigenRecursos>
            ${t.motivo_credito ? `<MotivoCredito>${t.motivo_credito}</MotivoCredito>` : ''}
        </Registro>`
    }
  })

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ArchivoSICVECA NS0:noNamespaceSchemaLocation="${schema}" xmlns:NS0="http://www.w3.org/2001/XMLSchema-instance">
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
