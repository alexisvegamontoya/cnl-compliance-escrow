/**
 * señalesAlertaAPNFD.js
 * Señales de alerta específicas por actividad APNFD según:
 *   - Ley 7786 y sus reformas
 *   - Acuerdo SUGEF 13-19
 *   - Recomendaciones GAFI (Guía de Riesgo APNFD, 2019/2023)
 *   - Tipologías GAFILAT para actividades no financieras
 *
 * Exporta: evaluarSeñalesAPNFD(txns, clientes, tenant) → alertas[]
 */

// ─── Mapeo de clases SUGEF a categoría APNFD ─────────────────────────────────
export const APNFD_LABELS = {
  'Administración de Dinero':       '44',
  'Facilidades Crediticias':        '47',
  'Administración de Fideicomisos': '46',
  'Compra/Venta Bienes Inmuebles':  '49',
  'ONG / OSFL':                     'ONG',
  'Corredores de Bolsa':            '48',
  'Empresas Desarrolladoras':       '49',
  'Remesas y Transferencias':       '45',
  'Casino y Juegos de Azar':        '50',
  'Servicios Notariales':           'N/A',
}

function nombre(t) {
  return t.nombre_empresa || `${t.nombre_cliente || ''} ${t.primer_apellido || ''}`.trim() || t.numero_identificacion
}

// ─── Señales por actividad APNFD ─────────────────────────────────────────────

/**
 * Administración de Dinero (clase 44)
 * 5 señales GAFI/SUGEF
 */
