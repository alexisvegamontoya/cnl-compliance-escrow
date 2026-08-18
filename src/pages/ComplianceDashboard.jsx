import { useState, useEffect, useCallback } from 'react'
import { supabase, tenantsDeLaApp } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { calcularNivelCumplimiento } from '../lib/nivelCumplimiento'
import { useCatalogoDeTenant } from '../lib/CatalogoDocumentalContext'
import ErrorBanner from '../components/ui/ErrorBanner'

// ─── Pesos de cada ítem ───────────────────────────────────────────────────────
// ─── Colores por score ────────────────────────────────────────────────────────
function colorPct(p) {
  if (p >= 80) return '#1f6d45'
  if (p >= 60) return '#2a8655'
  if (p >= 40) return '#c89116'
  if (p >= 20) return '#c2661c'
  return '#c31b26'
}

// ─── Meses transcurridos desde una fecha ──────────────────────────────────────
function mesesDesde(fecha) {
  if (!fecha) return 999
  const desde = new Date(fecha)
  const ahora = new Date()
  return (ahora.getFullYear() - desde.getFullYear()) * 12 + (ahora.getMonth() - desde.getMonth())
}

// ─── Velocímetro SVG ──────────────────────────────────────────────────────────
function Velocimetro({ pct }) {
  const cx = 160, cy = 145, r = 110
  const segmentos = [
    { desde: 0,  hasta: 20,  color: '#c31b26' },
    { desde: 20, hasta: 40,  color: '#c2661c' },
    { desde: 40, hasta: 60,  color: '#c89116' },
    { desde: 60, hasta: 80,  color: '#2a8655' },
    { desde: 80, hasta: 100, color: '#1f6d45' },
  ]

  function polarToXY(deg, radius) {
    const rad = (deg * Math.PI) / 180
    return [cx + radius * Math.cos(rad), cy - radius * Math.sin(rad)]
  }

  function arcPath(desde, hasta, ri, ro) {
    const a1 = 180 - (desde / 100) * 180
    const a2 = 180 - (hasta / 100) * 180
    const [x1o, y1o] = polarToXY(a1, ro)
    const [x2o, y2o] = polarToXY(a2, ro)
    const [x1i, y1i] = polarToXY(a1, ri)
    const [x2i, y2i] = polarToXY(a2, ri)
    return `M ${x1o} ${y1o} A ${ro} ${ro} 0 0 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${ri} ${ri} 0 0 0 ${x1i} ${y1i} Z`
  }

  const needleDeg = 180 - (pct / 100) * 180
  const needleRad = (needleDeg * Math.PI) / 180
  const nx = cx + 90 * Math.cos(needleRad)
  const ny = cy - 90 * Math.sin(needleRad)

  return (
    <svg viewBox="0 0 320 170" className="w-full max-w-xs mx-auto">
      {segmentos.map(s => (
        <path key={s.desde} d={arcPath(s.desde, s.hasta, 75, 110)} fill={s.color} />
      ))}
      {[0, 20, 40, 60, 80, 100].map(v => {
        const deg = 180 - (v / 100) * 180
        const [lx, ly] = polarToXY(deg, 122)
        return <text key={v} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fill="#6b6b76" fontWeight="600">{v}</text>
      })}
      <circle cx={cx} cy={cy} r={14} fill="#f7f7f9" stroke="#e4e4ea" strokeWidth="1.5" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#2a2a32" strokeWidth="3" strokeLinecap="round" />
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize="22" fontWeight="700"
        fill={colorPct(pct)}>{Math.round(pct)}%</text>
      <text x={cx} y={cy + 44} textAnchor="middle" fontSize="9" fill="#6b6b76">CUMPLIMIENTO GLOBAL</text>
    </svg>
  )
}

