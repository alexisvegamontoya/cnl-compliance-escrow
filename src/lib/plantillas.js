import * as XLSX from 'xlsx'
import { ACTIVIDADES_APNFD, TIPOS_INGRESO, TIPOS_SALIDA, MOTIVO_CREDITO, PAISES, getCamposGeograficos } from './catalogos'

// ─── Plantilla de Transacciones ──────────────────────────────────────────────
// claseDato: número de clase SUGEF (ej: 47). Si se omite, muestra todos los códigos.
export function descargarPlantillaTransacciones(claseDato) {
  const clase = Number(claseDato) || 47
  const geoCampos = getCamposGeograficos(clase)          // [{key,label}] según actividad
  const geoKeys   = geoCampos.map(c => c.key)
  const incluyeMotivoCredito = clase === 47               // motivo_credito solo Facilidades

  const headers = [
    'numero_identificacion',
    'tipo_identificacion',
    'nombre_cliente',
    'primer_apellido',
    'segundo_apellido',
    'nombre_empresa',
    'tipo_reporte',
    'tipo_operacion',
    'tipo_movimiento',
    'tipo_ingreso',
    'tipo_salida',
    'tipo_moneda_movimiento',
    'monto_movimiento',
    'fecha_transaccion',
    'motivo_transaccion',
    'origen_recursos',
    ...(incluyeMotivoCredito ? ['motivo_credito'] : []),
    ...geoKeys,
  ]

  const actInfo = ACTIVIDADES_APNFD.find(a => a.clase_dato === clase)
  const nombreActividad = actInfo ? `Clase ${clase} ${actInfo.nombre}` : `Clase ${clase}`
  const esOSFL = clase === 42

  // Códigos de ingreso/salida válidos para ESTA actividad (para ejemplos correctos)
  const idxAct = clase - 39
  const primerIngreso = TIPOS_INGRESO.find(t => t.codigo !== 0 && (t.clases.includes(0) || t.clases.includes(idxAct)))?.codigo || 0
  const primerSalida  = TIPOS_SALIDA.find(t => t.codigo !== 0 && (t.clases.includes(0) || t.clases.includes(idxAct)))?.codigo || 0

  const instrucciones = [
    [`PLANTILLA DE CARGA MASIVA DE TRANSACCIONES — CNL Compliance App (${nombreActividad})`],
    [''],
    ['INSTRUCCIONES:'],
    ['• No modifique los nombres de las columnas (fila de encabezados)'],
    ['• Complete en las filas siguientes a los encabezados'],
    ['• tipo_identificacion: 1=Física CR, 2=Jurídica CR, 3=DIMEX, 4=Ent.Financiera Ext., 5=Pasaporte, 6=Empresa Ext., 13=Fideicomiso'],
    ['• tipo_reporte: 1=Efectivo, 2=APNFD, 3=Ambos'],
    ['• tipo_operacion: 1=Única, 2=Múltiple'],
    [esOSFL
      ? '• tipo_movimiento: 1=Ingreso (donación recibida), 2=Salida (fondos entregados), 3=Ingreso/Salida'
      : '• tipo_movimiento: 1=Ingreso, 2=Salida'],
    ['• tipo_ingreso: en un Ingreso use un código válido (hoja "Catálogos"); en una Salida use 0'],
    ['• tipo_salida: en una Salida use un código válido (hoja "Catálogos"); en un Ingreso use 0'],
    ['• tipo_moneda_movimiento: 1=CRC, 2=USD, 3=EUR, 4=Otra'],
    ['• fecha_transaccion: formato YYYY-MM-DD (ej: 2024-03-15) — el año debe ser real (no 0026)'],
    ['• origen_recursos: descripción del origen de los fondos (REQUERIDO por SUGEF)'],
    ...(incluyeMotivoCredito ? [['• motivo_credito: 7=Empresarial (común). Ver catálogo completo en hoja "Catálogos"']] : []),
    ...(geoKeys.length ? [
      ['• CAMPOS DE PAÍS (obligatorios para esta actividad en SICVECA): use el CÓDIGO ISO de 2 letras. Ver hoja "Países".'],
      ['   Ejemplos: CR=Costa Rica, GT=Guatemala, US=Estados Unidos, NI=Nicaragua, PA=Panamá. Si no se indica, se asume CR.'],
      ...geoCampos.map(c => [`   - ${c.key}: ${c.label}`]),
    ] : []),
    ['• Si el cliente es persona física use: nombre_cliente, primer_apellido, segundo_apellido'],
    ['• Si es persona jurídica use: nombre_empresa'],
    ...(esOSFL ? [
      [''],
      ['NOTA OSFL (Organizaciones Sin Fines de Lucro):'],
      ['• Registre la contraparte una sola vez (número, tipo e identidad). El sistema la coloca automáticamente'],
      ['  como DONADOR en un Ingreso, o como BENEFICIARIO en una Salida, según el tipo_movimiento.'],
      ['• En una Salida, tipo_ingreso debe ir en 0; en un Ingreso, tipo_salida debe ir en 0.'],
    ] : []),
    [''],
  ]

  // Ejemplos como objetos → se mapean al orden real de columnas (por actividad),
  // usando códigos de ingreso/salida válidos para la actividad seleccionada.
  const ejBase = {
    tipo_reporte: 2, tipo_operacion: 1, tipo_moneda_movimiento: 2,
    motivo_credito: incluyeMotivoCredito ? 7 : '',
    ubicacion_cliente: 'CR', ubicacion_comprador_vendedor: 'CR',
    pais_origen_recursos: 'CR', pais_destino_recursos: 'CR',
  }
  const ejemplosObj = [
    { ...ejBase, numero_identificacion: '101234567', tipo_identificacion: 1, nombre_cliente: 'Juan', primer_apellido: 'Pérez', segundo_apellido: 'Mora', nombre_empresa: '', tipo_movimiento: 1, tipo_ingreso: primerIngreso, tipo_salida: 0, monto_movimiento: 15000, fecha_transaccion: '2024-03-10', motivo_transaccion: 'Descripción de la transacción', origen_recursos: 'Detalle del origen de los fondos del cliente' },
    { ...ejBase, numero_identificacion: '3101234567', tipo_identificacion: 2, nombre_cliente: '', primer_apellido: '', segundo_apellido: '', nombre_empresa: 'Empresa XYZ S.A.', tipo_movimiento: 2, tipo_ingreso: 0, tipo_salida: primerSalida, monto_movimiento: 25000, fecha_transaccion: '2024-03-15', motivo_transaccion: 'Descripción de la transacción', origen_recursos: 'Detalle del origen de los fondos del cliente' },
  ]
  const ejemplos = ejemplosObj.map(e => headers.map(h => (e[h] ?? '')))

  const wb = XLSX.utils.book_new()

  // Hoja principal
  const wsData = [
    ...instrucciones,
    headers,
    ...ejemplos,
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Anchos de columna (más anchas para nombre_empresa/motivo/origen)
  const anchas = new Set(['nombre_empresa', 'motivo_transaccion', 'origen_recursos'])
  ws['!cols'] = headers.map(h => ({ wch: anchas.has(h) ? 30 : 22 }))

  // Estilo de fila de encabezados (fila 17 = índice 16)
  const headerRow = instrucciones.length
  for (let c = 0; c < headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: headerRow, c })
    if (!ws[cellRef]) ws[cellRef] = {}
    ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: '0e0e6e' } } }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Transacciones')

  // Hoja de catálogos de referencia
  // Filtrar códigos de ingreso/salida según la clase del sujeto obligado
  const claseIdx = claseDato ? (Number(claseDato) - 39) : null  // 40→1, 47→8, etc.
  const actividadInfo = claseDato ? ACTIVIDADES_APNFD.find(a => a.clase_dato === Number(claseDato)) : null
  const umbralUSD = actividadInfo?.monto_min_usd || 10000

  const ingresosValidos = claseIdx
    ? TIPOS_INGRESO.filter(t => t.codigo !== 0 && (t.clases.includes(0) || t.clases.includes(claseIdx)))
    : TIPOS_INGRESO.filter(t => t.codigo !== 0)
  const salidasValidas = claseIdx
    ? TIPOS_SALIDA.filter(t => t.codigo !== 0 && (t.clases.includes(0) || t.clases.includes(claseIdx)))
    : TIPOS_SALIDA.filter(t => t.codigo !== 0)

  const titulo = actividadInfo
    ? `CATÁLOGO DE REFERENCIA — Clase ${claseDato} ${actividadInfo.nombre} SUGEF`
    : 'CATÁLOGO DE REFERENCIA — SUGEF APNFD'

  const catData = [
    [titulo],
    [actividadInfo ? `Umbral de reporte: US$${umbralUSD.toLocaleString()} o equivalente en CRC` : ''],
    [''],
    ['TIPO_INGRESO (tipo_movimiento = 1 — Ingreso)'],
    ['Código', 'Descripción'],
    ...ingresosValidos.map(t => [t.codigo, t.descripcion]),
    [''],
    ['TIPO_SALIDA (tipo_movimiento = 2 — Salida)'],
    ['Código', 'Descripción'],
    ...salidasValidas.map(t => [t.codigo, t.descripcion]),
    [''],
    ['TIPO_MOVIMIENTO'],
    ['Código', 'Descripción'],
    [1, 'Ingreso (cliente paga a la entidad)'],
    [2, 'Salida (entidad desembolsa al cliente)'],
    [''],
    ['TIPO_OPERACION — asignada automáticamente por el sistema'],
    ['Código', 'Descripción', 'Cuándo aplica'],
    [1, 'Operación única',    `Monto individual >= US$${umbralUSD.toLocaleString()}`],
    [2, 'Operación múltiple', `Monto individual < US$${umbralUSD.toLocaleString()} pero suma del mes >= umbral`],
    [''],
    ['TIPO_REPORTE'],
    ['Código', 'Descripción'],
    [1, 'Efectivo'],
    [2, 'APNFD (otros medios de pago)'],
    [3, 'Efectivo y otros medios de pago'],
    [''],
    ...(claseDato === 47 ? [
      ['MOTIVO_CREDITO (solo clase 47 Facilidades Crediticias)'],
      ['Código', 'Descripción'],
      ...MOTIVO_CREDITO.map(m => [m.codigo, m.descripcion]),
      [''],
    ] : []),
    ['TIPO_MONEDA_MOVIMIENTO'],
    ['Código', 'Descripción'],
    [1, 'Colones (CRC)'],
    [2, 'Dólares (USD)'],
    [3, 'Euros (EUR)'],
    [''],
    ['TIPO_IDENTIFICACION'],
    ['Código', 'Descripción'],
    [1,  'Cédula física costarricense'],
    [2,  'Cédula jurídica costarricense'],
    [3,  'DIMEX (residentes extranjeros)'],
    [4,  'Entidad financiera extranjera'],
    [5,  'Pasaporte / otra identificación extranjera'],
    [6,  'Empresa extranjera no financiera'],
    [13, 'Fideicomiso'],
  ]
  const wsCat = XLSX.utils.aoa_to_sheet(catData)
  wsCat['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 35 }]
  XLSX.utils.book_append_sheet(wb, wsCat, 'Catálogos')

  // Hoja de países (solo si la actividad usa campos de país)
  if (geoKeys.length) {
    const paisData = [
      ['CATÁLOGO DE PAÍS (tabla PAIS SUGEF) — use el código de 2 letras'],
      ['Código', 'País'],
      ...PAISES.map(p => [p.codigo, p.nombre]),
    ]
    const wsPais = XLSX.utils.aoa_to_sheet(paisData)
    wsPais['!cols'] = [{ wch: 10 }, { wch: 45 }]
    XLSX.utils.book_append_sheet(wb, wsPais, 'Países')
  }

  const sufijo = actInfo ? `_${clase}` : ''
  XLSX.writeFile(wb, `Plantilla_Transacciones_CNL${sufijo}.xlsx`)
}