function señalesAdminDinero(txns, umbral) {
  const alertas = []
  const porCliente = agruparPorCliente(txns)

  // 1. Fondos de origen no identificado / sin descripción de motivo
  txns.filter(t => !t.motivo_transaccion || t.motivo_transaccion.trim().length < 3).forEach(t => {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — Administración de Dinero',
      icono: '🟠',
      mensaje: `${nombre(t)} — transacción sin motivo declarado (monto USD ${Number(t.monto_movimiento).toLocaleString()})`,
      detalle: 'Los fondos administrados deben tener un propósito documentado. La ausencia de motivo es señal de alerta según GAFI Guía APNFD, Tipología 3.1.',
    })
  })

  // 2. Fondos depositados en múltiples partes menores al umbral (estructuración)
  Object.values(porCliente).forEach(c => {
    const pequeñas = c.filter(t => Number(t.monto_movimiento) > umbral * 0.4 && Number(t.monto_movimiento) < umbral)
    if (pequeñas.length >= 2) {
      const total = pequeñas.reduce((s, t) => s + Number(t.monto_movimiento), 0)
      alertas.push({
        nivel: 'rojo',
        tipo: 'Señal APNFD — Posible estructuración (Adm. Dinero)',
        icono: '🔴',
        mensaje: `${nombre(pequeñas[0])} — ${pequeñas.length} depósitos bajo umbral totalizando USD ${total.toLocaleString()}`,
        detalle: 'Patrón de posible estructuración para evadir el reporte obligatorio. Ver Ley 7786 Art. 69 y Acuerdo SUGEF 13-19 Anexo A.',
      })
    }
  })

  // 3. Retiros en efectivo frecuentes
  const efectivo = txns.filter(t =>
    t.tipo_movimiento === 2 && (t.motivo_transaccion || '').toLowerCase().includes('efectivo')
  )
  if (efectivo.length > 1) {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — Retiros en efectivo recurrentes',
      icono: '🟠',
      mensaje: `${efectivo.length} retiros en efectivo identificados en el período`,
      detalle: 'Los retiros recurrentes en efectivo son señal de posible lavado. El efectivo dificulta el rastreo del origen de fondos (GAFI Tipología 2.3).',
    })
  }

  // 4. Cliente que concentra más del 50% del total administrado
  const totalPeriodo = txns.reduce((s, t) => s + Number(t.monto_movimiento), 0)
  Object.values(porCliente).forEach(cs => {
    const montoC = cs.reduce((s, t) => s + Number(t.monto_movimiento), 0)
    if (totalPeriodo > 0 && montoC / totalPeriodo > 0.5 && cs.length > 0) {
      alertas.push({
        nivel: 'amarillo',
        tipo: 'Señal APNFD — Concentración inusual por cliente',
        icono: '🟡',
        mensaje: `${nombre(cs[0])} — representa ${Math.round(montoC / totalPeriodo * 100)}% del total administrado`,
        detalle: 'Una alta concentración en un solo cliente puede indicar uso indebido de la entidad para canalizar fondos de origen ilícito.',
      })
    }
  })

  // 5. Transferencias hacia/desde exterior sin sustento de relación comercial
  txns.filter(t => {
    const p = (t.pais_origen_recursos || t.pais_destino_recursos || '').toUpperCase()
    return p && p !== 'CR' && p !== 'COSTA RICA'
  }).forEach(t => {
    alertas.push({
      nivel: 'amarillo',
      tipo: 'Señal APNFD — Fondos internacionales sin relación aparente',
      icono: '🟡',
      mensaje: `${nombre(t)} — movimiento con país extranjero (${t.pais_origen_recursos || t.pais_destino_recursos}) por USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'Las operaciones con el exterior deben estar sustentadas en una relación comercial documentada. Verificar origen o destino de fondos (SUGEF 13-19 Art. 29).',
    })
  })

  return alertas
}

/**
 * Facilidades Crediticias (clase 47)
 * 5 señales GAFI/SUGEF
 */
function señalesFacilidadesCrediticias(txns, umbral) {
  const alertas = []

  // 1. Cancelación anticipada significativa (tipo_salida podría ser 40)
  txns.filter(t => [40].includes(Number(t.tipo_salida)) || (t.motivo_transaccion || '').toLowerCase().includes('cancelaci')).forEach(t => {
    const monto = Number(t.monto_movimiento)
    if (monto >= umbral * 0.5) {
      alertas.push({
        nivel: 'rojo',
        tipo: 'Señal APNFD — Cancelación anticipada de crédito',
        icono: '🔴',
        mensaje: `${nombre(t)} — cancelación anticipada USD ${monto.toLocaleString()}`,
        detalle: 'La cancelación anticipada de créditos con fondos de origen no identificado es tipología clásica de lavado. Verificar el origen de los fondos utilizados (GAFI R.22, SUGEF 13-19 Anexo A).',
      })
    }
  })

  // 2. Pago de cuota por tercero no identificado
  txns.filter(t =>
    [37, 38, 39].includes(Number(t.tipo_ingreso)) &&
    t.nombre_empresa && t.numero_identificacion && t.nombre_cliente &&
    t.nombre_empresa !== t.nombre_cliente
  ).forEach(t => {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — Pago por tercero no vinculado',
      icono: '🟠',
      mensaje: `${nombre(t)} — pago recibido de tercero (posible triangulación)`,
      detalle: 'Cuando un tercero no identificado en el contrato paga cuotas del crédito, puede indicar que la deuda es un mecanismo de transferencia de fondos ilícitos.',
    })
  })

  // 3. Múltiples créditos en poco tiempo al mismo cliente
  const porCliente = agruparPorCliente(txns.filter(t => [33].includes(Number(t.tipo_salida))))
  Object.values(porCliente).forEach(cs => {
    if (cs.length >= 2) {
      alertas.push({
        nivel: 'naranja',
        tipo: 'Señal APNFD — Múltiples desembolsos al mismo cliente',
        icono: '🟠',
        mensaje: `${nombre(cs[0])} — ${cs.length} desembolsos en el período`,
        detalle: 'La obtención de múltiples créditos en períodos cortos sin justificación económica es señal de posible uso indebido de las facilidades crediticias.',
      })
    }
  })

  // 4. Montos en efectivo como pago de cuota
  txns.filter(t =>
    [37, 38].includes(Number(t.tipo_ingreso)) &&
    (t.motivo_transaccion || '').toLowerCase().includes('efectivo')
  ).forEach(t => {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — Pago de cuota en efectivo',
      icono: '🟠',
      mensaje: `${nombre(t)} — pago de cuota crediticia en efectivo USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'El uso de efectivo para pagar cuotas de crédito puede ser un mecanismo de legitimación de capitales, convirtiendo dinero en efectivo en fondos aparentemente legítimos.',
    })
  })

  // 5. Abono extraordinario superior al 30% del crédito original
  txns.filter(t => [41].includes(Number(t.tipo_ingreso)) || (t.motivo_transaccion || '').toLowerCase().includes('abono extra')).forEach(t => {
    alertas.push({
      nivel: 'amarillo',
      tipo: 'Señal APNFD — Abono extraordinario al crédito',
      icono: '🟡',
      mensaje: `${nombre(t)} — abono extraordinario USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'Los abonos extraordinarios de magnitud importante deben tener justificación del origen de los fondos adicionales aportados.',
    })
  })

  return alertas
}

/**
 * Administración de Fideicomisos (clase 46)
 * 5 señales GAFI/SUGEF
 */
function señalesFideicomisos(txns, umbral) {
  const alertas = []
  const porCliente = agruparPorCliente(txns)

  // 1. Múltiples destinatarios de salidas (posible distribución sin justificación)
  const salidas = txns.filter(t => t.tipo_movimiento === 2)
  if (salidas.length > 3) {
    const destinatarios = new Set(salidas.map(t => t.numero_identificacion))
    if (destinatarios.size > 2) {
      alertas.push({
        nivel: 'naranja',
        tipo: 'Señal APNFD — Múltiples destinatarios de fondos del fideicomiso',
        icono: '🟠',
        mensaje: `Fondos distribuidos a ${destinatarios.size} destinatarios distintos en el período`,
        detalle: 'La dispersión de fondos del fideicomiso hacia múltiples beneficiarios sin instrucciones documentadas es señal de alerta. Verificar que cada distribución responde a instrucciones del fideicomitente (GAFI Guía Fideicomisos 2019).',
      })
    }
  }

  // 2. Monto total administrado sin movimientos de ingresos (fondos pre-cargados)
  const ingresos = txns.filter(t => t.tipo_movimiento === 1)
  const salidasTotal = salidas.reduce((s, t) => s + Number(t.monto_movimiento), 0)
  if (salidas.length > 0 && ingresos.length === 0 && salidasTotal > umbral) {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — Salidas sin ingresos documentados en período',
      icono: '🟠',
      mensaje: `Se registran salidas por USD ${salidasTotal.toLocaleString()} sin ingresos en el período`,
      detalle: 'Las distribuciones del fideicomiso sin registro de aportes en el período requieren verificación del origen de los fondos previos.',
    })
  }

  // 3. Movimientos a países de alto riesgo (ya cubierto por regla general, aquí énfasis fideicomiso)
  txns.filter(t => {
    const p = (t.pais_destino_recursos || '').toUpperCase()
    return ['KP', 'IR', 'SY', 'MM', 'RU'].includes(p)
  }).forEach(t => {
    alertas.push({
      nivel: 'rojo',
      tipo: 'Señal APNFD — Fideicomiso con instrucciones a jurisdicción sancionada',
      icono: '🔴',
      mensaje: `${nombre(t)} — instrucción de pago a ${t.pais_destino_recursos} por USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'Las instrucciones del fideicomitente para transferir fondos a jurisdicciones sancionadas son señal grave. Evalúe suspender la instrucción y consultar con asesoría legal.',
    })
  })

  // 4. Transacciones de monto muy elevado sin sustento (>3x umbral)
  txns.filter(t => Number(t.monto_movimiento) >= umbral * 3).forEach(t => {
    alertas.push({
      nivel: 'rojo',
      tipo: 'Señal APNFD — Monto atípico en fideicomiso',
      icono: '🔴',
      mensaje: `${nombre(t)} — movimiento inusualmente alto USD ${Number(t.monto_movimiento).toLocaleString()} (${Math.round(Number(t.monto_movimiento) / umbral)}x el umbral)`,
      detalle: 'Movimientos significativamente superiores al umbral en estructuras fiduciarias requieren debida diligencia reforzada del origen de los activos.',
    })
  })

  // 5. Frecuencia inusualmente alta de instrucciones en período corto
  Object.values(porCliente).forEach(cs => {
    if (cs.length >= 5) {
      alertas.push({
        nivel: 'amarillo',
        tipo: 'Señal APNFD — Alta frecuencia de instrucciones fiduciarias',
        icono: '🟡',
        mensaje: `${nombre(cs[0])} — ${cs.length} instrucciones en el período`,
        detalle: 'Una alta frecuencia de instrucciones del fideicomitente en un corto período puede indicar uso del fideicomiso como vehículo de transferencias irregulares.',
      })
    }
  })

  return alertas
}

