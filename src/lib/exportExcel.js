import * as XLSX from 'xlsx'

/**
 * Exporta un array de objetos a un archivo .xlsx
 * @param {Object[]} data - Filas de datos
 * @param {string[]} columnas - Claves a incluir (en orden)
 * @param {Object} headers - Mapeo clave → label (ej: { nombre: 'Nombre completo' })
 * @param {string} nombreArchivo - Nombre sin extensión
 * @param {string} nombreHoja - Nombre de la hoja
 */
export function exportarExcel({ data, columnas, headers = {}, nombreArchivo = 'exportacion', nombreHoja = 'Datos' }) {
  // Construir filas con headers amigables
  const filas = data.map(row => {
    const fila = {}
    columnas.forEach(col => {
      const label = headers[col] || col
      let val = row[col]
      // Formatear booleanos
      if (typeof val === 'boolean') val = val ? 'Sí' : 'No'
      // Formatear fechas ISO
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        val = new Date(val).toLocaleDateString('es-CR')
      }
      fila[label] = val ?? ''
    })
    return fila
  })

  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja)

  // Ancho de columnas automático
  const colWidths = Object.keys(filas[0] || {}).map(k => ({
    wch: Math.max(k.length, ...filas.map(r => String(r[k] || '').length), 10)
  }))
  ws['!cols'] = colWidths

  XLSX.writeFile(wb, `${nombreArchivo}_${new Date().toISOString().slice(0,10)}.xlsx`)
}
