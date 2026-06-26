import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  CRITERIOS_CLIENTE, CRITERIOS_GEO, CRITERIOS_PRODUCTOS, CRITERIOS_CANALES,
  OPCIONES, PAISES_RIESGO, PAISES_ALTO_RIESGO_FT,
  calcularScoreFactor, calcularScoreTotal, clasificar,
} from '../lib/metodologiaRiesgo'

// ------------------------------------
// Helpers UI
// ------------------------------------
const RIESGO_COLOR = {
  bajo:  { bg: 'bg-green-100',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700 border-green-200' },
  medio: { bg: 'bg-yellow-100', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  alto:  { bg: 'bg-red-100',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700 border-red-200' },
}

function RiesgoBadge({ nivel, score }) {
  if (!nivel) return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500">Sin calificar</span>
  const c = RIESGO_COLOR[nivel]
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${c.badge}`}>
      {nivel.toUpperCase()} {score != null ? `(${Number(score).toFixed(3)})` : ''}
    </span>
  )
}

function ScoreBar({ score, max = 3 }) {
  if (score == null) return null
  const pct = Math.min((score / max) * 100, 100)
  const color = score <= 1 ? 'bg-green-500' : score <= 2 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ------------------------------------
// Formulario de un factor de riesgo
// ------------------------------------
function FactorForm({ titulo, criterios, respuestas, onChange, tipo, esGeo = false, esONG = false }) {
  function renderSelect(criterio) {
    let opciones = OPCIONES[criterio.key] || OPCIONES['pais_riesgo']

    // Para criterios geográficos de país: mostrar lista de países
    if (esGeo && ['pais_origen', 'residencia', 'ubicacion_geo', 'casa_matriz'].includes(criterio.key)) {
      const listaPaises = esONG ? PAISES_RIESGO : PAISES_RIESGO
      const paisSeleccionado = respuestas[criterio.key + '_nombre'] || ''
      const riesgoPais = PAISES_RIESGO.find(p => p.pais === paisSeleccionado)?.riesgo

      return (
        <div key={criterio.key} className="space-y-1">
          <label className="text-sm text-gray-600">{criterio.label} <span className="text-gray-400">({(criterio.peso * 100).toFixed(0)}%)</span></label>
          <select
            className="input-field text-sm"
            value={paisSeleccionado}
            onChange={e => {
              const pais = e.target.value
              const riesgo = PAISES_RIESGO.find(p => p.pais === pais)?.riesgo || null
              // Para ONG verificar lista FT
              const esFT = esONG && PAISES_ALTO_RIESGO_FT.includes(pais)
              const valorFinal = riesgo || (esFT ? 3 : null)
              onChange(criterio.key + '_nombre', pais)
              onChange(criterio.key, valorFinal)
            }}
          >
            <option value="">— Seleccione país —</option>
            <option value="Nacional / Costa Rica">Nacional / Costa Rica (Bajo riesgo)</option>
            <optgroup label="Bajo riesgo (Basel AML Index 2023)">
              {PAISES_RIESGO.filter(p => p.riesgo === 1).map(p => (
                <option key={p.pais} value={p.pais}>{p.pais}</option>
              ))}
            </optgroup>
            <optgroup label="Riesgo Medio">
              {PAISES_RIESGO.filter(p => p.riesgo === 2).map(p => (
                <option key={p.pais} value={p.pais}>{p.pais}</option>
              ))}
            </optgroup>
            <optgroup label="Alto Riesgo (GAFI / Basel)">
              {PAISES_RIESGO.filter(p => p.riesgo === 3).map(p => (
                <option key={p.pais} value={p.pais}>{p.pais}</option>
              ))}
            </optgroup>
          </select>
          {riesgoPais && (
            <p className={`text-xs font-medium ${riesgoPais === 1 ? 'text-green-600' : riesgoPais === 2 ? 'text-yellow-600' : 'text-red-600'}`}>
              {riesgoPais === 1 ? '🟢 Bajo riesgo' : riesgoPais === 2 ? '🟡 Riesgo medio' : '🔴 Alto riesgo (GAFI)'}
              {esONG && PAISES_ALTO_RIESGO_FT.includes(paisSeleccionado) && ' — ⚠ Lista FT'}
            </p>
          )}
        </div>
      )
    }

    return (
      <div key={criterio.key} className="space-y-1">
        <label className="text-sm text-gray-600">{criterio.label} <span className="text-gray-400">({(criterio.peso * 100).toFixed(0)}%)</span></label>
        <select
          className="input-field text-sm"
          value={respuestas[criterio.key] || ''}
          onChange={e => onChange(criterio.key, e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">— Seleccione —</option>
          {opciones.map(o => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>
        {respuestas[criterio.key] && (
          <div className="flex items-center gap-2">
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${respuestas[criterio.key] <= 1 ? 'bg-green-400' : respuestas[criterio.key] <= 2 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${(respuestas[criterio.key] / 3) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-8">{respuestas[criterio.key]}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">{titulo}</h3>
      <div className="grid grid-cols-1 gap-4">
        {criterios.map(c => renderSelect(c))}
      </div>
    </div>
  )
}

// ------------------------------------
// Historial de calificaciones de un cliente
// ------------------------------------
function HistorialCalificaciones({ clienteId }) {
  const [historial, setHistorial] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clienteId) return
    supabase.from('calificaciones_riesgo')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setHistorial(data || []); setLoading(false) })
  }, [clienteId])

  if (loading) return <p className="text-sm text-gray-400">Cargando historial…</p>
  if (!historial.length) return <p className="text-sm text-gray-400">Sin calificaciones previas</p>

  return (
    <div className="space-y-2">
      {historial.map((h, i) => (
        <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${i === 0 ? 'border-brand-200 bg-brand-50' : 'border-gray-100 bg-gray-50'}`}>
          <div className="flex-1">
            <span className="font-medium text-gray-700">{new Date(h.fecha_calificacion).toLocaleDateString('es-CR')}</span>
            {i === 0 && <span className="ml-2 text-xs text-brand-600 font-medium">Vigente</span>}
          </div>
          <RiesgoBadge nivel={h.calificacion_manual || h.calificacion} score={h.score_total} />
          {h.calificacion_manual && h.calificacion_manual !== h.calificacion && (
            <span className="text-xs text-orange-600 font-medium">Modificado</span>
          )}
          {h.observaciones && (
            <span className="text-xs text-gray-400 max-w-xs truncate" title={h.observaciones}>💬 {h.observaciones}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ------------------------------------
// PÁGINA PRINCIPAL
// ------------------------------------
export default function CalificacionRiesgo() {
  const { tenant, profile, isSuperAdmin } = useAuth()
  const isONG = Number(tenant?.clase_dato) === 42

  const [clientes, setClientes] = useState([])
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState(tenant?.id || '')
  const [clienteId, setClienteId] = useState('')
  const [clienteActual, setClienteActual] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('calificar') // calificar | historial | dashboard

  // Tipo de persona
  const [tipoPersona, setTipoPersona] = useState('fisica')

  // Respuestas por factor
  const [respCliente, setRespCliente] = useState({})
  const [respGeo, setRespGeo] = useState({})
  const [respProductos, setRespProductos] = useState({})
  const [respCanales, setRespCanales] = useState({})

  // Override y notas
  const [calificacionManual, setCalificacionManual] = useState('')
  const [observaciones, setObservaciones] = useState('')

  // Dashboard stats
  const [stats, setStats] = useState(null)
  const [sinCalificar, setSinCalificar] = useState([])
  const [ultimasCalif, setUltimasCalif] = useState([])

  // Cargar tenants si superadmin
  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('tenants').select('id, nombre, clase_dato').order('nombre')
        .then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  // Cargar clientes del tenant seleccionado
  const tenantEfectivo = isSuperAdmin
    ? (tenants.find(t => t.id === tenantId) || tenant)
    : tenant

  const loadClientes = useCallback(async () => {
    const tid = isSuperAdmin ? tenantId : tenant?.id
    if (!tid) return
    const { data } = await supabase.from('clientes')
      .select('id, numero_identificacion, nombre_cliente, primer_apellido, nombre_empresa, tipo_identificacion, calificacion_riesgo, nacionalidad, pais_ubicacion')
      .eq('tenant_id', tid)
      .order('nombre_cliente', { nullsFirst: false })
    setClientes(data || [])
  }, [isSuperAdmin, tenantId, tenant?.id])

  useEffect(() => { loadClientes() }, [loadClientes])

  // Cargar estadísticas dashboard
  const loadStats = useCallback(async () => {
    const tid = isSuperAdmin ? tenantId : tenant?.id
    if (!tid) return
    const { data: allClientes } = await supabase.from('clientes')
      .select('id, calificacion_riesgo')
      .eq('tenant_id', tid)
    const { data: recientes } = await supabase.from('calificaciones_riesgo')
      .select('*, clientes(nombre_cliente, primer_apellido, nombre_empresa, numero_identificacion)')
      .eq('tenant_id', tid)
      .eq('vigente', true)
      .order('created_at', { ascending: false })
      .limit(20)
    const calificados = new Set((recientes || []).map(r => r.cliente_id))
    const todos = allClientes || []
    setStats({
      total: todos.length,
      alto: todos.filter(c => c.calificacion_riesgo === 'alto').length,
      medio: todos.filter(c => c.calificacion_riesgo === 'medio').length,
      bajo: todos.filter(c => c.calificacion_riesgo === 'bajo').length,
      sinCalif: todos.filter(c => !c.calificacion_riesgo).length,
    })
    setSinCalificar(todos.filter(c => !calificados.has(c.id)).slice(0, 10))
    setUltimasCalif(recientes || [])
  }, [isSuperAdmin, tenantId, tenant?.id])

  useEffect(() => { loadStats() }, [loadStats])

  // Cuando se selecciona un cliente
  function handleSelectCliente(id) {
    setClienteId(id)
    const c = clientes.find(x => x.id === id)
    setClienteActual(c)
    // Detectar tipo de persona
    const tipoId = Number(c?.tipo_identificacion)
    const esFisica = [1, 3, 5].includes(tipoId)
    setTipoPersona(esFisica ? 'fisica' : 'juridica')
    // Pre-llenar país si hay datos
    if (c?.nacionalidad || c?.pais_ubicacion) {
      const paisOrigen = c.nacionalidad || ''
      const paisRes = c.pais_ubicacion || ''
      const rOrg = PAISES_RIESGO.find(p => p.pais.toLowerCase().includes(paisOrigen.toLowerCase()))?.riesgo
      const rRes = PAISES_RIESGO.find(p => p.pais.toLowerCase().includes(paisRes.toLowerCase()))?.riesgo
      setRespGeo({
        pais_origen_nombre: paisOrigen, pais_origen: rOrg,
        residencia_nombre: paisRes, residencia: rRes,
      })
    } else {
      setRespGeo({})
    }
    // Pre-llenar PEP si aplica
    setRespCliente(c?.pep ? { pep: 3 } : {})
    setRespProductos({})
    setRespCanales({})
    setCalificacionManual('')
    setObservaciones('')
  }

  function setRespF(setFn, key, val) { setFn(prev => ({ ...prev, [key]: val })) }

  // Calcular scores en tiempo real
  const scoreCli = calcularScoreFactor(respCliente, CRITERIOS_CLIENTE[tipoPersona])
  const scoreGeo = calcularScoreFactor(respGeo, CRITERIOS_GEO[tipoPersona])
  const scoreProd = calcularScoreFactor(respProductos, CRITERIOS_PRODUCTOS[tipoPersona])
  const scoreCan = calcularScoreFactor(respCanales, CRITERIOS_CANALES[tipoPersona])
  const scoreTotal = calcularScoreTotal({ cliente: scoreCli, geo: scoreGeo, productos: scoreProd, canales: scoreCan }, tipoPersona)
  const calificacionAuto = clasificar(scoreTotal)
  const calificacionFinal = calificacionManual || calificacionAuto

  async function guardar() {
    if (!clienteId) { alert('Seleccione un cliente.'); return }
    if (!calificacionAuto && !calificacionManual) { alert('Complete al menos los factores principales.'); return }
    setSaving(true)
    try {
      // Marcar anteriores como no vigentes
      await supabase.from('calificaciones_riesgo')
        .update({ vigente: false })
        .eq('cliente_id', clienteId)

      // Insertar nueva calificación
      const { error } = await supabase.from('calificaciones_riesgo').insert({
        tenant_id: tenantEfectivo?.id,
        cliente_id: clienteId,
        tipo_persona: tipoPersona,
        resp_cliente: respCliente,
        resp_geo: respGeo,
        resp_productos: respProductos,
        resp_canales: respCanales,
        score_cliente: scoreCli,
        score_geo: scoreGeo,
        score_productos: scoreProd,
        score_canales: scoreCan,
        score_total: scoreTotal,
        calificacion: calificacionAuto,
        calificacion_manual: calificacionManual || null,
        observaciones: observaciones || null,
        calificador_id: profile?.id,
        fecha_calificacion: new Date().toISOString().split('T')[0],
        vigente: true,
      })
      if (error) throw error

      // Actualizar calificacion_riesgo y fecha_ultima_calificacion en clientes
      await supabase.from('clientes')
        .update({
          calificacion_riesgo: calificacionFinal,
          fecha_ultima_calificacion: new Date().toISOString().split('T')[0],
        })
        .eq('id', clienteId)

      alert('✅ Calificación guardada correctamente.')
      loadClientes()
      loadStats()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const nombreCliente = clienteActual
    ? (clienteActual.nombre_empresa || `${clienteActual.nombre_cliente || ''} ${clienteActual.primer_apellido || ''}`.trim())
    : ''

  return (
    <div className="p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calificación de Riesgo de Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">Metodología N06 — Basel AML Index 2023{isONG ? ' · Lista FT activa para ONG' : ''}</p>
        </div>
        <div className="flex gap-2">
          {['calificar', 'dashboard'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${tab === t ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'calificar' ? '📋 Calificar' : '📊 Dashboard'}
            </button>
          ))}
        </div>
      </div>

      {/* ======= DASHBOARD ======= */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Total clientes', val: stats.total, color: 'gray' },
                { label: 'Sin calificar', val: stats.sinCalif, color: 'blue' },
                { label: 'Riesgo Bajo', val: stats.bajo, color: 'green' },
                { label: 'Riesgo Medio', val: stats.medio, color: 'yellow' },
                { label: 'Riesgo Alto', val: stats.alto, color: 'red' },
              ].map(s => (
                <div key={s.label} className={`card text-center border-t-4 ${
                  s.color === 'red' ? 'border-red-400' : s.color === 'yellow' ? 'border-yellow-400' :
                  s.color === 'green' ? 'border-green-400' : s.color === 'blue' ? 'border-brand-400' : 'border-gray-200'
                }`}>
                  <p className="text-3xl font-bold text-gray-900">{s.val}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sin calificar */}
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">⚠ Pendientes de calificar</h3>
              {sinCalificar.length === 0
                ? <p className="text-sm text-green-600">✓ Todos los clientes están calificados</p>
                : sinCalificar.map(c => (
                    <button key={c.id} onClick={() => { setTab('calificar'); handleSelectCliente(c.id) }}
                      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-100 mb-2">
                      <span className="text-gray-400 text-sm font-mono">{c.numero_identificacion}</span>
                      <span className="text-sm text-gray-700 flex-1">{c.nombre_empresa || c.nombre_cliente}</span>
                      <span className="text-xs text-brand-600">Calificar →</span>
                    </button>
                  ))
              }
            </div>

            {/* Últimas calificaciones */}
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">🕐 Últimas calificaciones</h3>
              {ultimasCalif.length === 0
                ? <p className="text-sm text-gray-400">Sin calificaciones registradas</p>
                : ultimasCalif.slice(0, 8).map(c => {
                    const nom = c.clientes?.nombre_empresa || c.clientes?.nombre_cliente || c.clientes?.numero_identificacion
                    return (
                      <div key={c.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <span className="text-xs text-gray-400 w-20 flex-shrink-0">{new Date(c.fecha_calificacion).toLocaleDateString('es-CR')}</span>
                        <span className="text-sm text-gray-700 flex-1 truncate">{nom}</span>
                        <RiesgoBadge nivel={c.calificacion_manual || c.calificacion} score={c.score_total} />
                      </div>
                    )
                  })
              }
            </div>
          </div>

          {/* Leyenda metodología */}
          <div className="card bg-gray-50 text-sm text-gray-600 space-y-2">
            <p className="font-semibold text-gray-800">📌 Escala de calificación — N06 Metodología de Riesgo</p>
            <div className="flex gap-6">
              <span>🟢 <strong>Bajo:</strong> Score 0.00–1.00</span>
              <span>🟡 <strong>Medio:</strong> Score 1.01–2.00</span>
              <span>🔴 <strong>Alto:</strong> Score 2.01–3.00</span>
            </div>
            <p className="text-xs text-gray-400">Fuente: Basel AML Index 2023. Lista de países se actualiza anualmente. Para ONG se aplica además la lista GAFI de jurisdicciones bajo monitoreo (FT).</p>
          </div>
        </div>
      )}

      {/* ======= FORMULARIO DE CALIFICACIÓN ======= */}
      {tab === 'calificar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: selector + resumen */}
          <div className="space-y-4">
            {/* Selector sujeto obligado (superadmin) */}
            {isSuperAdmin && (
              <div className="card">
                <label className="label">Sujeto Obligado</label>
                <select className="input-field" value={tenantId} onChange={e => { setTenantId(e.target.value); setClienteId(''); setClienteActual(null) }}>
                  <option value="">— Seleccione —</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
            )}

            {/* Selector cliente */}
            <div className="card">
              <label className="label">Cliente a calificar *</label>
              <select className="input-field" value={clienteId} onChange={e => handleSelectCliente(e.target.value)}>
                <option value="">— Seleccione cliente —</option>
                {clientes.map(c => {
                  const nom = c.nombre_empresa || `${c.nombre_cliente || ''} ${c.primer_apellido || ''}`.trim()
                  return <option key={c.id} value={c.id}>{nom} · {c.numero_identificacion}</option>
                })}
              </select>

              {clienteActual && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-1 text-sm">
                  <p className="font-medium text-gray-900">{nombreCliente}</p>
                  <p className="text-gray-500">{clienteActual.numero_identificacion}</p>
                  {clienteActual.calificacion_riesgo && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-gray-500 text-xs">Actual:</span>
                      <RiesgoBadge nivel={clienteActual.calificacion_riesgo} />
                    </div>
                  )}
                  {/* Tipo de persona */}
                  <div className="flex gap-2 mt-2">
                    {['fisica', 'juridica'].map(tp => (
                      <button key={tp}
                        onClick={() => setTipoPersona(tp)}
                        className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${tipoPersona === tp ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>
                        {tp === 'fisica' ? '👤 Persona Física' : '🏢 Persona Jurídica'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Resumen de scores */}
            {clienteActual && (
              <div className="card space-y-3">
                <h3 className="font-semibold text-gray-900 text-sm">Resultado en tiempo real</h3>

                {[
                  { label: 'Factor Cliente', score: scoreCli, peso: tipoPersona === 'fisica' ? 60 : 50 },
                  { label: 'Zona Geográfica', score: scoreGeo, peso: tipoPersona === 'fisica' ? 40 : 15 },
                  { label: 'Productos', score: scoreProd, peso: tipoPersona === 'fisica' ? 0 : 20 },
                  { label: 'Canales de Distribución', score: scoreCan, peso: tipoPersona === 'fisica' ? 0 : 15 },
                ].map(f => (
                  <div key={f.label} className={f.peso === 0 ? 'opacity-40' : ''}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{f.label} ({f.peso}%)</span>
                      <span className="font-mono font-medium text-gray-700">{f.score != null ? f.score.toFixed(3) : '—'}</span>
                    </div>
                    <ScoreBar score={f.score} />
                  </div>
                ))}

                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">Score Consolidado</span>
                    <span className="font-bold font-mono text-lg text-gray-900">{scoreTotal != null ? scoreTotal.toFixed(3) : '—'}</span>
                  </div>
                  <ScoreBar score={scoreTotal} />
                  {calificacionAuto && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Calificación automática:</span>
                      <RiesgoBadge nivel={calificacionAuto} />
                    </div>
                  )}
                </div>

                {/* Override manual */}
                <div className="border-t pt-3 space-y-2">
                  <label className="text-xs font-medium text-gray-600">Calificación manual (oficial de cumplimiento)</label>
                  <div className="flex gap-2">
                    {['bajo', 'medio', 'alto'].map(n => (
                      <button key={n}
                        onClick={() => setCalificacionManual(prev => prev === n ? '' : n)}
                        className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${calificacionManual === n
                          ? n === 'bajo' ? 'bg-green-500 text-white border-green-500'
                          : n === 'medio' ? 'bg-yellow-500 text-white border-yellow-500'
                          : 'bg-red-500 text-white border-red-500'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}>
                        {n.charAt(0).toUpperCase() + n.slice(1)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="input-field text-sm h-20"
                    placeholder="Observaciones o justificación del oficial…"
                    value={observaciones}
                    onChange={e => setObservaciones(e.target.value)}
                  />
                  <button onClick={guardar} disabled={saving || !clienteId}
                    className="btn-primary w-full">
                    {saving ? 'Guardando…' : '💾 Guardar calificación'}
                  </button>
                </div>
              </div>
            )}

            {/* Historial */}
            {clienteActual && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 text-sm mb-3">🕐 Historial — {nombreCliente}</h3>
                <HistorialCalificaciones clienteId={clienteId} />
              </div>
            )}
          </div>

          {/* Columna derecha: formularios de factores */}
          <div className="lg:col-span-2 space-y-4">
            {!clienteActual ? (
              <div className="card py-16 text-center text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-medium">Seleccione un cliente para iniciar la calificación</p>
                <p className="text-sm mt-1">La calificación se basa en la Metodología N06 del sujeto obligado</p>
              </div>
            ) : (
              <>
                {/* Factor Cliente */}
                <FactorForm
                  titulo={`Factor Cliente — ${tipoPersona === 'fisica' ? 'Persona Física' : 'Persona Jurídica'} (${tipoPersona === 'fisica' ? '60' : '50'}%)`}
                  criterios={CRITERIOS_CLIENTE[tipoPersona]}
                  respuestas={respCliente}
                  onChange={(k, v) => setRespF(setRespCliente, k, v)}
                  tipo={tipoPersona}
                  esONG={isONG}
                />

                {/* Factor Zona Geográfica */}
                <FactorForm
                  titulo={`Factor Zona Geográfica (${tipoPersona === 'fisica' ? '40' : '15'}%)`}
                  criterios={CRITERIOS_GEO[tipoPersona]}
                  respuestas={respGeo}
                  onChange={(k, v) => setRespF(setRespGeo, k, v)}
                  tipo={tipoPersona}
                  esGeo={true}
                  esONG={isONG}
                />

                {/* Factor Productos */}
                <FactorForm
                  titulo={`Factor Productos / Servicios (${tipoPersona === 'fisica' ? '0' : '20'}%)`}
                  criterios={CRITERIOS_PRODUCTOS[tipoPersona]}
                  respuestas={respProductos}
                  onChange={(k, v) => setRespF(setRespProductos, k, v)}
                  tipo={tipoPersona}
                  esONG={isONG}
                />

                {/* Factor Canales */}
                <FactorForm
                  titulo={`Factor Canales de Distribución (${tipoPersona === 'fisica' ? '0' : '15'}%)`}
                  criterios={CRITERIOS_CANALES[tipoPersona]}
                  respuestas={respCanales}
                  onChange={(k, v) => setRespF(setRespCanales, k, v)}
                  tipo={tipoPersona}
                  esONG={isONG}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