// ─── Barra de progreso ─────────────────────────────────────────────────────────
function ProgressBar({ value }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
      <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, value)}%`, background: colorPct(value) }} />
    </div>
  )
}

// ─── Ítem card expandible ──────────────────────────────────────────────────────
function ItemCard({ num, label, score, peso, pendientes = [], children }) {
  const [open, setOpen] = useState(false)
  const completo = score >= 100
  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all ${completo ? 'border-green-200' : score >= 60 ? 'border-yellow-200' : 'border-red-200'}`}>
      <button className="w-full text-left p-4" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${completo ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}>
              {completo ? '✓' : num}
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{label}</p>
              <p className="text-xs text-gray-400">Peso: {peso}% del total</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xl font-bold" style={{ color: colorPct(score) }}>{Math.round(score)}%</span>
            <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
          </div>
        </div>
        <ProgressBar value={score} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {pendientes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 mb-1">⚠ Pendientes ({pendientes.length}):</p>
              <ul className="space-y-1">
                {pendientes.map((p, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-red-400 flex-shrink-0 mt-0.5">•</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {completo && !children && (
            <p className="text-xs text-green-600 font-medium">✓ Todo en orden</p>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function ComplianceDashboard() {
  const { tenant: tenantCtx, isSuperAdmin } = useAuth()

  // Superadmin: lista de tenants y selector
  const [allTenants, setAllTenants]   = useState([])
  const [tenantIdSel, setTenantIdSel] = useState('')
  const [tenantSel, setTenantSel]     = useState(null)

  const tenant = isSuperAdmin ? tenantSel : tenantCtx

  // Documentos exigidos por el sujeto obligado — el ítem 1 se calcula sobre ellos
  const catalogoDoc = useCatalogoDeTenant(tenant?.id)

  useEffect(() => {
    if (isSuperAdmin) {
      tenantsDeLaApp('*').then(({ data }) => setAllTenants(data || []))
    }
  }, [isSuperAdmin])

  useEffect(() => {
    if (isSuperAdmin) {
      setTenantSel(allTenants.find(t => t.id === tenantIdSel) || null)
    }
  }, [tenantIdSel, allTenants, isSuperAdmin])

  // Datos
  const [clientes, setClientes]         = useState([])
  const [normativa, setNormativa]       = useState([])
  const [transacciones, setTransacciones] = useState([])
  const [informes, setInformes]         = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [saving, setSaving]             = useState(false)

  // Items manuales
  const [fCapacitacion, setFCapacitacion] = useState({ completa: false, fecha: '' })
  const [fSistemas, setFSistemas]         = useState({ actualizado: false, fecha: '' })
  const [fEvalRiesgo, setFEvalRiesgo]     = useState({ fecha: '' })
  const [fInformes, setFInformes]         = useState({ labores: '', plan_trabajo: '', plan_capacitacion: '' })

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    setError(null)
    const tid = tenant.id

    const [
      { data: cls, error: eCls },
      { data: norm, error: eNorm },
      { data: txns, error: eTxns },
      { data: inf, error: eInf },
      { data: seg, error: eSeg },
    ] = await Promise.all([
      supabase.from('clientes')
        .select('id,pep,tipo_persona,calificacion_riesgo,nivel_riesgo_actual,estado_calificacion,estado_dd,estado_listas,kyc_actualizado,legal_actualizado,ingresos_actualizados,fecha_ultima_calificacion,aparece_en_listas,fecha_termino_relacion,activo,nombre_cliente,primer_apellido,nombre_empresa,numero_identificacion,cedula_juridica,checklist_documental,actividad_eco_nombre,actividad_economica,profesion_nombre,pais_ubicacion,pais_residencia,pais_nacimiento,pais_constitucion,fecha_nacimiento,fecha_constitucion,direccion_exacta,telefono,correo_electronico,fecha_vinculacion,proposito_relacion,origen_fondos,ingreso_mensual_est')
        .eq('tenant_id', tid),
      supabase.from('normativa')
        .select('id,fecha_aprobacion_jd,fecha_vigencia,tipo,nombre')
        .eq('tenant_id', tid).eq('activo', true),
      supabase.from('transacciones')
        .select('periodo').eq('tenant_id', tid)
        .order('periodo', { ascending: false }).limit(1),
      supabase.from('informes_generados')
        .select('fecha_generacion').eq('tenant_id', tid)
        .order('fecha_generacion', { ascending: false }).limit(1),
      supabase.from('compliance_seguimiento')
        .select('*').eq('tenant_id', tid).maybeSingle(),
    ])

    // Si una consulta falla, el ítem que alimenta quedaría en cero sin explicación.
    // Se reporta en pantalla en vez de calcular sobre datos incompletos.
    const fallo = [eCls, eNorm, eTxns, eInf, eSeg].find(e => e && e.code !== 'PGRST116')
    if (fallo) setError(fallo)

    setClientes(cls || [])
    setNormativa(norm || [])
    setTransacciones(txns || [])
    setInformes(inf || [])

    if (seg) {
      setFCapacitacion({ completa: seg.capacitacion_completa || false, fecha: seg.fecha_capacitacion || '' })
      setFSistemas({ actualizado: seg.sistemas_actualizados || false, fecha: seg.fecha_sistemas || '' })
      setFEvalRiesgo({ fecha: seg.fecha_evaluacion_riesgo || '' })
      setFInformes({
        labores:          seg.fecha_informe_labores       || '',
        plan_trabajo:     seg.fecha_plan_trabajo          || '',
        plan_capacitacion: seg.fecha_plan_capacitacion   || '',
      })
    } else {
      setFCapacitacion({ completa: false, fecha: '' })
      setFSistemas({ actualizado: false, fecha: '' })
      setFEvalRiesgo({ fecha: '' })
      setFInformes({ labores: '', plan_trabajo: '', plan_capacitacion: '' })
    }
    setLoading(false)
  }, [tenant])

  useEffect(() => { load() }, [load])

  async function guardarSeguimiento() {
    if (!tenant) return
    setSaving(true)
    setError(null)
    const { error: eGuardar } = await supabase.from('compliance_seguimiento').upsert({
      tenant_id: tenant.id,
      capacitacion_completa: fCapacitacion.completa,
      fecha_capacitacion: fCapacitacion.fecha || null,
      sistemas_actualizados: fSistemas.actualizado,
      fecha_sistemas: fSistemas.fecha || null,
      fecha_evaluacion_riesgo: fEvalRiesgo.fecha || null,
      fecha_informe_labores: fInformes.labores || null,
      fecha_plan_trabajo: fInformes.plan_trabajo || null,
      fecha_plan_capacitacion: fInformes.plan_capacitacion || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' })

    if (eGuardar) {
      setError(eGuardar)
      setSaving(false)
      return
    }
    await load()
    setSaving(false)
  }

  // ── Cálculos (fuente única: src/lib/nivelCumplimiento.js) ───────────────────
  const { items, scoreGlobal, etiqueta: etiquetaGlobal, globalClientes, tipoSujeto } =
    calcularNivelCumplimiento({
      tenant, clientes, normativa, transacciones, informes,
      seguimientoDerivado: { fCapacitacion, fSistemas, fEvalRiesgo, fInformes },
      catalogoDoc,
    })
  const scoreI1 = items[0].score
  const scoreI7 = items[6].score
  const clientesActivos = clientes.filter(c => c.activo !== false && !c.fecha_termino_relacion)
  const clientesCompletos = globalClientes.detalle.filter(d => d.score >= 80)
  const radarData = items.map(i => ({ subject: `Ítem ${i.num}`, value: Math.round(i.score), fullMark: 100 }))
  const barData   = items.map(i => ({ name: `Ítem ${i.num}`, score: Math.round(i.score) }))

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl space-y-6">

      <ErrorBanner error={error} onClose={() => setError(null)} />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard de Cumplimiento</h1>
          <p className="text-gray-500 text-sm mt-1">
            {tenant
              ? `${tenant.nombre} — Tipo ${tenant.tipo_sujeto}`
              : isSuperAdmin ? 'Seleccione un sujeto obligado' : 'Cargando…'}
          </p>
        </div>

        {/* Selector superadmin */}
        {isSuperAdmin && (
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">🏢 Sujeto Obligado:</span>
            <select
              className="input-field w-72"
              value={tenantIdSel}
              onChange={e => setTenantIdSel(e.target.value)}
            >
              <option value="">— Seleccione —</option>
              {allTenants.map(t => (
                <option key={t.id} value={t.id}>{t.nombre} (Tipo {t.tipo_sujeto})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Sin tenant */}
      {!tenant && (
        <div className="card py-16 text-center text-gray-400">
          <p className="text-5xl mb-4">📊</p>
          <p className="text-lg font-medium text-gray-500">
            {isSuperAdmin ? 'Seleccione un sujeto obligado para ver su nivel de cumplimiento.' : 'Cargando información…'}
          </p>
        </div>
      )}

      {tenant && loading && (
        <div className="card py-12 text-center text-gray-400">Calculando cumplimiento…</div>
      )}

      {tenant && !loading && (
        <>
          {/* Gráficos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Velocímetro */}
            <div className="card flex flex-col items-center py-4">
              <p className="text-sm font-semibold text-gray-600 mb-2">Cumplimiento Global</p>
              <Velocimetro pct={scoreGlobal} />
              <div className="mt-2 text-center">
                <span className="text-sm font-semibold px-3 py-1 rounded-full"
                  style={{ background: colorPct(scoreGlobal) + '20', color: colorPct(scoreGlobal) }}>
                  {etiquetaGlobal}
                </span>
              </div>
            </div>

            {/* Radar */}
            <div className="card">
              <p className="text-sm font-semibold text-gray-600 mb-2">Radar por ítem</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="Cumplimiento" dataKey="value" stroke="#0a1247" fill="#0a1247" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Barras */}
            <div className="card">
              <p className="text-sm font-semibold text-gray-600 mb-2">Score por ítem</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} layout="vertical" margin={{ left: 5, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={44} />
                  <Tooltip formatter={v => [`${v}%`, 'Score']} />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={colorPct(entry.score)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ítems detallados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">Detalle por ítem</h2>
              <p className="text-xs text-gray-400">Haga clic en cada ítem para ver pendientes</p>
            </div>

            {/* Ítem 1 */}
            <ItemCard {...items[0]}>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-2">
                <p>
                  Clientes activos: <strong>{clientesActivos.length}</strong> ·
                  Calificación global de la cartera: <strong style={{ color: colorPct(scoreI1) }}>{scoreI1}/100</strong>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Adecuado (≥80)', n: globalClientes.distribucion.verde,    color: 'text-green-600' },
                    { label: 'Parcial (50-79)', n: globalClientes.distribucion.amarillo, color: 'text-yellow-600' },
                    { label: 'Crítico (<50)',   n: globalClientes.distribucion.rojo,     color: 'text-red-600' },
                  ].map(f => (
                    <div key={f.label} className="bg-white rounded-lg border border-gray-200 px-2 py-1.5 text-center">
                      <p className={`text-base font-bold ${f.color}`}>{f.n}</p>
                      <p className="text-gray-400">{f.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-gray-400">
                  Calificación por cliente = documentación presentada (checklist) 60% ·
                  información del expediente 25% · gestiones de cumplimiento (DD, listas, calificación de riesgo) 15%.
                  Es la misma calificación que aparece al consultar cada cliente en <strong>Gestión de Clientes</strong>.
                </p>
                {globalClientes.detalle.filter(d => d.score < 100).length > 10 && (
                  <p className="text-orange-500">
                    Mostrando 10 de {globalClientes.detalle.filter(d => d.score < 100).length} clientes con pendientes
                    · {clientesCompletos.length} con cumplimiento adecuado.
                  </p>
                )}
              </div>
            </ItemCard>

            {/* Ítem 2 — form manual */}
            <ItemCard {...items[1]}>
              <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600">Registrar capacitación anual del personal:</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded text-brand-600"
                    checked={fCapacitacion.completa}
                    onChange={e => setFCapacitacion(p => ({ ...p, completa: e.target.checked }))} />
                  <span className="text-sm text-gray-700">Capacitación anual ALA/CFT completada</span>
                </label>
                {fCapacitacion.completa && (
                  <div>
                    <label className="text-xs text-gray-500">Fecha de realización</label>
                    <input type="date" className="input-field mt-1"
                      value={fCapacitacion.fecha}
                      onChange={e => setFCapacitacion(p => ({ ...p, fecha: e.target.value }))} />
                  </div>
                )}
                <button onClick={guardarSeguimiento} disabled={saving}
                  className="btn-primary text-xs py-1.5 px-4">{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </ItemCard>

            {/* Ítem 3 */}
            <ItemCard {...items[2]}>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                <p>Tipo {tipoSujeto} · Vigencia máxima: <strong>{mesesValidezNorm} meses</strong></p>
                <p>Documentos vigentes: <strong className="text-green-600">{normVigentes}</strong> / {normativa.length}</p>
                <p className="text-gray-400">Se evalúa fecha de aprobación por Junta Directiva. Si no hay fecha JD se usa fecha de vigencia.</p>
              </div>
            </ItemCard>

            {/* Ítem 4 */}
            <ItemCard {...items[3]}>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                <p>Tipo {tipoSujeto} · Frecuencia SICVECA: <strong>cada {mesesFrecSicveca} meses</strong></p>
                {transacciones[0]?.periodo && <p>Último período: <strong>{transacciones[0].periodo}</strong></p>}
              </div>
            </ItemCard>

            {/* Ítem 5 — form manual */}
            <ItemCard {...items[4]}>
              <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600">Estado sistemas SUGEF / UIF:</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded text-brand-600"
                    checked={fSistemas.actualizado}
                    onChange={e => setFSistemas(p => ({ ...p, actualizado: e.target.checked }))} />
                  <span className="text-sm text-gray-700">Información en SUGEF y UIF está actualizada</span>
                </label>
                {fSistemas.actualizado && (
                  <div>
                    <label className="text-xs text-gray-500">Fecha de última actualización</label>
                    <input type="date" className="input-field mt-1"
                      value={fSistemas.fecha}
                      onChange={e => setFSistemas(p => ({ ...p, fecha: e.target.value }))} />
                  </div>
                )}
                <button onClick={guardarSeguimiento} disabled={saving}
                  className="btn-primary text-xs py-1.5 px-4">{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </ItemCard>

            {/* Ítem 6 */}
            <ItemCard {...items[5]}>
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                {informes[0]?.fecha_generacion
                  ? <p>Último informe: <strong>{new Date(informes[0].fecha_generacion).toLocaleDateString('es-CR')}</strong> ({mesesDesde(informes[0].fecha_generacion)} meses atrás)</p>
                  : <p>No hay informes generados.</p>}
                <p className="text-gray-400">≤6 meses = 100% · 6–12 meses = 50% · más de 12 meses = 0%</p>
                <p className="text-gray-400">Para generar un informe, vaya a <strong>Módulo 1 → Informes</strong>.</p>
              </div>
            </ItemCard>

            {/* Ítem 7 — Evaluación de Riesgo */}
            <ItemCard {...items[6]}>
              <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600">Fecha de la última Evaluación de Riesgo LC/FT/FPADM:</p>
                <div className="text-xs text-gray-500 bg-blue-50 rounded p-2">
                  <p>Vigencia según SUGEF 13-19 — Tipo {tipoSujeto}: <strong>{mesesVigenciaEval} meses</strong> ({mesesVigenciaEval === 12 ? 'anual' : 'cada 2 años'})</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Fecha de realización</label>
                  <input type="date" className="input-field mt-1"
                    value={fEvalRiesgo.fecha}
                    onChange={e => setFEvalRiesgo({ fecha: e.target.value })} />
                </div>
                {fEvalRiesgo.fecha && (
                  <p className="text-xs text-gray-500">
                    Realizada hace <strong>{mesesDesde(fEvalRiesgo.fecha)} meses</strong> — {scoreI7 === 100 ? <span className="text-green-600 font-semibold">Vigente ✓</span> : <span className="text-red-600 font-semibold">Vencida ✗</span>}
                  </p>
                )}
                <button onClick={guardarSeguimiento} disabled={saving}
                  className="btn-primary text-xs py-1.5 px-4">{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </ItemCard>

            {/* Ítem 8 — Informes ALA/CFT */}
            <ItemCard {...items[7]}>
              <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600">Fecha de elaboración de cada informe (vigencia máx: 12 meses — SUGEF 13-19):</p>
                {[
                  { key: 'labores',           label: 'Informe de Labores',    fecha: fInformes.labores },
                  { key: 'plan_trabajo',      label: 'Plan de Trabajo',       fecha: fInformes.plan_trabajo },
                  { key: 'plan_capacitacion', label: 'Plan de Capacitación',  fecha: fInformes.plan_capacitacion },
                ].map(inf => {
                  const m = inf.fecha ? mesesDesde(inf.fecha) : null
                  const vigente = m !== null && m <= 12
                  return (
                    <div key={inf.key}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-gray-600 font-medium">{inf.label}</label>
                        {m !== null && (
                          <span className={`text-xs font-semibold ${vigente ? 'text-green-600' : 'text-red-600'}`}>
                            {vigente ? `Vigente (${m} m)` : `Vencido (${m} m)`}
                          </span>
                        )}
                      </div>
                      <input type="date" className="input-field mt-1"
                        value={fInformes[inf.key]}
                        onChange={e => setFInformes(p => ({ ...p, [inf.key]: e.target.value }))} />
                    </div>
                  )
                })}
                <p className="text-xs text-gray-400">Informes vigentes: <strong>{informesVigentes}/3</strong> · Ir a <strong>Informes</strong> para generarlos.</p>
                <button onClick={guardarSeguimiento} disabled={saving}
                  className="btn-primary text-xs py-1.5 px-4">{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </ItemCard>
          </div>

          {/* Tabla de pesos */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">📋 Fórmula de cumplimiento global</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 uppercase">Ítem</th>
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 uppercase">Descripción</th>
                    <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-400 uppercase">Peso</th>
                    <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-400 uppercase">Score</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-400 uppercase">Aporte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(it => (
                    <tr key={it.num}>
                      <td className="py-2 pr-4 font-bold text-gray-700">#{it.num}</td>
                      <td className="py-2 pr-4 text-gray-600">{it.label}</td>
                      <td className="py-2 pr-4 text-right text-gray-500">{it.peso}%</td>
                      <td className="py-2 pr-4 text-right font-semibold" style={{ color: colorPct(it.score) }}>{Math.round(it.score)}%</td>
                      <td className="py-2 text-right font-bold text-gray-700">{((it.score * it.peso) / 100).toFixed(1)} pts</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={4} className="py-2 font-bold text-gray-800">Total cumplimiento global</td>
                    <td className="py-2 text-right font-bold text-lg" style={{ color: colorPct(scoreGlobal) }}>{scoreGlobal.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
