import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ErrorBanner from '../components/ui/ErrorBanner'
import { clasificarError } from '../lib/errorHandler'
import InformeLaborales from '../components/informes/InformeLaborales'
import InformePlanTrabajo from '../components/informes/InformePlanTrabajo'
import InformePlanCapacitacion from '../components/informes/InformePlanCapacitacion'

const TABS = [
  { id: 'transaccional', label: '📊 Análisis Transaccional' },
  { id: 'labores',       label: '📋 Informe de Labores' },
  { id: 'plan_trabajo',  label: '📅 Plan de Trabajo' },
  { id: 'capacitacion',  label: '🎓 Plan de Capacitación' },
]

const PAISES_RIESGO = ['KP','IR','MM','SY','RU','BY','SD','SS','YE','SO','LY','HT','PA','PH','NG','VN']

function getNombre(t) {
  return t.nombre_empresa || `${t.nombre_cliente || ''} ${t.primer_apellido || ''}`.trim() || t.numero_identificacion
}

export default function Informes() {
  const { tenant, profile, isSuperAdmin } = useAuth()
  const [tabActiva, setTabActiva] = useState('transaccional')
  const hoy = new Date().toISOString().substring(0, 10)
  const primerDiaMes = new Date().toISOString().substring(0, 7) + '-01'
  const [fechaDesde, setFechaDesde] = useState(primerDiaMes)
  const [fechaHasta, setFechaHasta] = useState(hoy)
  const [txns, setTxns]         = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading]   = useState(false)
  const [generado, setGenerado] = useState(false)
  const [error, setError]       = useState(null)
  const informeRef = useRef(null)
  const tenantEfectivo = tenant

  const labelPeriodo = fechaDesde && fechaHasta
    ? `${new Date(fechaDesde + 'T12:00:00').toLocaleDateString('es-CR')} al ${new Date(fechaHasta + 'T12:00:00').toLocaleDateString('es-CR')}`
    : ''

  const cargar = useCallback(async () => {
    if (!tenantEfectivo) {
      setError({ tipo: 'validacion', mensaje: 'Sin entidad configurada.' })
      return
    }
    if (!fechaDesde || !fechaHasta) return
    if (fechaDesde > fechaHasta) {
      setError({ tipo: 'validacion', mensaje: 'La fecha de inicio debe ser anterior a la fecha final.' })
      return
    }
    setLoading(true)
    setError(null)
    try {
      // periodo se almacena como YYYY-MM-01 (primer día del mes)
      // Se filtra el mes de inicio y el mes de fin para capturar todas las transacciones del rango
      const periodoDesde = fechaDesde.substring(0, 7) + '-01'
      const periodoHasta = fechaHasta.substring(0, 7) + '-01'
      const [{ data: t, error: e1 }, { data: c, error: e2 }] = await Promise.all([
        supabase.from('transacciones').select('*')
          .eq('tenant_id', tenantEfectivo.id)
          .gte('periodo', periodoDesde)
          .lte('periodo', periodoHasta)
          .order('fecha_transaccion', { ascending: false }),
        supabase.from('clientes').select('*').eq('tenant_id', tenantEfectivo.id),
      ])
      if (e1) throw e1
      if (e2) throw e2
      setTxns(t || [])
      setClientes(c || [])
      setGenerado(true)
    } catch (err) {
      setError(clasificarError(err))
    } finally {
      setLoading(false)
    }
  }, [tenantEfectivo, fechaDesde, fechaHasta, isSuperAdmin])

  // ─── Análisis ────────────────────────────────────────────────────────────
  const umbral = Number(tenantEfectivo?.monto_minimo_usd) || 10000

  const totalMonto   = txns.reduce((s, t) => s + Number(t.monto_movimiento), 0)
  const totalIngresos = txns.filter(t => t.tipo_movimiento === 1).reduce((s, t) => s + Number(t.monto_movimiento), 0)
  const totalSalidas  = txns.filter(t => t.tipo_movimiento === 2).reduce((s, t) => s + Number(t.monto_movimiento), 0)

  // Agrupar por cliente
  const porCliente = {}
  txns.forEach(t => {
    const k = t.numero_identificacion
    if (!porCliente[k]) porCliente[k] = { nombre: getNombre(t), id: k, txns: [], ingresos: 0, salidas: 0 }
    porCliente[k].txns.push(t)
    if (t.tipo_movimiento === 1) porCliente[k].ingresos += Number(t.monto_movimiento)
    if (t.tipo_movimiento === 2) porCliente[k].salidas  += Number(t.monto_movimiento)
  })
  const clientesAnalisis = Object.values(porCliente)
    .sort((a, b) => (b.ingresos + b.salidas) - (a.ingresos + a.salidas))

  // Alertas
  const alertas = []
  txns.filter(t => Number(t.monto_movimiento) >= umbral).forEach(t => {
    alertas.push({ nivel: 'alto', desc: `${getNombre(t)} — USD ${Number(t.monto_movimiento).toLocaleString()} ≥ umbral SUGEF` })
  })
  txns.forEach(t => {
    const o = (t.pais_origen_recursos || '').toUpperCase()
    const d = (t.pais_destino_recursos || '').toUpperCase()
    if (PAISES_RIESGO.includes(o)) alertas.push({ nivel: 'alto', desc: `${getNombre(t)} — país origen alto riesgo: ${o}` })
    if (PAISES_RIESGO.includes(d)) alertas.push({ nivel: 'alto', desc: `${getNombre(t)} — país destino alto riesgo: ${d}` })
  })
  Object.values(porCliente).filter(c => c.txns.length > 2).forEach(c => {
    alertas.push({ nivel: 'medio', desc: `${c.nombre} — ${c.txns.length} transacciones en el período` })
  })
  // Clientes que superan su límite
  clientes.forEach(cl => {
    const data = porCliente[cl.numero_identificacion]
    if (!data || !cl.nivel_transaccional_max_mes) return
    const total = data.ingresos + data.salidas
    if (total > Number(cl.nivel_transaccional_max_mes)) {
      alertas.push({ nivel: 'alto', desc: `${cl.nombre_empresa || cl.nombre_cliente} — transaccional USD ${total.toLocaleString()} supera límite mensual USD ${Number(cl.nivel_transaccional_max_mes).toLocaleString()}` })
    }
  })
  txns.filter(t => !t.fecha_transaccion).forEach(t => {
    alertas.push({ nivel: 'bajo', desc: `${getNombre(t)} — sin fecha de transacción` })
  })

  const alertasAlto  = alertas.filter(a => a.nivel === 'alto')
  const alertasMedio = alertas.filter(a => a.nivel === 'medio')
  const alertasBajo  = alertas.filter(a => a.nivel === 'bajo')

  function imprimir() {
    window.print()
  }

  function generarMailto() {
    const asunto = encodeURIComponent(`Informe Análisis Transaccional — ${tenantEfectivo?.nombre} — ${labelPeriodo}`)
    const resumen = encodeURIComponent(
      `Estimados,\n\nAdjunto informe de análisis transaccional.\n\n` +
      `Período: ${labelPeriodo}\nEntidad: ${tenantEfectivo?.nombre}\n` +
      `Total transacciones: ${txns.length}\nMonto total: USD ${totalMonto.toLocaleString()}\n` +
      `Alertas detectadas: ${alertas.length} (${alertasAlto.length} alta, ${alertasMedio.length} media, ${alertasBajo.length} baja)\n\n` +
      `Elaborado por: ${profile?.nombre}\nCNL Compliance App`
    )
    const destino = tenantEfectivo?.email_oficial_cumplimiento || profile?.email || ''
    return `mailto:${destino}?cc=${profile?.email || ''}&subject=${asunto}&body=${resumen}`
  }

  const fmtUSD = n => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Informes de Cumplimiento</h1>
          <p className="text-gray-500 text-sm mt-1">Módulo 1 — Reportes ALA/CFT</p>
        </div>
        {generado && tabActiva === 'transaccional' && (
          <div className="flex gap-2">
            <a href={generarMailto()} className="btn-secondary text-sm">📧 Enviar por correo</a>
            <button onClick={imprimir} className="btn-primary text-sm">🖨️ Descargar PDF</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTabActiva(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
              ${tabActiva === t.id
                ? 'bg-white border border-b-white border-gray-200 text-brand-700 -mb-px'
                : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>


      {/* Subcomponentes con tenantEfectivo como prop */}
      {tabActiva === 'labores' && <InformeLaborales tenantEfectivo={tenantEfectivo} />}
      {tabActiva === 'plan_trabajo' && <InformePlanTrabajo tenantEfectivo={tenantEfectivo} />}
      {tabActiva === 'capacitacion' && <InformePlanCapacitacion tenantEfectivo={tenantEfectivo} />}

      {/* Tab transaccional */}
      {tabActiva === 'transaccional' && <>
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {/* Selector de período */}
      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Fecha de inicio</label>
          <input type="date" className="input-field w-44"
            value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setGenerado(false) }} />
        </div>
        <div>
          <label className="label">Fecha final</label>
          <input type="date" className="input-field w-44"
            value={fechaHasta}
            min={fechaDesde}
            onChange={e => { setFechaHasta(e.target.value); setGenerado(false) }} />
        </div>
        <div>
          <button onClick={cargar} disabled={loading || !fechaDesde || !fechaHasta || !tenantEfectivo} className="btn-primary">
            {loading ? 'Generando…' : '▶ Generar informe'}
          </button>
        </div>
        {tenantEfectivo && (
          <div className="ml-auto text-sm text-gray-500">
            <p><span className="font-medium">Entidad:</span> {tenantEfectivo.nombre}</p>
            <p><span className="font-medium">Umbral SUGEF:</span> USD {umbral.toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* INFORME */}
      {generado && (
        <div ref={informeRef} id="informe-pdf" className="space-y-6">

          {/* Portada del informe */}
          <div className="card border-2 border-brand-200 bg-brand-50 print:border-0">
            <div className="text-center py-4">
              <p className="text-xs uppercase tracking-widest text-brand-500 mb-1">CNL Craniley Compliance Services</p>
              <h2 className="text-xl font-bold text-brand-900">Informe de Transaccionalidad</h2>
              <p className="text-brand-600 mt-1">Según Acuerdo SUGEF 13-19 · Ley 7786</p>
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-brand-400">Dirigido a</p><p className="font-semibold text-brand-800">Junta Directiva</p></div>
                <div><p className="text-brand-400">Entidad</p><p className="font-semibold text-brand-800">{tenantEfectivo?.nombre}</p></div>
                <div><p className="text-brand-400">Período</p><p className="font-semibold text-brand-800">{labelPeriodo}</p></div>
                <div><p className="text-brand-400">Elaborado por</p><p className="font-semibold text-brand-800">{profile?.nombre}</p></div>
                <div><p className="text-brand-400">Actividad APNFD</p><p className="font-semibold text-brand-800">{tenantEfectivo?.actividad_apnfd}</p></div>
                <div><p className="text-brand-400">Fecha</p><p className="font-semibold text-brand-800">{new Date().toLocaleDateString('es-CR')}</p></div>
              </div>
            </div>
          </div>

          {/* Estadísticas globales */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Variaciones Globales del Período</h3>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Transacciones', val: txns.length, color: 'text-brand-600', bg: 'bg-brand-50' },
                { label: 'Monto total', val: 'USD ' + fmtUSD(totalMonto), color: 'text-gray-900', bg: 'bg-gray-50' },
                { label: 'Total ingresos', val: 'USD ' + fmtUSD(totalIngresos), color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Total salidas', val: 'USD ' + fmtUSD(totalSalidas), color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(s => (
                <div key={s.label} className={`card ${s.bg}`}>
                  <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Alertas */}
          {alertas.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">
                Hallazgos y Señales de Alerta
                <span className="ml-2 text-sm font-normal text-gray-400">({alertas.length} detectadas)</span>
              </h3>
              <div className="space-y-2">
                {alertasAlto.map((a, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                    <span>🔴</span><div><span className="font-semibold text-red-800">Alta: </span><span className="text-red-700">{a.desc}</span></div>
                  </div>
                ))}
                {alertasMedio.map((a, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                    <span>🟠</span><div><span className="font-semibold text-orange-800">Media: </span><span className="text-orange-700">{a.desc}</span></div>
                  </div>
                ))}
                {alertasBajo.map((a, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                    <span>🟡</span><div><span className="font-semibold text-yellow-800">Baja: </span><span className="text-yellow-700">{a.desc}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {alertas.length === 0 && txns.length > 0 && (
            <div className="card bg-green-50 border border-green-200">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-semibold text-green-800">Sin alertas detectadas en el período</p>
                  <p className="text-sm text-green-600">Las transacciones del período no presentan señales de alerta según las reglas ALA/CFT.</p>
                </div>
              </div>
            </div>
          )}

          {/* Análisis por cliente */}
          {clientesAnalisis.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Análisis por Cliente</h3>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-3 text-gray-500 font-medium">Cliente</th>
                      <th className="text-left py-3 px-3 text-gray-500 font-medium">Identificación</th>
                      <th className="text-center py-3 px-3 text-gray-500 font-medium">Txns</th>
                      <th className="text-right py-3 px-3 text-gray-500 font-medium">Ingresos</th>
                      <th className="text-right py-3 px-3 text-gray-500 font-medium">Salidas</th>
                      <th className="text-right py-3 px-3 text-gray-500 font-medium">Flujo neto</th>
                      <th className="text-left py-3 px-3 text-gray-500 font-medium">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientesAnalisis.map(c => {
                      const neto = c.ingresos - c.salidas
                      const clienteDB = clientes.find(cl => cl.numero_identificacion === c.id)
                      const superaLimite = clienteDB?.nivel_transaccional_max_mes &&
                        (c.ingresos + c.salidas) > Number(clienteDB.nivel_transaccional_max_mes)
                      const obs = []
                      if (c.txns.length > 2) obs.push('Cliente frecuente')
                      if (superaLimite) obs.push('Supera límite mensual')
                      if (c.txns.some(t => Number(t.monto_movimiento) >= umbral)) obs.push('Monto sobre umbral SUGEF')
                      if (Math.abs(neto) > (c.ingresos + c.salidas) * 0.3) obs.push('Desequilibrio ingreso/salida')
                      return (
                        <tr key={c.id} className={`hover:bg-gray-50 ${obs.length ? 'bg-red-50/30' : ''}`}>
                          <td className="py-3 px-3 font-medium text-gray-900">{c.nombre}</td>
                          <td className="py-3 px-3 text-gray-500 font-mono text-xs">{c.id}</td>
                          <td className="py-3 px-3 text-center text-gray-600">{c.txns.length}</td>
                          <td className="py-3 px-3 text-right text-green-700 font-mono">
                            {c.ingresos > 0 ? 'USD ' + fmtUSD(c.ingresos) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-orange-600 font-mono">
                            {c.salidas > 0 ? 'USD ' + fmtUSD(c.salidas) : '—'}
                          </td>
                          <td className={`py-3 px-3 text-right font-mono font-medium ${neto >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {neto >= 0 ? '+' : ''}USD {fmtUSD(Math.abs(neto))}
                          </td>
                          <td className="py-3 px-3 text-xs">
                            {obs.length > 0 ? (
                              <span className="text-red-600">{obs.join(' · ')}</span>
                            ) : (
                              <span className="text-green-600">Sin alertas</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 font-bold">
                      <td className="py-3 px-3 text-gray-700" colSpan={3}>TOTALES</td>
                      <td className="py-3 px-3 text-right text-green-700 font-mono">USD {fmtUSD(totalIngresos)}</td>
                      <td className="py-3 px-3 text-right text-orange-600 font-mono">USD {fmtUSD(totalSalidas)}</td>
                      <td className={`py-3 px-3 text-right font-mono ${totalIngresos - totalSalidas >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {totalIngresos - totalSalidas >= 0 ? '+' : ''}USD {fmtUSD(Math.abs(totalIngresos - totalSalidas))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {txns.length === 0 && (
            <div className="card py-12 text-center text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p>No hay transacciones registradas en el período {labelPeriodo}.</p>
            </div>
          )}

          {/* Recomendaciones */}
          {txns.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">Recomendaciones de Cumplimiento</h3>
              <div className="space-y-3 text-sm">
                {[
                  { area: 'Monitoreo mensual', accion: 'Comparar ingresos vs salidas por cliente. Detectar acumulaciones o desfases inusuales.' },
                  { area: 'Documentación', accion: 'Mantener respaldo de cada transacción: contrato, factura, orden o autorización del cliente.' },
                  { area: 'Debida diligencia', accion: 'Actualizar expedientes de clientes con alertas detectadas. Solicitar justificación de variaciones.' },
                  alertasAlto.length > 0 ? { area: 'Acción urgente', accion: `Se detectaron ${alertasAlto.length} alertas de severidad alta. Evalúe la elaboración de un Reporte de Operación Sospechosa (ROS).` } : null,
                ].filter(Boolean).map((r, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="font-semibold text-brand-700 flex-shrink-0 w-40">{r.area}</span>
                    <span className="text-gray-600">{r.accion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pie del informe */}
          <div className="card bg-gray-50 text-center text-sm text-gray-500">
            <p>Informe generado el {new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })} por {profile?.nombre} · CNL Craniley Compliance Services</p>
            <p className="text-xs mt-1">Este informe es confidencial y de uso exclusivo del Oficial de Cumplimiento y la Junta Directiva.</p>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body > * { display: none !important; }
          #informe-pdf { display: block !important; }
          .card { border: 1px solid #e5e7eb; box-shadow: none; break-inside: avoid; }
          button, a { display: none !important; }
        }
      `}</style>
      </>}
    </div>
  )
}
