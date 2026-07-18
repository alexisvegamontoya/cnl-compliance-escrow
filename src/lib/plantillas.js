import * as XLSX from 'xlsx'
import { ACTIVIDADES_APNFD, TIPOS_INGRESO, TIPOS_SALIDA, MOTIVO_CREDITO } from './catalogos'

// ─── Plantilla de Transacciones ──────────────────────────────────────────────
// claseDato: número de clase SUGEF (ej: 47). Si se omite, muestra todos los códigos.
export function descargarPlantillaTransacciones(claseDato) {
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
    'motivo_credito',
  ]

  const instrucciones = [
    ['PLANTILLA DE CARGA MASIVA DE TRANSACCIONES — CNL Compliance App (Clase 47 Facilidades Crediticias)'],
    [''],
    ['INSTRUCCIONES:'],
    ['• No modifique los nombres de las columnas (fila 7)'],
    ['• Complete desde la fila 8 en adelante'],
    ['• tipo_identificacion: 1=Física CR, 2=Jurídica CR, 3=DIMEX, 4=Ent.Financiera Ext., 5=Pasaporte, 6=Empresa Ext., 13=Fideicomiso'],
    ['• tipo_reporte: 1=Efectivo, 2=APNFD, 3=Ambos'],
    ['• tipo_operacion: 1=Única, 2=Múltiple'],
    ['• tipo_movimiento: 1=Ingreso, 2=Salida'],
    ['• tipo_ingreso: use 0 si no aplica. Ver catálogo hoja "Catálogos". Ej: 37=Pago intereses, 38=Pago cuota, 39=Pago principal'],
    ['• tipo_salida: use 0 si no aplica. Ej: 33=Desembolso crédito, 34=Reintegro saldo a favor'],
    ['• tipo_moneda_movimiento: 1=CRC, 2=USD, 3=EUR, 4=Otra'],
    ['• fecha_transaccion: formato YYYY-MM-DD (ej: 2024-03-15)'],
    ['• origen_recursos: descripción del origen de los fondos (REQUERIDO por SUGEF). Ej: Flujo de caja de la empresa para atender la deuda'],
    ['• motivo_credito: 7=Inversión (más común). Ver catálogo completo en hoja "Catálogos"'],
    ['• Si el cliente es persona física use: nombre_cliente, primer_apellido, segundo_apellido'],
    ['• Si es persona jurídica use: nombre_empresa'],
    [''],
  ]

  const ejemplos = [
    ['101234567', 1, 'Juan', 'Pérez', 'Mora', '', 2, 1, 1, 38, 0, 2, 15000, '2024-03-10', 'Pago cuota mensual', 'Flujo de caja personal para atender el crédito', 7],
    ['3101234567', 2, '', '', '', 'Empresa XYZ S.A.', 2, 1, 2, 0, 33, 2, 25000, '2024-03-15', 'Desembolso de crédito', 'Flujo necesario según plan de inversión del crédito', 7],
  ]

  const wb = XLSX.utils.book_new()

  // Hoja principal
  const wsData = [
    ...instrucciones,
    headers,
    ...ejemplos,
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Anchos de columna
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 5 || i === 14 ? 30 : 22 }))

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

  XLSX.writeFile(wb, 'Plantilla_Transacciones_CNL.xlsx')
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
    'nivel_transaccional_max_mes',
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
    ['• nivel_transaccional_max_mes: monto máximo mensual estimado en USD'],
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
