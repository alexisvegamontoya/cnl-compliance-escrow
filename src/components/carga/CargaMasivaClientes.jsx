import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { parsearExcel, descargarPlantillaClientes } from '../../lib/plantillas'

function normalizarFecha(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function validarFila(row) {
  const errores = []
  if (!row.numero_identificacion) errores.push('Falta identificación')
  if (!row.tipo_identificacion) errores.push('Falta tipo identificación')
  const tipoId = Number(row.tipo_identificacion)
  const esFisica = [1, 3, 5].includes(tipoId)
  if (esFisica && !row.nombre_cliente) errores.push('Falta nombre')
  if (!esFisica && !row.nombre_empresa) errores.push('Falta nombre empresa')
  const riesgo = String(row.calificacion_riesgo || '').toLowerCase()
  if (riesgo && !['alto', 'medio', 'bajo'].includes(riesgo)) errores.push('Riesgo debe ser: alto/medio/bajo')
  return errores
}

export default function CargaMasivaClientes({ tenants, etiquetaCliente = 'clientes', onImportado }) {
  const { tenant, isSuperAdmin } = useAuth()
  const [abierto, setAbierto]   = useState(false)
  const [tenantId, setTenantId] = useState(tenant?.id || '')
  const [filas, setFilas]       = useState([])
  const [erroresPorFila, setErroresPorFila] = useState({})
  const [loading, setLoading]   = useState(false)
  const [resultado, setResultado] = useState(null)
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
      const validas = rows.filter(r => r.numero_identificacion)
      const errMap = {}
      validas.forEach((r, i) => {
        const errs = validarFila(r)
        if (errs.length) errMap[i] = errs
      })
      setFilas(validas)
      setErroresPorFila(errMap)
    } catch (err) {
      setParseError(err.message)
      setFilas([])
    }
  }

  async function importar() {
    if (!tenantSeleccionado) { alert('Seleccione el sujeto obligado.'); return }
    const filasValidas = filas.filter((_, i) => !erroresPorFila[i])
    if (!filasValidas.length) { alert('No hay filas válidas para importar.'); return }

    setLoading(true)

    const payload = filasValidas.map(r => {
      const tipoId = Number(r.tipo_identificacion)
      const esFisica = [1, 3, 5].includes(tipoId)
      const pep = String(r.pep || '').toUpperCase() === 'SI'
      const riesgo = String(r.calificacion_riesgo || '').toLowerCase()
      return {
        tenant_id: tenantSeleccionado.id,
        numero_identificacion: String(r.numero_identificacion).trim(),
        tipo_identificacion: tipoId,
        nombre_cliente: esFisica ? (String(r.nombre_cliente || '').trim() || null) : null,
        primer_apellido: esFisica ? (String(r.primer_apellido || '').trim() || null) : null,
        segundo_apellido: esFisica ? (String(r.segundo_apellido || '').trim() || null) : null,
        nombre_empresa: !esFisica ? (String(r.nombre_empresa || '').trim() || null) : null,
        nacionalidad: String(r.nacionalidad || '').trim() || null,
        pais_ubicacion: String(r.pais_ubicacion || '').trim() || null,
        actividad_economica: String(r.actividad_economica || '').trim() || null,
        telefono: String(r.telefono || '').trim() || null,
        correo_electronico: String(r.correo_electronico || '').trim() || null,
        fecha_vinculacion: normalizarFecha(r.fecha_vinculacion),
        pep,
        calificacion_riesgo: ['alto', 'medio', 'bajo'].includes(riesgo) ? riesgo : null,
        ingreso_mensual_est: r.ingreso_mensual_est ? Number(r.ingreso_mensual_est) : null,
        notas: String(r.notas || '').trim() || null,
      }
    })

    // Upsert por numero_identificacion + tenant_id
    const { error } = await supabase
      .from('clientes')
      .upsert(payload, { onConflict: 'tenant_id,numero_identificacion', ignoreDuplicates: false })

    setLoading(false)
    if (error) {
      setResultado({ ok: false, msg: error.message })
    } else {
      setResultado({ ok: true, msg: `${payload.length} ${etiquetaCliente} importados correctamente.` })
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
            <p className="font-semibold text-gray-900">Carga masiva de {etiquetaCliente} desde Excel</p>
            <p className="text-sm text-gray-500">Importe múltiples {etiquetaCliente} a la vez</p>
          </div>
        </div>
        <span className="text-gray-400">{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div className="mt-5 space-y-5 border-t border-gray-100 pt-5">
          {/* Plantilla */}
          <div className="flex items-center justify-between bg-brand-50 rounded-lg p-4">
            <div>
              <p className="font-medium text-brand-900 text-sm">Paso 1 — Descargue la plantilla</p>
              <p className="text-xs text-brand-600 mt-0.5">Complete la plantilla y luego cárguela aquí.</p>
            </div>
            <button onClick={descargarPlantillaClientes} className="btn-secondary text-sm flex-shrink-0">
              ⬇ Descargar plantilla
            </button>
          </div>

          {/* Sujeto obligado */}
          {isSuperAdmin && (
            <div>
              <p className="font-medium text-gray-900 text-sm mb-2">Paso 2 — Seleccione el sujeto obligado</p>
              <select className="input-field" value={tenantId} onChange={e => setTenantId(e.target.value)}>
                <option value="">— Seleccione el sujeto obligado —</option>
                {tenants?.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          )}

          {tenantSeleccionado && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
              ✓ Sujeto obligado: <strong>{tenantSeleccionado.nombre}</strong>
            </div>
          )}

          {/* Archivo */}
          <div>
            <p className="font-medium text-gray-900 text-sm mb-2">
              {isSuperAdmin ? 'Paso 3' : 'Paso 2'} — Cargue el archivo Excel
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFile}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
            />
            {parseError && <p className="mt-2 text-sm text-red-600">⚠ {parseError}</p>}
          </div>

          {/* Vista previa */}
          {filas.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-gray-900 text-sm">{filas.length} registros detectados</p>
                <div className="flex gap-2">
                  {filasOk > 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{filasOk} válidos</span>}
                  {filasConError > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{filasConError} con errores</span>}
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="py-2 px-3 text-left text-gray-500">#</th>
                      <th className="py-2 px-3 text-left text-gray-500">Identificación</th>
                      <th className="py-2 px-3 text-left text-gray-500">Nombre / Empresa</th>
                      <th className="py-2 px-3 text-left text-gray-500">Riesgo</th>
                      <th className="py-2 px-3 text-left text-gray-500">PEP</th>
                      <th className="py-2 px-3 text-right text-gray-500">Límite USD/mes</th>
                      <th className="py-2 px-3 text-left text-gray-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filas.map((r, i) => {
                      const errs = erroresPorFila[i]
                      const nombre = r.nombre_empresa || `${r.nombre_cliente || ''} ${r.primer_apellido || ''}`.trim()
                      const riesgo = String(r.calificacion_riesgo || '').toLowerCase()
                      return (
                        <tr key={i} className={errs ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                          <td className="py-2 px-3 font-mono">{r.numero_identificacion}</td>
                          <td className="py-2 px-3 max-w-xs truncate">{nombre || '—'}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              riesgo === 'alto' ? 'bg-red-100 text-red-700' :
                              riesgo === 'medio' ? 'bg-yellow-100 text-yellow-700' :
                              riesgo === 'bajo' ? 'bg-green-100 text-green-700' : 'text-gray-400'
                            }`}>{riesgo || '—'}</span>
                          </td>
                          <td className="py-2 px-3">{String(r.pep || '').toUpperCase() === 'SI' ? '🔴 SÍ' : 'NO'}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {r.ingreso_mensual_est ? Number(r.ingreso_mensual_est).toLocaleString() : '—'}
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
            </div>
          )}

          {resultado && (
            <div className={`px-4 py-3 rounded-lg text-sm font-medium ${resultado.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {resultado.ok ? '✅' : '❌'} {resultado.msg}
            </div>
          )}

          {filasOk > 0 && !resultado?.ok && (
            <div className="flex justify-end">
              <button onClick={importar} disabled={loading || !tenantSeleccionado} className="btn-primary">
                {loading ? 'Importando…' : `⬆ Importar ${filasOk} ${etiquetaCliente}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