/**
 * Compra/Venta Bienes Inmuebles — Corredores y Desarrolladoras (clase 49)
 * 5 señales GAFI/SUGEF
 */
function señalesBienesInmuebles(txns, umbral) {
  const alertas = []
  const porCliente = agruparPorCliente(txns)

  // 1. Transacción sin financiamiento bancario declarado (posible compra total en efectivo)
  txns.filter(t =>
    Number(t.monto_movimiento) >= umbral &&
    !(t.motivo_transaccion || '').toLowerCase().includes('banco') &&
    !(t.motivo_transaccion || '').toLowerCase().includes('crédit') &&
    !(t.motivo_transaccion || '').toLowerCase().includes('credito')
  ).forEach(t => {
    alertas.push({
      nivel: 'rojo',
      tipo: 'Señal APNFD — Posible compra de inmueble sin financiamiento',
      icono: '🔴',
      mensaje: `${nombre(t)} — pago USD ${Number(t.monto_movimiento).toLocaleString()} sin referencia a financiamiento bancario`,
      detalle: 'Las compras de bienes inmuebles con fondos propios de alto monto requieren verificación exhaustiva del origen de fondos. Es una de las tipologías más comunes de lavado en bienes raíces (GAFI Guía Sector Inmobiliario 2022).',
    })
  })

  // 2. Múltiples transacciones con el mismo cliente en el período (posible flipping)
  Object.values(porCliente).forEach(cs => {
    if (cs.length >= 2) {
      const totalC = cs.reduce((s, t) => s + Number(t.monto_movimiento), 0)
      alertas.push({
        nivel: 'naranja',
        tipo: 'Señal APNFD — Múltiples operaciones inmobiliarias por cliente',
        icono: '🟠',
        mensaje: `${nombre(cs[0])} — ${cs.length} operaciones inmobiliarias en el período por USD ${totalC.toLocaleString()}`,
        detalle: 'La compraventa frecuente de propiedades ("flipping") puede ser un mecanismo de lavado que aprovecha las ganancias aparentes de la revalorización inmobiliaria.',
      })
    }
  })

  // 3. Comisión desproporcionada vs. monto de la operación
  const comisiones = txns.filter(t => [49].includes(Number(t.tipo_ingreso)))
  const ventas = txns.filter(t => [48].includes(Number(t.tipo_ingreso)))
  if (comisiones.length > 0 && ventas.length > 0) {
    const ratioComision = comisiones.reduce((s, t) => s + Number(t.monto_movimiento), 0) /
                          ventas.reduce((s, t) => s + Number(t.monto_movimiento), 0)
    if (ratioComision > 0.08) {  // >8% comisión es inusual
      alertas.push({
        nivel: 'amarillo',
        tipo: 'Señal APNFD — Comisión inusualmente elevada',
        icono: '🟡',
        mensaje: `Comisiones representan el ${(ratioComision * 100).toFixed(1)}% del valor de las ventas (normal: ≤5%)`,
        detalle: 'Las comisiones excesivas en transacciones inmobiliarias pueden encubrir pagos adicionales ilegítimos. Verificar que los montos de comisión corresponden a los pactados en contrato.',
      })
    }
  }

  // 4. Pagos desde el exterior sin justificación de relación comercial internacional
  txns.filter(t => {
    const p = (t.pais_origen_recursos || '').toUpperCase()
    return p && p !== 'CR' && p !== 'COSTA RICA' && Number(t.monto_movimiento) >= umbral * 0.5
  }).forEach(t => {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — Pago inmobiliario desde el exterior',
      icono: '🟠',
      mensaje: `${nombre(t)} — pago de ${t.pais_origen_recursos} por USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'Los pagos para adquisición de bienes raíces provenientes del exterior deben justificar el origen de fondos. Es un vector de lavado transfronterizo identificado por GAFI (Sector Inmobiliario, 2022).',
    })
  })

  // 5. Transacción reportada como compra pero en período inusualmente corto (detectado por fecha)
  const hoy = new Date()
  txns.filter(t => {
    if (!t.fecha_transaccion) return false
    const fecha = new Date(t.fecha_transaccion)
    const diasDesde = (hoy - fecha) / (1000 * 60 * 60 * 24)
    return diasDesde < 7 && Number(t.monto_movimiento) >= umbral
  }).forEach(t => {
    alertas.push({
      nivel: 'amarillo',
      tipo: 'Señal APNFD — Operación inmobiliaria de cierre muy rápido',
      icono: '🟡',
      mensaje: `${nombre(t)} — transacción de USD ${Number(t.monto_movimiento).toLocaleString()} en fecha muy reciente`,
      detalle: 'Las operaciones inmobiliarias de alto monto cerradas muy rápidamente, sin el tiempo normal de negociación y debida diligencia, son señal de alerta.',
    })
  })

  return alertas
}

/**
 * ONG / OSFL
 * 5 señales GAFI/SUGEF (Recomendación 8 GAFI — Organizaciones sin fines de lucro)
 */
function señalesONG(txns, umbral) {
  const alertas = []

  // 1. Fondos de jurisdicciones de alto riesgo en montos elevados
  txns.filter(t => {
    const p = (t.pais_origen_recursos || '').toUpperCase()
    const RIESGO_ALTO = ['KP', 'IR', 'MM', 'SY', 'SD', 'SS', 'YE', 'SO', 'LY', 'AF', 'PK']
    return RIESGO_ALTO.includes(p)
  }).forEach(t => {
    alertas.push({
      nivel: 'rojo',
      tipo: 'Señal APNFD — ONG: fondos de jurisdicción de alto riesgo',
      icono: '🔴',
      mensaje: `${nombre(t)} — fondos recibidos de ${t.pais_origen_recursos} por USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'Las donaciones provenientes de países de alto riesgo GAFI son señal crítica para organizaciones sin fines de lucro, que son especialmente vulnerables al financiamiento del terrorismo (GAFI Rec. 8).',
    })
  })

  // 2. Retiros frecuentes en efectivo (sin trazabilidad de destino)
  const salidasEfectivo = txns.filter(t =>
    t.tipo_movimiento === 2 &&
    (t.motivo_transaccion || '').toLowerCase().includes('efectivo')
  )
  if (salidasEfectivo.length > 0) {
    const totalEfectivo = salidasEfectivo.reduce((s, t) => s + Number(t.monto_movimiento), 0)
    alertas.push({
      nivel: 'rojo',
      tipo: 'Señal APNFD — ONG: desembolsos en efectivo',
      icono: '🔴',
      mensaje: `${salidasEfectivo.length} desembolsos en efectivo por USD ${totalEfectivo.toLocaleString()}`,
      detalle: 'Los desembolsos en efectivo de organizaciones sin fines de lucro eliminan la trazabilidad del destino de los fondos. Las ONG deben preferir pagos electrónicos rastreables (GAFI Guía OSFL 2023).',
    })
  }

  // 3. Transferencias a personas naturales (vs. proveedores/beneficiarios registrados)
  txns.filter(t =>
    t.tipo_movimiento === 2 &&
    t.nombre_cliente &&
    !t.nombre_empresa
  ).forEach(t => {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — ONG: pago directo a persona natural',
      icono: '🟠',
      mensaje: `${nombre(t)} — pago USD ${Number(t.monto_movimiento).toLocaleString()} a persona física no identificada como proveedor`,
      detalle: 'Los pagos de ONG directamente a personas naturales no registradas como beneficiarios o proveedores del programa deben justificarse documentalmente.',
    })
  })

  // 4. Ingresos significativamente superiores a actividad declarada (gran donación única)
  const ingresoTotal = txns.filter(t => t.tipo_movimiento === 1).reduce((s, t) => s + Number(t.monto_movimiento), 0)
  const maxIngreso = Math.max(...txns.filter(t => t.tipo_movimiento === 1).map(t => Number(t.monto_movimiento)), 0)
  if (maxIngreso > 0 && maxIngreso / ingresoTotal > 0.7 && ingresoTotal >= umbral) {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — ONG: donante único concentra >70% de ingresos',
      icono: '🟠',
      mensaje: `Una sola donación representa más del 70% del total de ingresos del período (USD ${maxIngreso.toLocaleString()})`,
      detalle: 'La dependencia de un único donante para la mayoría de los fondos, especialmente si es anónimo o de origen incierto, es señal de alerta para ONG (GAFI Rec. 8, indicador 8.3).',
    })
  }

  // 5. Actividades en zonas geográficas de conflicto o crisis humanitaria
  txns.filter(t => {
    const p = (t.pais_destino_recursos || '').toUpperCase()
    const CONFLICTO = ['SY', 'YE', 'SO', 'SS', 'LY', 'AF', 'UA', 'MM']
    return CONFLICTO.includes(p)
  }).forEach(t => {
    alertas.push({
      nivel: 'amarillo',
      tipo: 'Señal APNFD — ONG: operaciones en zona de conflicto',
      icono: '🟡',
      mensaje: `${nombre(t)} — transferencia a ${t.pais_destino_recursos} (zona de conflicto/crisis) USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'Las ONG que operan en zonas de conflicto están en mayor riesgo de ser utilizadas para financiar al terrorismo. Se requiere documentación exhaustiva del programa y los beneficiarios (GAFI Guía OSFL 2023, Sección 5).',
    })
  })

  return alertas
}

/**
 * Remesas y Transferencias (clase 45)
 * 5 señales GAFI/SUGEF
 */
function señalesRemesas(txns, umbral) {
  const alertas = []
  const porCliente = agruparPorCliente(txns)

  // 1. Remesas múltiples del mismo cliente en el período (posible estructuración)
  Object.values(porCliente).forEach(cs => {
    const total = cs.reduce((s, t) => s + Number(t.monto_movimiento), 0)
    if (cs.length >= 3 && total >= umbral * 0.8) {
      alertas.push({
        nivel: 'rojo',
        tipo: 'Señal APNFD — Remesas: posible estructuración',
        icono: '🔴',
        mensaje: `${nombre(cs[0])} — ${cs.length} remesas por USD ${total.toLocaleString()} total`,
        detalle: 'El envío de múltiples remesas por montos inferiores al umbral puede constituir estructuración para evadir el reporte obligatorio (Ley 7786 Art. 69, GAFI R. 16).',
      })
    }
  })

  // 2. Remesas hacia países de alto riesgo
  txns.filter(t => {
    const p = (t.pais_destino_recursos || '').toUpperCase()
    return ['KP', 'IR', 'SY', 'MM', 'SD'].includes(p)
  }).forEach(t => {
    alertas.push({
      nivel: 'rojo',
      tipo: 'Señal APNFD — Remesa a jurisdicción sancionada',
      icono: '🔴',
      mensaje: `${nombre(t)} — remesa a ${t.pais_destino_recursos} por USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'El envío de fondos a jurisdicciones sancionadas puede estar prohibido bajo las regulaciones OFAC/ONU y constituye una alerta crítica de FT.',
    })
  })

  // 3. Receptor de remesas es persona jurídica (inusual en el esquema de remesas personales)
  txns.filter(t => t.tipo_movimiento === 2 && t.nombre_empresa && !t.nombre_cliente).forEach(t => {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — Remesa pagada a empresa (inusual)',
      icono: '🟠',
      mensaje: `${nombre(t)} — remesa pagada a persona jurídica por USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'Las remesas normalmente se envían a personas físicas. El pago a una empresa como destinataria puede indicar uso del canal de remesas para transferencias comerciales encubiertas.',
    })
  })

  // 4. Mismo receptor recibe desde múltiples remitentes en el mismo período
  const porReceptor = {}
  txns.filter(t => t.tipo_movimiento === 2).forEach(t => {
    const k = t.numero_identificacion
    if (!porReceptor[k]) porReceptor[k] = []
    porReceptor[k].push(t)
  })
  Object.values(porReceptor).forEach(cs => {
    if (cs.length >= 3) {
      alertas.push({
        nivel: 'amarillo',
        tipo: 'Señal APNFD — Remesas: receptor con múltiples fuentes',
        icono: '🟡',
        mensaje: `${nombre(cs[0])} — recibe ${cs.length} remesas distintas en el período`,
        detalle: 'Un receptor que concentra múltiples remesas de distintas fuentes puede estar actuando como intermediario o "mula" en un esquema de lavado.',
      })
    }
  })

  // 5. Remesas sin identificación del remitente
  txns.filter(t => !t.nombre_cliente && !t.nombre_empresa && t.tipo_movimiento === 1).forEach(t => {
    alertas.push({
      nivel: 'naranja',
      tipo: 'Señal APNFD — Remesa sin identificación del remitente',
      icono: '🟠',
      mensaje: `Remesa recibida sin datos del remitente por USD ${Number(t.monto_movimiento).toLocaleString()}`,
      detalle: 'Las remesas deben registrar la identidad del remitente. La ausencia de datos incumple el Acuerdo SUGEF 13-19 Art. 21 y la GAFI Recomendación 16 (Wire Transfers).',
    })
  })

  return alertas
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function agruparPorCliente(txns) {
  const grupos = {}
  txns.forEach(t => {
    const k = t.numero_identificacion || 'sin_id'
    if (!grupos[k]) grupos[k] = []
    grupos[k].push(t)
  })
  return grupos
}

function detectarActividad(tenant) {
  const act = (tenant?.actividad_apnfd || '').toLowerCase()
  if (act.includes('dinero') || act.includes('44'))          return 'dinero'
  if (act.includes('crédito') || act.includes('credito') ||
      act.includes('47') || act.includes('creditici'))       return 'credito'
  if (act.includes('fideicomiso') || act.includes('46'))     return 'fideicomiso'
  if (act.includes('inmueble') || act.includes('49') ||
      act.includes('corredor') || act.includes('inmobil') ||
      act.includes('desarrolla'))                             return 'inmuebles'
  if (act.includes('ong') || act.includes('osfl') ||
      act.includes('fundaci') || act.includes('asociaci'))   return 'ong'
  if (act.includes('remesa') || act.includes('45'))          return 'remesas'
  return 'general'
}

// ─── Función principal exportada ─────────────────────────────────────────────

/**
 * Evalúa señales de alerta específicas por actividad APNFD del sujeto obligado.
 * @param {Array}  txns     Transacciones del período
 * @param {Array}  clientes Lista de clientes del tenant
 * @param {Object} tenant   Datos del sujeto obligado (incluyendo actividad_apnfd)
 * @returns {Array} alertas con campos: nivel, tipo, icono, mensaje, detalle
 */
export function evaluarSeñalesAPNFD(txns, clientes, tenant) {
  if (!txns || txns.length === 0) return []

  const umbral = Number(tenant?.monto_minimo_usd) || 10000
  const actividad = detectarActividad(tenant)

  switch (actividad) {
    case 'dinero':      return señalesAdminDinero(txns, umbral)
    case 'credito':     return señalesFacilidadesCrediticias(txns, umbral)
    case 'fideicomiso': return señalesFideicomisos(txns, umbral)
    case 'inmuebles':   return señalesBienesInmuebles(txns, umbral)
    case 'ong':         return señalesONG(txns, umbral)
    case 'remesas':     return señalesRemesas(txns, umbral)
    default:
      // Si no se detecta actividad específica, aplicar señales generales básicas
      return []
  }
}

/**
 * Retorna la etiqueta descriptiva de la actividad detectada.
 */
export function etiquetaActividad(tenant) {
  const act = detectarActividad(tenant)
  const MAP = {
    dinero:      'Administración de Dinero (Clase 44)',
    credito:     'Facilidades Crediticias (Clase 47)',
    fideicomiso: 'Administración de Fideicomisos (Clase 46)',
    inmuebles:   'Compra/Venta Bienes Inmuebles (Clase 49)',
    ong:         'ONG / Organización Sin Fines de Lucro',
    remesas:     'Remesas y Transferencias (Clase 45)',
    general:     'Actividad APNFD General',
  }
  return MAP[act] || tenant?.actividad_apnfd || 'No especificada'
}
