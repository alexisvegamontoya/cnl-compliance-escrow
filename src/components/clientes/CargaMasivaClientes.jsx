/**
 * CargaMasivaClientes.jsx
 * Carga masiva de clientes desde Excel.
 * Genera plantilla descargable y procesa el archivo subido.
 */
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import {
  ACTIVIDADES_PROFESIONES,
  PROVINCIAS_CR,
  CANTONES_CR,
  PAISES_RIESGO,
} from '../../lib/metodologiaRiesgo'

// ─── Columnas de la plantilla ────────────────────────────────────────────────
// Orden y nombre exacto que tendrá el Excel
const COLUMNAS = [
  { key: 'tipo_persona',         label: 'tipo_persona',         ejemplo: 'fisica',                 req: true,  nota: 'fisica | juridica' },
  { key: 'tipo_identificacion',  label: 'tipo_identificacion',  ejemplo: '1',                      req: true,  nota: '1=Cédula 3=DIMEX 5=Pasaporte 2=Cédula Jurídica 4=Otro' },
  { key: 'numero_identificacion',label: 'numero_identificacion',ejemplo: '1-0234-0567',            req: true,  nota: 'Sin guiones para cédulas jurídicas' },
  { key: 'nombre_cliente',       label: 'nombre_cliente',       ejemplo: 'María',                  req: false, nota: 'Solo para persona física' },
  { key: 'primer_apellido',      label: 'primer_apellido',      ejemplo: 'Rodríguez',              req: false, nota: 'Solo para persona física' },
  { key: 'segundo_apellido',     label: 'segundo_apellido',     ejemplo: 'Mora',                   req: false, nota: 'Solo para persona física' },
  { key: 'nombre_empresa',       label: 'nombre_empresa',       ejemplo: 'Empresa XYZ S.A.',       req: false, nota: 'Solo para persona jurídica' },
  { key: 'cedula_juridica',      label: 'cedula_juridica',      ejemplo: '3-101-123456',           req: false, nota: 'Solo para persona jurídica' },
  { key: 'fecha_nacimiento',     label: 'fecha_nacimiento',     ejemplo: '1985-06-15',             req: false, nota: 'Formato YYYY-MM-DD' },
  { key: 'genero',               label: 'genero',               ejemplo: 'F',                      req: false, nota: 'M | F | otro' },
  { key: 'estado_civil',         label: 'estado_civil',         ejemplo: 'Casado/a',               req: false, nota: 'Soltero/a | Casado/a | Divorciado/a | Viudo/a | Unión libre' },
  { key: 'actividad_economica',  label: 'actividad_economica',  ejemplo: 'Comercio al por menor',  req: false, nota: 'Ver hoja "Actividades" de esta plantilla' },
  { key: 'pais_nacimiento',      label: 'pais_nacimiento',      ejemplo: 'Costa Rica',             req: false, nota: '' },
  { key: 'pais_ubicacion',       label: 'pais_ubicacion',       ejemplo: 'Costa Rica',             req: false, nota: 'País de residencia actual' },
  { key: 'provincia',            label: 'provincia',            ejemplo: 'San José',               req: false, nota: 'Ver hoja "Provincias" de esta plantilla' },
  { key: 'canton',               label: 'canton',               ejemplo: 'Escazú',                 req: false, nota: 'Ver hoja "Cantones" de esta plantilla' },
  { key: 'direccion_exacta',     label: 'direccion_exacta',     ejemplo: 'Del Banco Nacional 100m norte', req: false, nota: '' },
  { key: 'telefono',             label: 'telefono',             ejemplo: '8888-8888',              req: false, nota: '' },
  { key: 'correo_electronico',   label: 'correo_electronico',   ejemplo: 'correo@ejemplo.com',     req: false, nota: '' },
  { key: 'fecha_vinculacion',    label: 'fecha_vinculacion',    ejemplo: '2024-01-15',             req: false, nota: 'Formato YYYY-MM-DD' },
  { key: 'proposito_relacion',   label: 'proposito_relacion',   ejemplo: 'Servicios contables',   req: false, nota: '' },
  { key: 'origen_fondos',        label: 'origen_fondos',        ejemplo: 'Salario / planilla',     req: false, nota: 'Salario / planilla | Negocio propio | Venta de bienes | Inversiones | Herencia | Remesas | Pensión | Préstamo | Otro' },
  { key: 'ingreso_mensual_est',  label: 'ingreso_mensual_est',  ejemplo: '2500',                   req: false, nota: 'Monto en USD' },
  { key: 'notas',                label: 'notas',                ejemplo: 'Cliente referido por...',req: false, nota: '' },
]