// ─── Plantilla de Clientes ────────────────────────────────────────────────────
export function descargarPlantillaClientes() {
  const headers = [
    'numero_identificacion',
    'tipo_identificacion',
    'nombre_cliente',
    'primer_apellido',
    'segundo_apellido',
    'nombre_empresa',
    'nacionalidad',
    'pais_ubicacion',
    'actividad_economica',
    'telefono',
    'correo_electronico',
    'fecha_vinculacion',
    'pep',
    'calificacion_riesgo',
    'ingreso_mensual_est',
    'notas',
  ]

  const instrucciones = [
    ['PLANTILLA DE CARGA MASIVA DE CLIENTES — CNL Compliance App'],
    [''],
    ['INSTRUCCIONES:'],
    ['• No modifique los nombres de las columnas (fila 6)'],
    ['• Complete desde la fila 7 en adelante'],
    ['• tipo_identificacion: 1=Física CR, 2=Jurídica CR, 3=DIMEX, 4=Ent.Financiera Ext., 5=Pasaporte, 6=Empresa Ext., 13=Fideicomiso'],
    ['• pep: SI o NO (Persona Expuesta Políticamente)'],
    ['• calificacion_riesgo: alto, medio o bajo'],
    ['• ingreso_mensual_est: monto máximo mensual estimado en USD'],
    ['• fecha_vinculacion: formato YYYY-MM-DD (ej: 2022-01-15)'],
    ['• Si el cliente es persona física use: nombre_cliente, primer_apellido, segundo_apellido'],
    ['• Si es persona jurídica use: nombre_empresa'],
    [''],
  ]

  const ejemplos = [
    ['101234567', 1, 'María', 'Rodríguez', 'López', '', 'Costarricense', 'Costa Rica', 'Comercio', '8888-1234', 'maria@correo.com', '2022-01-15', 'NO', 'bajo', 20000, ''],
    ['3101234567', 2, '', '', '', 'Empresa ABC S.A.', 'Costarricense', 'Costa Rica', 'Servicios Financieros', '2222-5678', 'info@abc.com', '2021-06-01', 'NO', 'medio', 50000, 'Cliente desde 2021'],
    ['E123456789', 5, 'John', 'Smith', '', '', 'Estadounidense', 'Estados Unidos', 'Inversiones', '', 'john@email.com', '2023-03-10', 'SI', 'alto', 100000, 'PEP extranjero, requiere EDD'],
  ]

  const wb = XLSX.utils.book_new()
  const wsData = [...instrucciones, headers, ...ejemplos]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = headers.map(() => ({ wch: 24 }))

  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
  XLSX.writeFile(wb, 'Plantilla_Clientes_CNL.xlsx')
}

// ─── Parser de Excel ──────────────────────────────────────────────────────────
// Busca automáticamente la fila de encabezados (la que contiene
// 'numero_identificacion'), ignorando títulos e instrucciones previas.
export function parsearExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]

        // Leer todas las filas como arrays para localizar la fila de headers
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        const headerRowIdx = allRows.findIndex(row =>
          row.some(cell => String(cell).trim().toLowerCase() === 'numero_identificacion')
        )

        if (headerRowIdx === -1) {
          // Fallback: comportamiento original (primera fila como headers)
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
          resolve(rows)
          return
        }

        const headers = allRows[headerRowIdx]
        const dataRows = allRows.slice(headerRowIdx + 1)

        const rows = dataRows
          .filter(row => row.some(cell => cell !== '' && cell !== null))
          .map(row => {
            const obj = {}
            headers.forEach((h, i) => {
              if (h) obj[String(h).trim()] = row[i] ?? ''
            })
            return obj
          })

        resolve(rows)
      } catch (err) {
        reject(new Error('No se pudo leer el archivo Excel: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo.'))
    reader.readAsArrayBuffer(file)
  })
}
