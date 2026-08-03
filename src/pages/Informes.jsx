import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ErrorBanner from '../components/ui/ErrorBanner'
import { clasificarError } from '../lib/errorHandler'
import InformeLaborales from '../components/informes/InformeLaborales'
import InformePlanTrabajo from '../components/informes/InformePlanTrabajo'
import InformePlanCapacitacion from '../components/informes/InformePlanCapacitacion'
import PanelPeriodicidad from '../components/informes/PanelPeriodicidad'
import { evaluarSeñalesAPNFD, etiquetaActividad } from '../lib/señalesAlertaAPNFD'

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

function fmtFechaLarga(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })
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
  const [guardado, setGuardado] = useState(false)
  const [error, setError]       = useState(null)
  const [penalizacion, setPenalizacion] = useState(0)
  const informeRef = useRef(null)
  const tenantEfectivo = tenant

  const labelPeriodo = fechaDesde && fechaHasta
    ? `${fmtFechaLarga(fechaDesde)} al ${fmtFechaLarga(fechaHasta)}`
    : ''

  // ── Guardar informe en base de datos ───────────────────────────────────────
  async function guardarInformeTransaccional(resumen) {
    if (!tenantEfectivo?.id) return
    try {
      await supabase.from('informes_generados').insert({
        tenant_id:           tenantEfectivo.id,
        tipo_informe:        'transaccional',
        periodo:             fechaDesde.substring(0, 7),
        generado_por:        profile?.id,
        generado_por_nombre: profile?.nombre,
        resumen_json:        resumen,
      })
      setGuardado(true)
    } catch { /* Tabla puede no existir aún en dev */ }
  }

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
    setGuardado(false)
    try {
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
  }, [tenantEfectivo, fechaDesde, fechaHasta])

  // Guardar automáticamente cuando se generan datos
  useEffect(() => {
    if (!generado || txns.length === 0) return
    guardarInformeTransaccional({
      total_txns:    txns.length,
      total_monto:   txns.reduce((s, t) => s + Number(t.monto_movimiento), 0),
      fecha_desde:   fechaDesde,
      fecha_hasta:   fechaHasta,
      actividad:     tenantEfectivo?.actividad_apnfd,
    })
  }, [generado]) // eslint-disable-line

  // ─── Análisis ──────────────────────────────────────────────────────────────
  const umbral = Number(tenantEfectivo?.monto_minimo_usd) || 10000

  const totalMonto    = txns.reduce((s, t) => s + Number(t.monto_movimiento), 0)
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

  // ── Alertas generales (reglas base) ───────────────────────────────────────
  const alertasBase = []
  txns.filter(t => Number(t.monto_movimiento) >= umbral).forEach(t => {
    alertasBase.push({ nivel: 'alto', desc: `${getNombre(t)} — USD ${Number(t.monto_movimiento).toLocaleString()} ≥ umbral SUGEF`, detalle: 'Transacción que supera el monto mínimo de reporte obligatorio. Evalúe si corresponde presentar reporte SICVECA.' })
  })
  txns.forEach(t => {
    const o = (t.pais_origen_recursos || '').toUpperCase()
    const d = (t.pais_destino_recursos || '').toUpperCase()
    if (PAISES_RIESGO.includes(o)) alertasBase.push({ nivel: 'alto', desc: `${getNombre(t)} — país origen alto riesgo: ${o}`, detalle: 'Jurisdicción incluida en listas GAFI. Requiere debida diligencia reforzada.' })
    if (PAISES_RIESGO.includes(d)) alertasBase.push({ nivel: 'alto', desc: `${getNombre(t)} — país destino alto riesgo: ${d}`, detalle: 'Jurisdicción incluida en listas GAFI. Requiere debida diligencia reforzada.' })
  })
  Object.values(porCliente).filter(c => c.txns.length > 2).forEach(c => {
    alertasBase.push({ nivel: 'medio', desc: `${c.nombre} — ${c.txns.length} transacciones en el período`, detalle: 'Múltiples operaciones. Verifique si corresponden a patrón de operación múltiple o actividad inusual.' })
  })
  clientes.forEach(cl => {
    const data = porCliente[cl.numero_identificacion]
    if (!data || !cl.ingreso_mensual_est) return
    const ingresoEst = Number(cl.ingreso_mensual_est)
    const totalMes = data.ingresos + data.salidas
    const ratio = ingresoEst > 0 ? totalMes / ingresoEst : 0
    // Alerta si el volumen transaccional supera el ingreso mensual estimado
    if (totalMes > ingresoEst) {
      const nivelAlerta = ratio >= 3 ? 'alto' : 'medio'
      alertasBase.push({
        nivel: nivelAlerta,
        desc: `${cl.nombre_empresa || cl.nombre_cliente} — volumen USD ${totalMes.toLocaleString()} es ${ratio.toFixed(1)}x su ingreso mensual estimado`,
        detalle: `Ingreso mensual estimado del cliente: USD ${ingresoEst.toLocaleString()}. Volumen transaccional del período: USD ${totalMes.toLocaleString()}. Evalúe si corresponde a su perfil económico y actualice el expediente de debida diligencia.`,
      })
    }
  })
  txns.filter(t => !t.fecha_transaccion).forEach(t => {
    alertasBase.push({ nivel: 'bajo', desc: `${getNombre(t)} — sin fecha de transacción`, detalle: 'Campo requerido para el reporte SICVECA. Corrija antes de enviar.' })
  })

  // ── Señales APNFD específicas ──────────────────────────────────────────────
  const señalesAPNFD = evaluarSeñalesAPNFD(txns, clientes, tenantEfectivo)
  const alertasAPNFD = señalesAPNFD.map(s => ({
    nivel:   s.nivel === 'rojo' ? 'alto' : s.nivel === 'naranja' ? 'medio' : 'bajo',
    desc:    s.mensaje,
    detalle: s.detalle,
    apnfd:   true,
  }))

  // ── Todas las alertas combinadas ──────────────────────────────────────────
  const alertas      = [...alertasBase, ...alertasAPNFD]
  const alertasAlto  = alertas.filter(a => a.nivel === 'alto')
  const alertasMedio = alertas.filter(a => a.nivel === 'medio')
  const alertasBajo  = alertas.filter(a => a.nivel === 'bajo')

  function imprimir() { window.print() }

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
  const actividadLabel = etiquetaActividad(tenantEfectivo)

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Informes de Cumplimiento</h1>
          <p className="text-gray-500 text-sm mt-1">Módulo 1 — Reportes ALA/CFT · {actividadLabel}</p>
        </div>
        {generado && tabActiva === 'transaccional' && (
          <div className="flex gap-2 flex-wrap items-center">
            {guardado && <span className="text-xs text-green-600 font-medium">✅ Guardado</span>}
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <button onClick={imprimir} className="btn-primary text-sm">🖨️ Descargar PDF</button>
                <a href={generarMailto()} className="btn-secondary text-sm">📧 Redactar correo</a>
              </div>
              <p className="text-xs text-gray-400">Descargue el PDF primero y adjúntelo al correo manualmente</p>
            </div>
          </div>
        )}
      </div>

      {/* Panel de periodicidad — siempre visible */}
      {tenantEfectivo?.id && (
        <PanelPeriodicidad
          tenantId={tenantEfectivo.id}
          onPenalizacion={setPenalizacion}
        />
      )}
      {penalizacion > 0 && (
        <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          <span>⚠️</span>
          <span>La calificación global de cumplimiento lleva una <strong>penalización de -{penalizacion} puntos</strong> por informes vencidos. Genere los informes faltantes para restaurarla.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTabActiva(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap
              ${tabActiva === t.id
                ? 'bg-white border border-b-white border-gray-200 text-brand-700 -mb-px'
                : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-informes */}
      {tabActiva === 'labores'      && <InformeLaborales     tenantEfectivo={tenantEfectivo} />}
      {tabActiva === 'plan_trabajo' && <InformePlanTrabajo   tenantEfectivo={tenantEfectivo} />}
      {tabActiva === 'capacitacion' && <InformePlanCapacitacion tenantEfectivo={tenantEfectivo} />}

      {/* ── Análisis Transaccional ─────────────────────────────────────────── */}
      {tabActiva === 'transaccional' && <>
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {/* Selector de período */}
      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Fecha de inicio</label>
          <input type="date" className="input-field w-44" value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setGenerado(false) }} />
        </div>
        <div>
          <label className="label">Fecha final</label>
          <input type="date" className="input-field w-44" value={fechaHasta} min={fechaDesde}
            onChange={e => { setFechaHasta(e.target.value); setGenerado(false) }} />
        </div>
        <button onClick={cargar} disabled={loading || !fechaDesde || !fechaHasta || !tenantEfectivo} className="btn-primary">
          {loading ? 'Generando…' : '▶ Generar informe'}
        </button>
        {tenantEfectivo && (
          <div className="ml-auto text-sm text-gray-500 text-right">
            <p><span className="font-medium">Entidad:</span> {tenantEfectivo.nombre}</p>
            <p><span className="font-medium">Actividad:</span> {tenantEfectivo.actividad_apnfd || '—'}</p>
            <p><span className="font-medium">Umbral SUGEF:</span> USD {umbral.toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* ── INFORME ─────────────────────────────────────────────────────────── */}
      {generado && (
        <div ref={informeRef} id="informe-pdf" className="space-y-6">

          {/* PORTADA */}
          <div className="card border-2 border-brand-200 bg-brand-50 print:border-0">
            <div className="text-center py-6">
              {tenantEfectivo?.logo_url && (
                <img src={tenantEfectivo.logo_url} alt="Logo" className="h-14 mx-auto mb-3 object-contain" />
              )}
              <p className="text-xs uppercase tracking-widest text-brand-500 mb-1">CNL Craniley Compliance Services</p>
              <h2 className="text-2xl font-bold text-brand-900">Informe de Análisis Transaccional</h2>
              <p className="text-brand-600 mt-1">Según Acuerdo SUGEF 13-19 · Ley 7786 y sus reformas</p>
              <p className="text-xs text-brand-500 mt-1 font-medium uppercase tracking-wider">Confidencial — Dirigido a Junta Directiva</p>
              <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-left">
                {[
                  { l: 'Entidad',              v: tenantEfectivo?.nombre },
                  { l: 'Cédula Jurídica',      v: tenantEfectivo?.cedula_juridica || '—' },
                  { l: 'Actividad APNFD',      v: tenantEfectivo?.actividad_apnfd || '—' },
                  { l: 'Período analizado',    v: labelPeriodo },
                  { l: 'Elaborado por',        v: profile?.nombre },
                  { l: 'Fecha de elaboración', v: new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' }) },
                ].map(s => (
                  <div key={s.l} className="bg-white rounded-lg p-3">
                    <p className="text-brand-400 text-xs">{s.l}</p>
                    <p className="font-semibold text-brand-800 text-sm">{s.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* I. INTRODUCCIÓN */}
          <section className="card space-y-3">
            <h3 className="font-bold text-brand-900 border-b border-brand-100 pb-2">I. Introducción y Base Legal</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              El presente informe de Análisis Transaccional ha sido elaborado por el Oficial de Cumplimiento de{' '}
              <strong>{tenantEfectivo?.nombre}</strong>, en cumplimiento de las obligaciones establecidas en la{' '}
              <strong>Ley 7786 — Ley sobre Estupefacientes, Sustancias Psicotrópicas, Drogas de Uso No Autorizado,
              Actividades Conexas, Legitimación de Capitales y Financiamiento al Terrorismo</strong> y sus reformas,
              así como en el <strong>Acuerdo SUGEF 13-19 — Reglamento sobre Programas de Cumplimiento para Sujetos
              Obligados No Financieros</strong>.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              El análisis comprende el período <strong>{labelPeriodo}</strong> y tiene por objeto presentar a la Junta
              Directiva un panorama detallado de la transaccionalidad de la entidad, identificar señales de alerta de
              posibles conductas de Legitimación de Capitales, Financiamiento al Terrorismo o Financiamiento a la
              Proliferación de Armas de Destrucción Masiva (LC/FT/FPADM), y formular recomendaciones de mitigación.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              La entidad se encuentra inscrita ante la Superintendencia General de Entidades Financieras (SUGEF) como
              sujeto obligado bajo la actividad de <strong>{tenantEfectivo?.actividad_apnfd || 'APNFD'}</strong>, con
              un umbral de reporte de <strong>USD {umbral.toLocaleString()}</strong>. El análisis incluye señales de
              alerta específicas para esta categoría según las guías del GAFI y la metodología SUGEF 13-19.
            </p>
          </section>

          {/* II. ESTADÍSTICAS GLOBALES */}
          <section className="card space-y-4">
            <h3 className="font-bold text-brand-900 border-b border-brand-100 pb-2">II. Variaciones Globales del Período</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Transacciones',  val: txns.length,                  color: 'text-brand-600',  bg: 'bg-brand-50' },
                { label: 'Monto total',    val: 'USD ' + fmtUSD(totalMonto),  color: 'text-gray-900',   bg: 'bg-gray-50' },
                { label: 'Total ingresos', val: 'USD ' + fmtUSD(totalIngresos), color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Total salidas',  val: 'USD ' + fmtUSD(totalSalidas),  color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 ${s.bg}`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              Durante el período analizado, <strong>{tenantEfectivo?.nombre}</strong> registró un total de{' '}
              <strong>{txns.length} transacciones</strong> por un monto agregado de{' '}
              <strong>USD {fmtUSD(totalMonto)}</strong>. Los ingresos representaron USD {fmtUSD(totalIngresos)}
              {totalMonto > 0 ? ` (${Math.round(totalIngresos / totalMonto * 100)}% del flujo total)` : ''} y las
              salidas USD {fmtUSD(totalSalidas)}{totalMonto > 0 ? ` (${Math.round(totalSalidas / totalMonto * 100)}%)` : ''}.
              {' '}{totalIngresos > totalSalidas
                ? `El período muestra un flujo neto positivo de USD ${fmtUSD(totalIngresos - totalSalidas)}, consistente con la actividad ordinaria.`
                : totalSalidas > totalIngresos
                  ? `El período presenta un flujo neto negativo de USD ${fmtUSD(totalSalidas - totalIngresos)}, situación que debe justificarse en el contexto del giro de negocio.`
                  : 'Los flujos de ingresos y salidas están balanceados en el período.'
              }
              {txns.some(t => Number(t.monto_movimiento) >= umbral) &&
                ` Se identificaron transacciones que superan el umbral de reporte de USD ${umbral.toLocaleString()}, detalladas en la sección de hallazgos.`
              }
            </p>
          </section>

          {/* III. HALLAZGOS Y SEÑALES DE ALERTA */}
          <section className="card space-y-4">
            <h3 className="font-bold text-brand-900 border-b border-brand-100 pb-2">
              III. Hallazgos y Señales de Alerta
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({alertas.length} identificadas · {alertasAPNFD.length} señales APNFD)
              </span>
            </h3>

            {/* Resumen ejecutivo */}
            {alertas.length > 0 ? (
              <div className={`rounded-xl p-4 border-2 ${
                alertasAlto.length > 0 ? 'bg-red-50 border-red-300' :
                alertasMedio.length > 0 ? 'bg-orange-50 border-orange-300' : 'bg-yellow-50 border-yellow-300'
              }`}>
                <p className="text-sm font-semibold text-gray-800 mb-2">Resumen ejecutivo de hallazgos:</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  El análisis del período identificó un total de <strong>{alertas.length} señales de alerta</strong>:
                  {alertasAlto.length > 0 && <> <strong className="text-red-700">{alertasAlto.length} de alta severidad</strong>,</>}
                  {alertasMedio.length > 0 && <> <strong className="text-orange-700">{alertasMedio.length} de severidad media</strong></>}
                  {alertasBajo.length > 0 && <> y <strong className="text-yellow-700">{alertasBajo.length} de baja severidad</strong>.</>}
                  {alertasAPNFD.length > 0 &&
                    <> De estas, <strong>{alertasAPNFD.length}</strong> son señales propias de la actividad de <em>{actividadLabel}</em> conforme a las guías GAFI y SUGEF 13-19.</>
                  }
                  {alertasAlto.length >= 3
                    ? ' El volumen y naturaleza de las alertas de alta severidad ameritan atención prioritaria; se recomienda evaluar la presentación de un ROS ante la UIF del ICD.'
                    : alertasAlto.length > 0
                      ? ' Se recomienda documentar las acciones tomadas ante las alertas de alta severidad y evaluar si corresponde presentar un ROS.'
                      : ' Se recomienda documentar en el expediente las acciones tomadas ante cada alerta.'
                  }
                </p>
              </div>
            ) : (
              <div className="rounded-xl p-4 bg-green-50 border-2 border-green-300">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">✅</span>
                  <div>
                    <p className="font-semibold text-green-800">Sin señales de alerta detectadas en el período</p>
                    <p className="text-sm text-green-700 mt-1">
                      El análisis de las {txns.length} transacciones del período, incluyendo señales específicas para
                      {' '}<em>{actividadLabel}</em>, no arrojó hallazgos que ameriten acciones adicionales a los controles ordinarios.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {alertasAlto.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Alertas de Alta Severidad</p>
                {alertasAlto.map((a, i) => (
                  <div key={i} className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm">
                    <div className="flex gap-2">
                      <span>🔴</span>
                      <div>
                        <p className="font-semibold text-red-800">{a.desc}</p>
                        {a.detalle && <p className="text-xs text-red-600 mt-0.5">{a.detalle}</p>}
                        {a.apnfd && <span className="inline-block mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Señal APNFD — {actividadLabel}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {alertasMedio.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Alertas de Severidad Media</p>
                {alertasMedio.map((a, i) => (
                  <div key={i} className="rounded-lg p-3 bg-orange-50 border border-orange-200 text-sm">
                    <div className="flex gap-2">
                      <span>🟠</span>
                      <div>
                        <p className="font-semibold text-orange-800">{a.desc}</p>
                        {a.detalle && <p className="text-xs text-orange-600 mt-0.5">{a.detalle}</p>}
                        {a.apnfd && <span className="inline-block mt-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Señal APNFD — {actividadLabel}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {alertasBajo.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Alertas de Baja Severidad</p>
                {alertasBajo.map((a, i) => (
                  <div key={i} className="rounded-lg p-3 bg-yellow-50 border border-yellow-200 text-sm">
                    <div className="flex gap-2"><span>🟡</span><div><p className="font-semibold text-yellow-800">{a.desc}</p>{a.detalle && <p className="text-xs text-yellow-600 mt-0.5">{a.detalle}</p>}</div></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* IV. ANÁLISIS POR CLIENTE */}
          {clientesAnalisis.length > 0 && (
            <section className="card space-y-4">
              <h3 className="font-bold text-brand-900 border-b border-brand-100 pb-2">IV. Análisis por Cliente</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                A continuación se detalla el comportamiento transaccional por cliente durante el período, ordenados por
                volumen de operaciones. Los clientes con observaciones de cumplimiento se destacan en color.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
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
                      const superaLimite = clienteDB?.ingreso_mensual_est &&
                        (c.ingresos + c.salidas) > Number(clienteDB.ingreso_mensual_est)
                      const obs = []
                      if (c.txns.length > 2) obs.push('Operación frecuente')
                      if (superaLimite) obs.push('Supera límite mensual')
                      if (c.txns.some(t => Number(t.monto_movimiento) >= umbral)) obs.push('Monto sobre umbral SUGEF')
                      if (Math.abs(neto) > (c.ingresos + c.salidas) * 0.3) obs.push('Desequilibrio I/S')
                      return (
                        <tr key={c.id} className={`hover:bg-gray-50 ${obs.length ? 'bg-red-50/30' : ''}`}>
                          <td className="py-3 px-3 font-medium text-gray-900">{c.nombre}</td>
                          <td className="py-3 px-3 text-gray-500 font-mono text-xs">{c.id}</td>
                          <td className="py-3 px-3 text-center text-gray-600">{c.txns.length}</td>
                          <td className="py-3 px-3 text-right text-green-700 font-mono">{c.ingresos > 0 ? 'USD ' + fmtUSD(c.ingresos) : '—'}</td>
                          <td className="py-3 px-3 text-right text-orange-600 font-mono">{c.salidas > 0 ? 'USD ' + fmtUSD(c.salidas) : '—'}</td>
                          <td className={`py-3 px-3 text-right font-mono font-medium ${neto >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {neto >= 0 ? '+' : ''}USD {fmtUSD(Math.abs(neto))}
                          </td>
                          <td className="py-3 px-3 text-xs">
                            {obs.length > 0
                              ? <span className="text-red-600">{obs.join(' · ')}</span>
                              : <span className="text-green-600">Sin alertas</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 font-bold bg-gray-50">
                      <td className="py-3 px-3 text-gray-700" colSpan={3}>TOTALES DEL PERÍODO</td>
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
            </section>
          )}

          {txns.length === 0 && (
            <div className="card py-12 text-center text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p>No hay transacciones registradas en el período {labelPeriodo}.</p>
            </div>
          )}

          {/* V. CONCLUSIONES Y RECOMENDACIONES */}
          {txns.length > 0 && (
            <section className="card space-y-4">
              <h3 className="font-bold text-brand-900 border-b border-brand-100 pb-2">V. Conclusiones y Recomendaciones al Órgano de Dirección</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                Con base en el análisis de las <strong>{txns.length} transacciones</strong> del período <strong>{labelPeriodo}</strong>,
                el Oficial de Cumplimiento presenta las siguientes conclusiones y recomendaciones a la Junta Directiva de <strong>{tenantEfectivo?.nombre}</strong>:
              </p>
              <div className="space-y-3">
                {[
                  { n: '1.', area: 'Monitoreo continuo', accion: `La revisión mensual de la transaccionalidad permite detectar de forma oportuna desviaciones respecto al perfil de riesgo de los clientes. Se recomienda mantener actualizado el umbral de reporte (actualmente USD ${umbral.toLocaleString()}) conforme a los cambios regulatorios de SUGEF.` },
                  { n: '2.', area: 'Expedientes de clientes', accion: 'Los clientes que presentaron alertas en este período deben tener sus expedientes de debida diligencia actualizados, con la justificación de las operaciones observadas. Esto es un requisito indispensable del Acuerdo SUGEF 13-19, Art. 21-28.' },
                  alertasAlto.length > 0 ? { n: '3.', area: 'Acción urgente — alertas de alta severidad', accion: `Se identificaron ${alertasAlto.length} alertas de alta severidad. El Oficial de Cumplimiento recomienda evaluar, en los próximos 5 días hábiles, si alguna constituye una operación sospechosa que amerite la presentación de un ROS ante la UIF del ICD (Ley 7786, Art. 27).` } : null,
                  { n: alertasAlto.length > 0 ? '4.' : '3.', area: 'Señales APNFD — ' + actividadLabel, accion: alertasAPNFD.length > 0 ? `Se identificaron ${alertasAPNFD.length} señales específicas de la actividad de ${actividadLabel}. Se recomienda revisar los controles internos relacionados con estas tipologías según las guías GAFI vigentes.` : `No se detectaron señales de alerta específicas de la actividad de ${actividadLabel}. Se recomienda mantener la vigilancia y actualizar los controles según las tipologías GAFI publicadas para este sector.` },
                ].filter(Boolean).map((r, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                    <span className="font-bold text-brand-700 flex-shrink-0">{r.n}</span>
                    <div><span className="font-semibold text-gray-800">{r.area}: </span><span className="text-gray-600 leading-relaxed">{r.accion}</span></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* VI. DECLARACIÓN DEL OFICIAL */}
          <section className="card bg-gray-50 space-y-4">
            <h3 className="font-bold text-brand-900 border-b border-brand-100 pb-2">VI. Declaración del Oficial de Cumplimiento</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              El suscrito Oficial de Cumplimiento de <strong>{tenantEfectivo?.nombre}</strong> hace constar que el presente
              informe fue elaborado con base en la información registrada en el Sistema SICVECA, en cumplimiento del{' '}
              <strong>Acuerdo SUGEF 13-19</strong> y demás normativa ALA/CFT vigente en Costa Rica. La información aquí
              contenida es de carácter <strong>confidencial</strong> y de uso exclusivo de la Junta Directiva.
            </p>
            <div className="grid grid-cols-2 gap-8 pt-2">
              <div className="text-center">
                <div className="border-t border-gray-400 pt-3 mt-16">
                  <p className="font-semibold text-gray-700">{profile?.nombre}</p>
                  <p className="text-sm text-gray-500">Oficial de Cumplimiento ALA/CFT</p>
                  <p className="text-xs text-gray-400 mt-0.5">{tenantEfectivo?.nombre}</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-3 mt-16">
                  <p className="font-semibold text-gray-700">___________________________</p>
                  <p className="text-sm text-gray-500">Representante de Junta Directiva</p>
                  <p className="text-xs text-gray-400 mt-0.5">Recibido conforme · Fecha: ____________</p>
                </div>
              </div>
            </div>
          </section>

          {/* Pie */}
          <div className="card text-center text-xs text-gray-400 bg-gray-50">
            <p>Informe generado el {new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })} por {profile?.nombre}</p>
            <p>CNL Craniley Compliance Services · app.cnl-cr.com</p>
            <p className="mt-1 font-medium text-gray-500">Documento confidencial — Conservar por mínimo 5 años (Ley 7786, Art. 24)</p>
            {guardado && <p className="mt-1 text-green-600">✅ Informe registrado en el sistema — {new Date().toLocaleDateString('es-CR')}</p>}
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #informe-pdf, #informe-pdf * { visibility: visible; }
          #informe-pdf {
            position: absolute;
            left: 0; top: 0;
            width: 100%;
            padding: 1.5rem;
          }
          #informe-pdf .card {
            border: 1px solid #e4e4ea !important;
            box-shadow: none !important;
            break-inside: avoid;
            margin-bottom: 1rem;
          }
          #informe-pdf button,
          #informe-pdf a { display: none !important; }
        }
      `}</style>
      </>}
    </div>
  )
}