// ─── Generador de plantilla Excel ────────────────────────────────────────────
function generarPlantilla() {
  const wb = XLSX.utils.book_new()

  // Hoja 1: Clientes (encabezados + fila ejemplo + fila notas)
  const wsData = [
    COLUMNAS.map(c => c.label),
    COLUMNAS.map(c => c.ejemplo),
    COLUMNAS.map(c => c.nota ? `[${c.nota}]` : ''),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Ancho de columnas
  ws['!cols'] = COLUMNAS.map(() => ({ wch: 22 }))

  // Estilo encabezado (solo disponible en xlsx Pro — se aplica lo que se puede)
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')

  // Hoja 2: Actividades
  const wsAct = XLSX.utils.aoa_to_sheet([
    ['actividad_economica', 'nivel_riesgo'],
    ...ACTIVIDADES_PROFESIONES.map(a => [a.label, a.valor === 1 ? 'Bajo' : a.valor === 2 ? 'Medio' : 'Alto'])
  ])
  wsAct['!cols'] = [{ wch: 50 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsAct, 'Actividades')

  // Hoja 3: Provincias
  const wsProv = XLSX.utils.aoa_to_sheet([
    ['provincia'],
    ...PROVINCIAS_CR.map(p => [p])
  ])
  XLSX.utils.book_append_sheet(wb, wsProv, 'Provincias')

  // Hoja 4: Cantones
  const wsCant = XLSX.utils.aoa_to_sheet([
    ['provincia', 'canton'],
    ...CANTONES_CR.map(c => [c.provincia, c.canton])
  ])
  wsCant['!cols'] = [{ wch: 18 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsCant, 'Cantones')

  // Hoja 5: Países
  const wsPaises = XLSX.utils.aoa_to_sheet([
    ['pais', 'nivel_riesgo'],
    ...PAISES_RIESGO.map(p => [p.pais, p.valor === 1 ? 'Bajo' : p.valor === 2 ? 'Medio' : 'Alto'])
  ])
  wsPaises['!cols'] = [{ wch: 30 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsPaises, 'Países')

  XLSX.writeFile(wb, 'Plantilla_Clientes_CNL.xlsx')
}

// ─── Normalizar fila de Excel a payload Supabase ─────────────────────────────
function normalizarFila(fila, tenantId) {
  const tipo = (fila.tipo_persona || 'fisica').toLowerCase().trim()
  const actNombre = (fila.actividad_economica || '').trim()
  const actObj = ACTIVIDADES_PROFESIONES.find(a => a.label.toLowerCase() === actNombre.toLowerCase())

  return {
    tenant_id: tenantId,
    tipo_persona: tipo,
    tipo_identificacion: String(fila.tipo_identificacion || (tipo === 'juridica' ? '2' : '1')),
    numero_identificacion: String(fila.numero_identificacion || '').trim(),
    nombre_cliente:   tipo === 'fisica'   ? (fila.nombre_cliente || '').trim() : '',
    primer_apellido:  tipo === 'fisica'   ? (fila.primer_apellido || '').trim() : '',
    segundo_apellido: tipo === 'fisica'   ? (fila.segundo_apellido || '').trim() : '',
    nombre_empresa:   tipo === 'juridica' ? (fila.nombre_empresa || '').trim() : '',
    cedula_juridica:  tipo === 'juridica' ? (fila.cedula_juridica || fila.numero_identificacion || '').trim() : null,
    fecha_nacimiento: fila.fecha_nacimiento || null,
    genero:           (fila.genero || '').trim() || null,
    estado_civil:     (fila.estado_civil || '').trim() || null,
    actividad_economica:  actNombre || null,
    actividad_eco_nombre: actNombre || null,
    actividad_eco_valor:  actObj?.valor || null,
    profesion_nombre: tipo === 'fisica' ? (actNombre || null) : null,
    profesion_valor:  tipo === 'fisica' ? (actObj?.valor || null) : null,
    pais_nacimiento:  (fila.pais_nacimiento || '').trim() || null,
    pais_ubicacion:   (fila.pais_ubicacion || '').trim() || null,
    pais_residencia:  (fila.pais_ubicacion || '').trim() || null,
    provincia:        (fila.provincia || '').trim() || null,
    canton:           (fila.canton || '').trim() || null,
    direccion_exacta: (fila.direccion_exacta || '').trim() || null,
    telefono:         String(fila.telefono || '').trim() || null,
    correo_electronico: (fila.correo_electronico || '').trim() || null,
    fecha_vinculacion:  fila.fecha_vinculacion || new Date().toISOString().slice(0, 10),
    proposito_relacion: (fila.proposito_relacion || '').trim() || null,
    origen_fondos:      (fila.origen_fondos || '').trim() || null,
    ingreso_mensual_est: fila.ingreso_mensual_est ? Number(fila.ingreso_mensual_est) : null,
    notas:   (fila.notas || '').trim() || null,
    activo:  true,
    estado_dd:          'pendiente',
    estado_listas:      'pendiente',
    estado_calificacion:'pendiente',
  }
}

// ─── Validar fila ─────────────────────────────────────────────────────────────
function validarFila(fila, idx) {
  const errores = []
  const tipo = (fila.tipo_persona || '').toLowerCase().trim()

  if (!['fisica', 'juridica'].includes(tipo))
    errores.push('tipo_persona debe ser "fisica" o "juridica"')
  if (!fila.numero_identificacion)
    errores.push('numero_identificacion es obligatorio')
  if (tipo === 'fisica' && !fila.nombre_cliente)
    errores.push('nombre_cliente es obligatorio para persona física')
  if (tipo === 'juridica' && !fila.nombre_empresa)
    errores.push('nombre_empresa es obligatorio para persona jurídica')

  return errores.length > 0 ? { fila: idx + 1, errores } : null
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function CargaMasivaClientes({ onClose, onCargaCompleta }) {
  const { tenant } = useAuth()
  const inputRef = useRef(null)

  const [filas, setFilas]       = useState([])        // datos parseados
  const [errores, setErrores]   = useState([])        // errores de validación
  const [paso, setPaso]         = useState('inicio')  // inicio | preview | cargando | resultado
  const [resultado, setResultado] = useState(null)    // { ok, fallidos }
  const [archivoNombre, setArchivoNombre] = useState('')

  // Parsear Excel subido
  const handleArchivo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivoNombre(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result)
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })

      // Filtrar la fila de notas (que empieza con "[")
      const filasDatos = raw.filter(r => {
        const primer = Object.values(r)[0] || ''
        return !String(primer).startsWith('[')
      })

      // Validar
      const errs = filasDatos
        .map((f, i) => validarFila(f, i))
        .filter(Boolean)

      setFilas(filasDatos)
      setErrores(errs)
      setPaso('preview')
    }
    reader.readAsArrayBuffer(file)
  }

  // Insertar en Supabase
  const handleCargar = async () => {
    if (errores.length > 0) return
    setPaso('cargando')

    const payloads = filas.map(f => normalizarFila(f, tenant?.id))
    const LOTE = 50
    let ok = 0
    const fallidos = []

    for (let i = 0; i < payloads.length; i += LOTE) {
      const lote = payloads.slice(i, i + LOTE)
      const { error } = await supabase.from('clientes').insert(lote)
      if (error) {
        // Insertar uno por uno para identificar cuáles fallan
        for (let j = 0; j < lote.length; j++) {
          const { error: e2 } = await supabase.from('clientes').insert(lote[j])
          if (e2) fallidos.push({ fila: i + j + 1, razon: e2.message })
          else ok++
        }
      } else {
        ok += lote.length
      }
    }

    setResultado({ ok, fallidos })
    setPaso('resultado')
    if (ok > 0) onCargaCompleta()
  }

  const reset = () => {
    setFilas([]); setErrores([]); setPaso('inicio'); setResultado(null); setArchivoNombre('')
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Render ──
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📥 Carga masiva de clientes</h2>
            <p className="text-xs text-gray-500">Importe múltiples clientes desde un archivo Excel</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── PASO: INICIO ── */}
          {paso === 'inicio' && (
            <div className="space-y-6">
              {/* Paso 1: descargar plantilla */}
              <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-800">Paso 1 — Descargue la plantilla</p>
                <p className="text-xs text-blue-700">
                  La plantilla incluye hojas de referencia con las actividades económicas, provincias, cantones y países disponibles.
                  La fila 2 es un ejemplo y la fila 3 son instrucciones; elimínelas antes de cargar si lo desea, o déjelas — el sistema las ignora automáticamente.
                </p>
                <button onClick={generarPlantilla}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  ⬇ Descargar Plantilla_Clientes_CNL.xlsx
                </button>
              </div>

              {/* Paso 2: subir archivo */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand-400 transition-colors cursor-pointer"
                onClick={() => inputRef.current?.click()}>
                <p className="text-4xl mb-3">📂</p>
                <p className="text-sm font-medium text-gray-700">
                  {archivoNombre || 'Haga clic para seleccionar el archivo Excel'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Formatos: .xlsx, .xls</p>
                <input ref={inputRef} type="file" accept=".xlsx,.xls"
                  className="hidden" onChange={handleArchivo} />
              </div>

              {/* Columnas disponibles */}
              <div className="card">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Columnas de la plantilla</p>
                <div className="grid grid-cols-3 gap-1">
                  {COLUMNAS.map(c => (
                    <div key={c.key} className="flex items-center gap-1.5">
                      {c.req
                        ? <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" title="Obligatorio" />
                        : <span className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
                      }
                      <span className="text-xs text-gray-600 font-mono">{c.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">🔴 Obligatorio &nbsp;⚪ Opcional</p>
              </div>
            </div>
          )}

          {/* ── PASO: PREVIEW ── */}
          {paso === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    📄 {archivoNombre} — {filas.length} fila{filas.length !== 1 ? 's' : ''} detectada{filas.length !== 1 ? 's' : ''}
                  </p>
                  {errores.length > 0
                    ? <p className="text-xs text-red-600 mt-0.5">⚠ {errores.length} fila{errores.length !== 1 ? 's' : ''} con errores — corrija el Excel y vuelva a subirlo</p>
                    : <p className="text-xs text-green-600 mt-0.5">✓ Todas las filas son válidas</p>
                  }
                </div>
                <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg">
                  Cambiar archivo
                </button>
              </div>

              {/* Errores de validación */}
              {errores.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                  {errores.map((e, i) => (
                    <div key={i} className="text-xs text-red-700">
                      <span className="font-semibold">Fila {e.fila}:</span> {e.errores.join('; ')}
                    </div>
                  ))}
                </div>
              )}

              {/* Preview tabla */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">#</th>
                      <th className="px-3 py-2 text-left text-gray-500">Tipo</th>
                      <th className="px-3 py-2 text-left text-gray-500">Identificación</th>
                      <th className="px-3 py-2 text-left text-gray-500">Nombre / Razón social</th>
                      <th className="px-3 py-2 text-left text-gray-500">Actividad</th>
                      <th className="px-3 py-2 text-left text-gray-500">País</th>
                      <th className="px-3 py-2 text-left text-gray-500">Correo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filas.slice(0, 100).map((f, i) => {
                      const tieneError = errores.some(e => e.fila === i + 1)
                      const tipo = (f.tipo_persona || '').toLowerCase()
                      const nombreMostrar = tipo === 'juridica'
                        ? f.nombre_empresa
                        : [f.nombre_cliente, f.primer_apellido, f.segundo_apellido].filter(Boolean).join(' ')
                      return (
                        <tr key={i} className={tieneError ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-xs ${tipo === 'juridica' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                              {tipo === 'juridica' ? '🏢 Jurídica' : '👤 Física'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-gray-600">{f.numero_identificacion}</td>
                          <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[180px] truncate">{nombreMostrar || <span className="text-red-400">⚠ Falta nombre</span>}</td>
                          <td className="px-3 py-1.5 text-gray-500 max-w-[140px] truncate">{f.actividad_economica}</td>
                          <td className="px-3 py-1.5 text-gray-500">{f.pais_ubicacion}</td>
                          <td className="px-3 py-1.5 text-gray-500">{f.correo_electronico}</td>
                        </tr>
                      )
                    })}
                    {filas.length > 100 && (
                      <tr><td colSpan={7} className="px-3 py-2 text-center text-gray-400">
                        … y {filas.length - 100} filas más
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── PASO: CARGANDO ── */}
          {paso === 'cargando' && (
            <div className="text-center py-16">
              <div className="animate-spin text-5xl mb-4">⏳</div>
              <p className="text-gray-700 font-medium">Cargando {filas.length} clientes…</p>
              <p className="text-xs text-gray-400 mt-1">Esto puede tomar unos segundos</p>
            </div>
          )}

          {/* ── PASO: RESULTADO ── */}
          {paso === 'resultado' && resultado && (
            <div className="space-y-4 py-4 text-center">
              <p className="text-5xl">{resultado.fallidos.length === 0 ? '✅' : '⚠️'}</p>
              <p className="text-lg font-bold text-gray-900">
                {resultado.ok} cliente{resultado.ok !== 1 ? 's' : ''} importado{resultado.ok !== 1 ? 's' : ''} correctamente
              </p>
              {resultado.fallidos.length > 0 && (
                <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  <p className="text-xs font-semibold text-red-700 mb-2">{resultado.fallidos.length} fila{resultado.fallidos.length !== 1 ? 's' : ''} no importada{resultado.fallidos.length !== 1 ? 's' : ''}:</p>
                  {resultado.fallidos.map((f, i) => (
                    <p key={i} className="text-xs text-red-600">Fila {f.fila}: {f.razon}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          {paso === 'inicio' && (
            <p className="text-xs text-gray-400">La tercera fila de la plantilla (instrucciones) se ignora automáticamente</p>
          )}
          {paso === 'preview' && (
            <>
              <button onClick={reset} className="px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                ← Volver
              </button>
              <button onClick={handleCargar} disabled={errores.length > 0}
                className="btn-primary px-6 disabled:opacity-40 disabled:cursor-not-allowed">
                {errores.length > 0 ? `⚠ ${errores.length} errores — corrija antes de importar` : `⬆ Importar ${filas.length} clientes`}
              </button>
            </>
          )}
          {paso === 'resultado' && (
            <>
              <button onClick={reset} className="px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Cargar otro archivo
              </button>
              <button onClick={onClose} className="btn-primary px-6">
                Cerrar
              </button>
            </>
          )}
          {paso === 'inicio' && (
            <div /> // spacer
          )}
        </div>

      </div>
    </div>
  )
}
