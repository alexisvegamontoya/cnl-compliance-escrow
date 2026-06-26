import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { parsearExcel, descargarPlantillaTransacciones } from '../../lib/plantillas'

function validarFila(row, idx) {
  const errores = []
  if (!row.numero_identificacion) errores.push('Falta número de identificación')
  if (!row.tipo_identificacion) errores.push('Falta tipo de identificación')
  if (!row.monto_movimiento || isNaN(Number(row.monto_movimiento))) errores.push('Monto inválido')
  if (!row.tipo_movimiento) errores.push('Falta tipo de movimiento')
  return errores
}

function normalizarFecha(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return s || null
}

export default function CargaMasivaTransacciones({ tenants, onImportado }) {
  const { tenant, isSuperAdmin } = useAuth()
  const [abierto, setAbierto]       = useState(false)
  const [periodoFallback, setPeriodoFallback] = useState(new Date().toISOString().substring(0, 7))
  const [tenantId, setTenantId]     = useState(tenant?.id || '')
  const [filas, setFilas]           = useState([])
  const [erroresPorFila, setErroresPorFila] = useState({})
  const [loading, setLoading]       = useState(false)
  const [resultado, setResultado]   = useState(null)
  const [parseError, setParseError] = useState('')
  const fileRef = useRef(null)

  const tenantSeleccionado = isSuperAdmin
    ? tenants?.find(t => t.id === tenantId)
    : tenant

  async function onFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setParseError('')
    setResultado(null)
    try {
      const rows = await parsearExcel(file)
      // Filtrar filas vacías
      const validas = rows.filter(r => r.numero_identificacion || r.monto_movimiento)
      const errMap = {}
      validas.forEach((r, i) => {
        const errs = validarFila(r, i)
        if (errs.length) errMap[i] = errs
      })
      setFilas(validas)
      setErroresPorFila(errMap)
    } catch (err) {
      setParseError(err.message)
      setFilas([])
    }
  }

  // Deriva el período YYYY-MM-01 desde la fecha de la transacción,
  // con fallback al mes seleccionado manualmente.
  function derivarPeriodo(fechaTxn) {
    const f = normalizarFecha(fechaTxn)
    if (f && f.length >= 7) return f.substring(0, 7) + '-01'
    return periodoFallback + '-01'
  }

  async function importar() {
    if (!tenantSeleccionado) { alert('Seleccione el sujeto obligado.'); return }
    const filasValidas = filas.filter((_, i) => !erroresPorFila[i])
    if (!filasValidas.length) { alert('No hay filas válidas para importar.'); return }

    setLoading(true)

    const payload = filasValidas.map(r => {
      const tipoId = Number(r.tipo_identificacion)
      const esFisica = [1, 3, 5].includes(tipoId)
      return {
        tenant_id: tenantSeleccionado.id,
        numero_identificacion: String(r.numero_identificacion).trim(),
        tipo_identificacion: tipoId,
        nombre_cliente: esFisica ? (String(r.nombre_cliente || '').trim() || null) : null,
        primer_apellido: esFisica ? (String(r.primer_apellido || '').trim() || null) : null,
        segundo_apellido: esFisica ? (String(r.segundo_apellido || '').trim() || null) : null,
        nombre_empresa: !esFisica ? (String(r.nombre_empresa || '').trim() || null) : null,
        tipo_reporte: Number(r.tipo_reporte) || 2,
        tipo_operacion: Number(r.tipo_operacion) || 1,
        tipo_movimiento: Number(r.tipo_movimiento) || 1,
        tipo_ingreso: Number(r.tipo_ingreso) || 0,
        tipo_salida: Number(r.tipo_salida) || 0,
        tipo_moneda_movimiento: Number(r.tipo_moneda_movimiento) || 2,
        monto_movimiento: parseFloat(r.monto_movimiento),
        fecha_transaccion: normalizarFecha(r.fecha_transaccion),
        motivo_transaccion: String(r.motivo_transaccion || '').trim() || null,
        ubicacion_cliente: String(r.ubicacion_cliente || '').trim() || null,
        pais_origen_recursos: String(r.pais_origen_recursos || '').toUpperCase().trim() || null,
        pais_destino_recursos: String(r.pais_destino_recursos || '').toUpperCase().trim() || null,
        periodo: derivarPeriodo(r.fecha_transaccion),
        accion: 'insertar',
      }
    })

    const { error } = await supabase.from('transacciones').insert(payload)
    setLoading(false)

    if (error) {
      setResultado({ ok: false, msg: error.message })
    } else {
      setResultado({ ok: true, msg: `${payload.length} transacciones importadas correctamente.` })
      setFilas([])
      setErroresPorFila({})
      if (fileRef.current) fileRef.current.value = ''
      onImportado?.()
    }
  }

  const filasConError = Object.keys(erroresPorFila).length
  const filasOk = filas.length - filasConError

  return (
    <div className="card border border-brand-200">
      <button
        onClick={() => setAbierto(a => !a)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <div>
            <p className="font-semibold text-gray-900">Carga masiva desde Excel</p>
            <p className="text-sm text-gray-500">Importe múltiples transacciones a la vez</p>
          </div>
        </div>
        <span className="text-gray-400">{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div className="mt-5 space-y-5 border-t border-gray-100 pt-5">
          {/* Descargar plantilla */}
          <div className="flex items-center justify-between bg-brand-50 rounded-lg p-4">
            <div>
              <p className="font-medium text-brand-900 text-sm">Paso 1 — Descargue la plantilla Excel</p>
              <p className="text-xs text-brand-600 mt-0.5">Complete la plantilla con las transacciones y luego cárguela aquí.</p>
            </div>
            <button
              onClick={descargarPlantillaTransacciones}
              className="btn-secondary text-sm flex-shrink-0"
            >
              ⬇ Descargar plantilla
            </button>
          </div>

          {/* Configuración */}
          <div>
            <p className="font-medium text-gray-900 text-sm mb-3">Paso 2 — Configure la carga</p>
            <div className="grid grid-cols-2 gap-4">
              {/* Sujeto obligado — solo superadmin */}
              {isSuperAdmin && (
                <div>
                  <label className="label">Sujeto Obligado *</label>
                  <select className="input-field" value={tenantId}
                    onChange={e => setTenantId(e.target.value)}>
                    <option value="">— Seleccione el sujeto obligado —</option>
                    {tenants?.map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Período fallback */}
              <div>
                <label className="label">Período de respaldo</label>
                <input type="month" className="input-field"
                  value={periodoFallback} onChange={e => setPeriodoFallback(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">
                  Se usa solo si una fila no tiene <code>fecha_transaccion</code>. Con fecha, el período se toma automáticamente.
                </p>
              </div>
            </div>

            {tenantSeleccionado && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
                <span className="text-green-700">✓ Sujeto obligado: <strong>{tenantSeleccionado.nombre}</strong></span>
                <span className="text-green-600 ml-3">· {tenantSeleccionado.actividad_apnfd}</span>
              </div>
            )}
          </div>

          {/* Cargar archivo */}
          <div>
            <p className="font-medium text-gray-900 text-sm mb-2">Paso 3 — Cargue el archivo Excel</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFile}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
            />
            {parseError && (
              <p className="mt-2 text-sm text-red-600">⚠ {parseError}</p>
            )}
          </div>

          {/* Vista previa */}
          {filas.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-gray-900 text-sm">
                  Vista previa — {filas.length} filas detectadas
                </p>
                <div className="flex gap-2">
                  {filasOk > 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{filasOk} válidas</span>}
                  {filasConError > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{filasConError} con errores</span>}
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="py-2 px-3 text-left font-medium text-gray-500">#</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-500">Identificación</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-500">Nombre / Empresa</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-500">Movimiento</th>
                      <th className="py-2 px-3 text-right font-medium text-gray-500">Monto</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-500">Fecha</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-500">Período</th>
                      <th className="py-2 px-3 text-left font-medium text-gray-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filas.map((r, i) => {
                      const errs = erroresPorFila[i]
                      const nombre = r.nombre_empresa || `${r.nombre_cliente || ''} ${r.primer_apellido || ''}`.trim()
                      const movLabel = { 1: '⬆ Ingreso', 2: '⬇ Salida', 3: '↕ Ambos' }
                      return (
                        <tr key={i} className={errs ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                          <td className="py-2 px-3 font-mono">{r.numero_identificacion}</td>
                          <td className="py-2 px-3 max-w-xs truncate">{nombre || '—'}</td>
                          <td className="py-2 px-3">{movLabel[Number(r.tipo_movimiento)] || r.tipo_movimiento}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {r.monto_movimiento ? Number(r.monto_movimiento).toLocaleString('es-CR') : '—'}
                          </td>
                          <td className="py-2 px-3">{normalizarFecha(r.fecha_transaccion) || '—'}</td>
                          <td className="py-2 px-3 font-mono text-xs text-gray-500">
                            {derivarPeriodo(r.fecha_transaccion).substring(0, 7)}
                          </td>
                          <td className="py-2 px-3">
                            {errs
                              ? <span className="text-red-600" title={errs.join(', ')}>⚠ {errs[0]}</span>
                              : <span className="text-green-600">✓</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {filasConError > 0 && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                  ⚠ Las {filasConError} filas con errores serán omitidas. Corrija el Excel y vuelva a cargarlo para incluirlas.
                </p>
              )}
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div className={`px-4 py-3 rounded-lg text-sm font-medium ${resultado.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {resultado.ok ? '✅' : '❌'} {resultado.msg}
            </div>
          )}

          {/* Botón importar */}
          {filasOk > 0 && !resultado?.ok && (
            <div className="flex justify-end">
              <button
                onClick={importar}
                disabled={loading || !tenantSeleccionado}
                className="btn-primary"
              >
                {loading ? 'Importando…' : `⬆ Importar ${filasOk} transacciones`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
