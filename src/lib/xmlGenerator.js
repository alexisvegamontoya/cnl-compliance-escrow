// ============================================================
// Generador XML SICVECA — Formato APNFD Ley 7786
// ============================================================

import { format } from 'date-fns'

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
 * Genera el XML SICVECA para un período dado
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
    periodo,           // Date object o string 'YYYY-MM-DD'
    version_clase = '1.00',
    version_archivo = '1.00',
  } = config

  const periodoFmt = typeof periodo === 'string'
    ? periodo.substring(0, 7)          // YYYY-MM
    : format(periodo, 'yyyy-MM')

  let registros = ''
  transacciones.forEach((t, idx) => {
    const registroId = idx + 1
    const esFisica = [1, 3, 5].includes(t.tipo_identificacion)

    registros += `
      <Registro>
        <RegistroId>${registroId}</RegistroId>
        <Accion>${escapeXml(t.accion || 'insertar')}</Accion>
        <NumeroIdentificacion>${escapeXml(t.numero_identificacion)}</NumeroIdentificacion>
        <TipoIdentificacion>${t.tipo_identificacion}</TipoIdentificacion>
        ${esFisica
          ? `<NombreCliente>${escapeXml(t.nombre_cliente)}</NombreCliente>
        <PrimerApellidoCliente>${escapeXml(t.primer_apellido)}</PrimerApellidoCliente>
        <SegundoApellidoCliente>${escapeXml(t.segundo_apellido || '')}</SegundoApellidoCliente>`
          : `<NombreEmpresa>${escapeXml(t.nombre_empresa)}</NombreEmpresa>`}
        <TipoReporte>${t.tipo_reporte}</TipoReporte>
        <TipoOperacion>${t.tipo_operacion}</TipoOperacion>
        <TipoMovimiento>${t.tipo_movimiento}</TipoMovimiento>
        <TipoIngreso>${t.tipo_ingreso ?? 0}</TipoIngreso>
        <TipoSalida>${t.tipo_salida ?? 0}</TipoSalida>
        <TipoMonedaMovimiento>${t.tipo_moneda_movimiento}</TipoMonedaMovimiento>
        <MontoMovimiento>${Number(t.monto_movimiento).toFixed(2)}</MontoMovimiento>
        ${t.fecha_transaccion ? `<FechaTransaccion>${t.fecha_transaccion}</FechaTransaccion>` : ''}
        ${t.motivo_transaccion ? `<MotivoTransaccion>${escapeXml(t.motivo_transaccion)}</MotivoTransaccion>` : ''}
        ${t.origen_recursos ? `<OrigenRecursos>${t.origen_recursos}</OrigenRecursos>` : ''}
        ${t.ubicacion_cliente ? `<UbicacionCliente>${escapeXml(t.ubicacion_cliente)}</UbicacionCliente>` : ''}
        ${t.motivo_credito ? `<MotivoCredito>${t.motivo_credito}</MotivoCredito>` : ''}
        ${t.ubicacion_comprador_vendedor ? `<UbicacionCompradorVendedor>${escapeXml(t.ubicacion_comprador_vendedor)}</UbicacionCompradorVendedor>` : ''}
        ${t.pais_origen_recursos ? `<PaisOrigenRecursos>${escapeXml(t.pais_origen_recursos)}</PaisOrigenRecursos>` : ''}
        ${t.pais_destino_recursos ? `<PaisDestinoRecursos>${escapeXml(t.pais_destino_recursos)}</PaisDestinoRecursos>` : ''}
      </Registro>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<SICVECA>
  <Encabezado>
    <ClaseDato>${clase_dato}</ClaseDato>
    <Archivo>${archivo}</Archivo>
    <VersionClaseDato>${version_clase}</VersionClaseDato>
    <VersionArchivo>${version_archivo}</VersionArchivo>
    <Periodo>${periodoFmt}</Periodo>
    <IdEntidad>${escapeXml(cedula_juridica)}</IdEntidad>
    <TipoCarga>${tipo_carga}</TipoCarga>
    <TipoMoneda>${tipo_moneda}</TipoMoneda>
    <TotalRegistros>${transacciones.length}</TotalRegistros>
  </Encabezado>
  <Detalle>${registros}
  </Detalle>
</SICVECA>`
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
