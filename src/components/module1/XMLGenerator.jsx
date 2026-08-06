import { useState, useEffect, useRef } from 'react'
import { supabase, tenantsDeLaApp } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { generarXMLSICVECA, descargarXML } from '../../lib/xmlGenerator'
import { TIPO_CARGA } from '../../lib/catalogos'
import ErrorBanner from '../ui/ErrorBanner'
import { clasificarError } from '../../lib/errorHandler'
import {
  aplicarReglasSICVECA,
  validarCodigosActividad,
  aplicarNombresPadron,
  fetchTipoCambio,
  getUmbralUSD,
} from '../../lib/sicvecaRules'

// ─── Selector de tenant con búsqueda ────────────────────────────────────────
function TenantSearch({ tenants, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef(null)
  const selected = tenants.find(t => t.id === value)
  const filtered = tenants.filter(t => t.nombre.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative flex-1">
      <button type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className="input-field text-sm w-full text-left flex items-center justify-between gap-2">
        <span className="truncate">{selected ? selected.nombre : '— Seleccione el sujeto obligado —'}</span>
        <span className="text-gray-400 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus className="input-field text-sm py-1.5" placeholder="Escriba para buscar…"
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-400 italic">Sin resultados</li>}
            {filtered.map(t => (
              <li key={t.id} onClick={() => { onChange(t.id); setOpen(false) }}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-brand-50 hover:text-brand-700 ${t.id === value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}>
                {t.nombre}
                {(!t.clase_dato || !t.archivo) && <span className="ml-2 text-xs text-amber-500">⚠ config. incompleta</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Badge de estado ─────────────────────────────────────────────────────────
function Badge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
      ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function XMLGenerator() {
  const { tenant, isSuperAdmin } = useAuth()

  // ── Tenant ──
  const [tenants, setTenants]             = useState([])
  const [tenantVistaId, setTenantVistaId] = useState('')
  const [tenantActivo, setTenantActivo]   = useState(null)

  // ── Config ──
  const [periodo, setPeriodo]       = useState(new Date().toISOString().substring(0, 7))
  const [tipoCarga, setTipoCarga]   = useState(1)
  const [tipoMoneda, setTipoMoneda] = useState(2)
  const [tipoCambio, setTipoCambio] = useState(530)   // CRC por 1 USD
  const [fetchingTC, setFetchingTC] = useState(false)

  // ── Flujo ──
  const [loading, setLoading]         = useState(false)
  const [validando, setValidando]     = useState(false)
  const [resultados, setResultados]   = useState(null)  // resultado de validación
  const [preview, setPreview]         = useState('')
  const [stats, setStats]             = useState(null)
  const [error, setError]             = useState(null)
  const [marcado, setMarcado]         = useState(false)

  // ── Tenants para superadmin ──
  useEffect(() => {
    if (isSuperAdmin) {
      tenantsDeLaApp('*').order('nombre').then(({ data }) => setTenants(data || []))
    } else {
      setTenantActivo(tenant)
      setTipoMoneda(tenant?.tipo_moneda_default || 2)
    }
  }, [isSuperAdmin, tenant])

  useEffect(() => {
    if (!isSuperAdmin || !tenantVistaId) { setTenantActivo(null); return }
    const t = tenants.find(t => t.id === tenantVistaId)
    setTenantActivo(t || null)
    if (t) setTipoMoneda(t.tipo_moneda_default || 2)
    resetResultados()
  }, [tenantVistaId, tenants, isSuperAdmin])

  function resetResultados() {
    setResultados(null); setStats(null); setPreview(''); setMarcado(false); setError(null)
  }

  // ── Obtener tipo de cambio ──
  async function obtenerTipoCambio() {
    setFetchingTC(true)
    const tc = await fetchTipoCambio()
    setFetchingTC(false)
    if (tc) {
      setTipoCambio(tc)
    } else {
      alert('No se pudo obtener el tipo de cambio automáticamente. Ingrese el valor manualmente.')
    }
  }

  // ── PASO 1: Validar transacciones ─────────────────────────────────────────
  async function validarTransacciones() {
    if (!tenantActivo) {
      setError({ tipo: 'operativo', mensaje: 'Seleccione el sujeto obligado.' }); return
    }
    if (!tenantActivo.clase_dato || !tenantActivo.archivo || !tenantActivo.cedula_juridica) {
      setError({ tipo: 'operativo', mensaje: `Faltan campos SICVECA para ${tenantActivo.nombre}: clase_dato, archivo, cedula_juridica.` }); return
    }
    if (!tipoCambio || tipoCambio <= 0) {
      setError({ tipo: 'operativo', mensaje: 'Ingrese el tipo de cambio CRC/USD.' }); return
    }

    setError(null)
    setValidando(true)
    resetResultados()

    try {
      // 1. Cargar transacciones del período
      const desde = periodo + '-01'
      const [yr, mo] = periodo.split('-').map(Number)
      const hasta = `${periodo}-${String(new Date(yr, mo, 0).getDate()).padStart(2, '0')}`

      const { data: txs, error: txErr } = await supabase
        .from('transacciones').select('*')
        .eq('tenant_id', tenantActivo.id)
        .gte('periodo', desde).lte('periodo', hasta)
        .order('created_at')

      if (txErr) throw txErr
      if (!txs || txs.length === 0) {
        setError({ tipo: 'operativo', mensaje: `No hay transacciones para ${tenantActivo.nombre} en ${periodo}.` })
        setValidando(false); return
      }

      // 2. Validar padrón — consultar nombre de cada cédula única
      const cedulasUnicas = [...new Set(txs.map(t => String(t.numero_identificacion).replace(/[-\s]/g, '')))]
      const resultadosPadron = await Promise.all(
        cedulasUnicas.map(async cedula => {
          const { data } = await supabase.rpc('buscar_padron', { p_identificacion: cedula })
          return { cedula, reg: data?.[0] || null }
        })
      )

      const erroresPadron    = resultadosPadron.filter(r => !r.reg)
      const nombresCorregidos = {}
      resultadosPadron.filter(r => r.reg).forEach(r => { nombresCorregidos[r.cedula] = r.reg })

      // 3. Aplicar reglas de umbral y tipo_operacion
      const { incluidas, excluidas, umbralUSD, stats: statsReglas } =
        aplicarReglasSICVECA(txs, tenantActivo.clase_dato, tipoCambio)

      // 4. Validar códigos de ingreso/salida por actividad
      const erroresCodigos = validarCodigosActividad(incluidas, tenantActivo.clase_dato)

      setResultados({
        txsTotal    : txs,
        incluidas,
        excluidas,
        umbralUSD,
        statsReglas,
        erroresPadron,
        nombresCorregidos,
        erroresCodigos,
        hayBloqueo  : erroresPadron.length > 0 || erroresCodigos.length > 0,
      })

    } catch (err) {
      setError(clasificarError(err))
    } finally {
      setValidando(false)
    }
  }

  // ── PASO 2: Generar XML ───────────────────────────────────────────────────
  async function generarXML() {
    if (!resultados || resultados.hayBloqueo) return
    setError(null)
    setLoading(true)
    try {
      // Aplicar nombres corregidos del padrón
      const txsCorregidas = aplicarNombresPadron(resultados.incluidas, resultados.nombresCorregidos)

      const xml = generarXMLSICVECA({
        clase_dato    : tenantActivo.clase_dato,
        archivo       : tenantActivo.archivo,
        cedula_juridica: tenantActivo.cedula_juridica,
        tipo_carga    : tipoCarga,
        tipo_moneda   : tipoMoneda,
        periodo       : periodo + '-01',
      }, txsCorregidas)

      const nombreArchivo = `${tenantActivo.actividad_apnfd?.replace(/\s+/g, '_')}_${periodo}`
      setPreview(xml)
      setStats({ registros: txsCorregidas.length, nombreArchivo, xml })
    } catch (err) {
      setError(clasificarError(err))
    } finally {
      setLoading(false)
    }
  }

  function descargar() {
    if (!stats) return
    descargarXML(stats.xml, stats.nombreArchivo)
  }

  async function marcarEnviado() {
    if (!tenantActivo || !stats) return
    const desde = periodo + '-01'
    const [yr2, mo2] = periodo.split('-').map(Number)
    const hasta = `${periodo}-${String(new Date(yr2, mo2, 0).getDate()).padStart(2, '0')}`
    const { error: err } = await supabase.from('transacciones')
      .update({ enviado_sugef: true, fecha_envio_sugef: new Date().toISOString() })
      .eq('tenant_id', tenantActivo.id).gte('periodo', desde).lte('periodo', hasta)
    if (err) { setError(clasificarError(err)); return }
    setMarcado(true)
  }

  const umbralUSD = tenantActivo ? getUmbralUSD(tenantActivo.clase_dato) : 10000

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Panel de configuración ── */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Generador XML SICVECA</h3>

        {/* Selector superadmin */}
        {isSuperAdmin && (
          <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
            <span className="text-amber-700 text-sm font-medium flex-shrink-0">🏢 Sujeto obligado:</span>
            <TenantSearch tenants={tenants} value={tenantVistaId}
              onChange={v => { setTenantVistaId(v); resetResultados() }} />
          </div>
        )}

        {/* Advertencia configuración incompleta */}
        {tenantActivo && (!tenantActivo.clase_dato || !tenantActivo.archivo || !tenantActivo.cedula_juridica) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            ⚠ <strong>Configuración incompleta:</strong> Falta(n)
            {!tenantActivo.clase_dato ? ' clase_dato' : ''}
            {!tenantActivo.archivo ? ' archivo' : ''}
            {!tenantActivo.cedula_juridica ? ' cedula_juridica' : ''}.
            Configure en <strong>Sujetos Obligados</strong>.
          </div>
        )}

        {tenantActivo && (
          <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded px-3 py-2">
            ✓ <strong>{tenantActivo.nombre}</strong> · {tenantActivo.actividad_apnfd} ·
            ClaseDato: {tenantActivo.clase_dato} · Umbral: US${umbralUSD.toLocaleString()}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Período *</label>
            <input type="month" className="input-field" value={periodo}
              onChange={e => { setPeriodo(e.target.value); resetResultados() }} />
          </div>
          <div>
            <label className="label">Tipo de carga *</label>
            <select className="input-field" value={tipoCarga}
              onChange={e => setTipoCarga(Number(e.target.value))}>
              {TIPO_CARGA.map(t => <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Moneda del reporte *</label>
            <select className="input-field" value={tipoMoneda}
              onChange={e => setTipoMoneda(Number(e.target.value))}>
              <option value={1}>1 — Colones (CRC)</option>
              <option value={2}>2 — Dólares (USD)</option>
            </select>
          </div>
          <div>
            <label className="label">Tipo de cambio CRC/USD *</label>
            <div className="flex gap-2">
              <input type="number" className="input-field flex-1" value={tipoCambio} min={1} step={0.01}
                onChange={e => setTipoCambio(Number(e.target.value))}
                placeholder="Ej: 530.00" />
              <button onClick={obtenerTipoCambio} disabled={fetchingTC}
                className="btn-secondary text-xs px-3 flex-shrink-0"
                title="Obtener tipo de cambio actual del BCCR">
                {fetchingTC ? '…' : '🔄 Auto'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Colones por 1 USD — se usa para aplicar el umbral en CRC</p>
          </div>
        </div>

        <ErrorBanner error={error} onClose={() => setError(null)} />

        <button className="btn-primary" onClick={validarTransacciones}
          disabled={validando || !tenantActivo}>
          {validando ? '⏳ Validando…' : '🔍 Validar transacciones'}
        </button>
      </div>

      {/* ── Panel de resultados de validación ── */}
      {resultados && (
        <div className="card space-y-5">
          <h3 className="font-semibold text-gray-900">Resultados de validación</h3>

          {/* ── 1. Padrón SUGEF ── */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700">1. Padrón SUGEF</span>
              <Badge ok={resultados.erroresPadron.length === 0}
                label={resultados.erroresPadron.length === 0
                  ? `${Object.keys(resultados.nombresCorregidos).length} clientes verificados`
                  : `${resultados.erroresPadron.length} cédula(s) no encontradas`} />
            </div>
            {resultados.erroresPadron.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700 mb-1">
                  ❌ Los siguientes clientes no están en el padrón SUGEF. Corrija los números de identificación antes de generar el XML:
                </p>
                {resultados.erroresPadron.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 font-mono">· {e.cedula}</p>
                ))}
              </div>
            )}
            {resultados.erroresPadron.length === 0 && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                ✓ Todos los clientes encontrados en el padrón. Los nombres en el XML se ajustarán al registro oficial.
              </p>
            )}
          </section>

          {/* ── 2. Filtro por umbral ── */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700">2. Filtro por umbral (US${resultados.umbralUSD.toLocaleString()})</span>
              <Badge ok={resultados.statsReglas.excluidas === 0}
                label={`${resultados.statsReglas.incluidas} incluidas / ${resultados.statsReglas.excluidas} excluidas`} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-700">{resultados.statsReglas.total}</p>
                <p className="text-xs text-blue-600">Total en período</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-700">{resultados.statsReglas.incluidas}</p>
                <p className="text-xs text-green-600">
                  En XML ({resultados.statsReglas.unicas} única{resultados.statsReglas.unicas !== 1 ? 's' : ''},
                  {' '}{resultados.statsReglas.multiples} múltiple{resultados.statsReglas.multiples !== 1 ? 's' : ''})
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-2xl font-bold text-gray-500">{resultados.statsReglas.excluidas}</p>
                <p className="text-xs text-gray-500">Excluidas del XML<br/>(quedan en la BD)</p>
              </div>
            </div>
            {resultados.excluidas.length > 0 && (
              <details className="bg-amber-50 border border-amber-200 rounded-lg">
                <summary className="px-3 py-2 text-xs font-semibold text-amber-800 cursor-pointer">
                  ⚠ Ver {resultados.excluidas.length} transacciones excluidas
                </summary>
                <div className="px-3 pb-3 max-h-40 overflow-y-auto">
                  <table className="w-full text-xs mt-2">
                    <thead><tr className="text-gray-500">
                      <th className="text-left py-1">Cédula</th>
                      <th className="text-left py-1">Mov.</th>
                      <th className="text-right py-1">Monto</th>
                      <th className="text-right py-1">USD equiv.</th>
                      <th className="text-left py-1">Fecha</th>
                    </tr></thead>
                    <tbody>
                      {resultados.excluidas.map((t, i) => (
                        <tr key={i} className="border-t border-amber-100">
                          <td className="py-1 font-mono">{t.numero_identificacion}</td>
                          <td className="py-1">{t.tipo_movimiento === 1 ? '⬆ Ing' : '⬇ Sal'}</td>
                          <td className="py-1 text-right">{Number(t.monto_movimiento).toLocaleString('es-CR')}</td>
                          <td className="py-1 text-right text-gray-500">${t._montoUSD?.toFixed(0)}</td>
                          <td className="py-1 text-gray-500">{t.fecha_transaccion || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>

          {/* ── 3. Validación de códigos ── */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700">3. Códigos ingreso/salida por actividad</span>
              <Badge ok={resultados.erroresCodigos.length === 0}
                label={resultados.erroresCodigos.length === 0
                  ? 'Todos los códigos son válidos'
                  : `${resultados.erroresCodigos.length} error(es) de código`} />
            </div>
            {resultados.erroresCodigos.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700 mb-1">
                  ❌ Las siguientes transacciones tienen códigos inválidos para la actividad {tenantActivo?.actividad_apnfd}:
                </p>
                {resultados.erroresCodigos.map((e, i) => (
                  <p key={i} className="text-xs text-red-600">
                    · Cédula <span className="font-mono">{e.cedula}</span> — {e.campo} = {e.valor} ({e.descripcion})
                  </p>
                ))}
              </div>
            )}
            {resultados.erroresCodigos.length === 0 && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                ✓ Todos los códigos de ingreso y salida corresponden a la actividad.
              </p>
            )}
          </section>

          {/* ── Resumen y botón generar ── */}
          {resultados.hayBloqueo ? (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-sm text-red-700">
              <strong>⛔ No se puede generar el XML.</strong> Corrija los errores marcados en rojo antes de continuar.
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-green-800 mb-3">
                ✅ Validación superada — listo para generar
              </p>
              <p className="text-xs text-green-700 mb-4">
                Se generará un XML con <strong>{resultados.statsReglas.incluidas} transacciones</strong>
                {' '}({resultados.statsReglas.unicas} operación única, {resultados.statsReglas.multiples} operación múltiple).
                {resultados.statsReglas.excluidas > 0 && (
                  <> Las {resultados.statsReglas.excluidas} transacciones excluidas quedan en la base de datos para análisis.</>
                )}
                {' '}Los nombres de clientes se ajustarán al padrón SUGEF.
              </p>
              <button className="btn-primary" onClick={generarXML} disabled={loading}>
                {loading ? 'Generando…' : '⚙️ Generar XML SICVECA'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Panel de XML generado ── */}
      {stats && (
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-green-700">✅ XML generado correctamente</h3>
              <p className="text-sm text-gray-600 mt-1">
                {stats.registros} registro{stats.registros !== 1 ? 's' : ''} — Archivo: <code className="bg-gray-100 px-1 rounded">{stats.nombreArchivo}.xml</code>
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={descargar} className="btn-primary text-sm">⬇ Descargar XML</button>
              {marcado ? (
                <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                  ✅ Marcado como enviado
                </span>
              ) : (
                <button onClick={marcarEnviado} className="btn-secondary text-sm">✓ Marcar como enviado</button>
              )}
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
            <pre className="text-xs text-green-300 font-mono whitespace-pre">
              {preview.length > 3000 ? preview.substring(0, 3000) + '\n\n[… truncado para vista previa]' : preview}
            </pre>
          </div>

          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Siguiente paso:</strong> Descarga el XML y cárgalo en <strong>SICVECA</strong> (sugef.fi.cr) dentro del plazo establecido.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
