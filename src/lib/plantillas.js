import * as XLSX from 'xlsx'

// ─── Plantilla de Transacciones ──────────────────────────────────────────────
export function descargarPlantillaTransacciones() {
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
    'ubicacion_cliente',
    'pais_origen_recursos',
    'pais_destino_recursos',
  ]

  const instrucciones = [
    ['PLANTILLA DE CARGA MASIVA DE TRANSACCIONES — CNL Compliance App'],
    [''],
    ['INSTRUCCIONES:'],
    ['• No modifique los nombres de las columnas (fila 7)'],
    ['• Complete desde la fila 8 en adelante'],
    ['• tipo_identificacion: 1=Física CR, 2=Jurídica CR, 3=DIMEX, 4=Ent.Financiera Ext., 5=Pasaporte, 6=Empresa Ext., 13=Fideicomiso'],
    ['• tipo_reporte: 1=Efectivo, 2=APNFD, 3=Ambos'],
    ['• tipo_operacion: 1=Única, 2=Múltiple'],
    ['• tipo_movimiento: 1=Ingreso, 2=Salida, 3=Ambos (solo Casinos)'],
    ['• tipo_ingreso / tipo_salida: use 0 si no aplica. Ver catálogo SUGEF según su actividad'],
    ['• tipo_moneda_movimiento: 1=CRC, 2=USD, 3=EUR, 4=Otra'],
    ['• fecha_transaccion: formato YYYY-MM-DD (ej: 2024-03-15)'],
    ['• pais_origen_recursos / pais_destino_recursos: código ISO 2 letras (ej: CR, US, PA)'],
    ['• Si el cliente es persona física use: nombre_cliente, primer_apellido, segundo_apellido'],
    ['• Si es persona jurídica use: nombre_empresa'],
    [''],
  ]

  const ejemplos = [
    ['101234567', 1, 'Juan', 'Pérez', 'Mora', '', 2, 1, 1, 38, 0, 2, 15000, '2024-03-10', 'Pago cuota', 'San José, CR', 'CR', 'CR'],
    ['3101234567', 2, '', '', '', 'Empresa XYZ S.A.', 2, 1, 2, 0, 33, 2, 25000, '2024-03-15', 'Desembolso crédito', 'Heredia, CR', 'CR', 'CR'],
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
  const catData = [
    ['CATÁLOGO DE REFERENCIA — Tipos de Ingreso por Actividad'],
    [''],
    ['Código', 'Descripción', 'Actividad APNFD'],
    [37, 'Pago intereses', 'Facilidades Crediticias (clase 47)'],
    [38, 'Pago cuota', 'Facilidades Crediticias (clase 47)'],
    [39, 'Pago de principal', 'Facilidades Crediticias (clase 47)'],
    [40, 'Cancelación anticipada', 'Facilidades Crediticias (clase 47)'],
    [41, 'Abono extraordinario', 'Facilidades Crediticias (clase 47)'],
    [48, 'Venta', 'Bienes Inmuebles (clase 49)'],
    [49, 'Comisión', 'Bienes Inmuebles (clase 49)'],
    [24, 'Monto administrado', 'Administración de Dinero (clase 44)'],
    [27, 'Remesa recibida', 'Remesas y Transferencias (clase 45)'],
    [''],
    ['SALIDAS'],
    ['Código', 'Descripción', 'Actividad APNFD'],
    [33, 'Desembolso crédito', 'Facilidades Crediticias (clase 47)'],
    [34, 'Reintegro por saldo a favor', 'Facilidades Crediticias (clase 47)'],
    [38, 'Compras', 'Bienes Inmuebles (clase 49)'],
    [26, 'Remesa pagada exterior', 'Remesas y Transferencias (clase 45)'],
    [27, 'Remesa pagada local', 'Remesas y Transferencias (clase 45)'],
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
export function parsearExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        resolve(rows)
      } catch (err) {
        reject(new Error('No se pudo leer el archivo Excel: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo.'))
    reader.readAsArrayBuffer(file)
  })
}
