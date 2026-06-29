import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ── Datos del cuestionario ────────────────────────────────────────────────────
const BLOQUES = [
  { id: 1,  nombre: 'Donantes y origen de fondos',       factores: ['Donantes anónimos','Donantes de alto riesgo','Transferencias sin identificación'] },
  { id: 2,  nombre: 'Organizaciones beneficiarias',      factores: ['Beneficiarios en zonas de conflicto','Beneficiarios sin debida diligencia'] },
  { id: 3,  nombre: 'Personal interno y gobernanza',     factores: ['Personal sin capacitación ALA/CFT','Sin oficial de cumplimiento','Conflictos de interés'] },
  { id: 4,  nombre: 'Proveedores y terceros',            factores: ['Proveedores no verificados','Terceros en jurisdicciones de riesgo'] },
  { id: 5,  nombre: 'Gestión financiera y controles',    factores: ['Sin auditoría interna','Controles contables deficientes','Sin segregación de funciones'] },
  { id: 6,  nombre: 'Administración de fondos',          factores: ['Manejo de efectivo elevado','Cuentas en múltiples jurisdicciones'] },
  { id: 7,  nombre: 'Zona geográfica',                   factores: ['Operaciones en países de alto riesgo GAFI','Jurisdicciones no cooperantes'] },
  { id: 8,  nombre: 'Métodos de pago',                   factores: ['Uso de criptomonedas','Pagos en efectivo superiores al umbral','Uso de intermediarios'] },
  { id: 9,  nombre: 'Naturaleza del servicio',           factores: ['Servicios difíciles de monitorear','Alcance internacional amplio'] },
  { id: 10, nombre: 'Señales de alerta crítica',         factores: ['Transacciones inusuales sin justificación','Presión indebida sobre empleados'] },
]

const PREGUNTAS_BASE = [
  // Bloque 1
  { id: 1, bloque: 1, texto: '¿Se identifican y verifican todos los donantes conforme al Acuerdo SUGEF 12-10?', tipo: 'control' },
  { id: 2, bloque: 1, texto: '¿Existen procedimientos para rechazar donaciones de fuentes anónimas o sospechosas?', tipo: 'control' },
  { id: 3, bloque: 1, texto: '¿Se realizó algún donante de alto riesgo (PEP, jurisdicción GAFI) en el último año?', tipo: 'alerta', peso: 3 },
  // Bloque 2
  { id: 4, bloque: 2, texto: '¿Se realiza debida diligencia sobre las organizaciones beneficiarias antes de transferir fondos?', tipo: 'control' },
  { id: 5, bloque: 2, texto: '¿Existen beneficiarios en zonas con conflicto armado o designadas como de alto riesgo?', tipo: 'alerta', peso: 3 },
  // Bloque 3
  { id: 6, bloque: 3, texto: '¿El personal recibe capacitación ALA/CFT al menos una vez al año?', tipo: 'control' },
  { id: 7, bloque: 3, texto: '¿Existe un Oficial de Cumplimiento designado formalmente ante SUGEF?', tipo: 'control', peso: 2 },
  { id: 8, bloque: 3, texto: '¿Se han detectado conflictos de interés no declarados en el último período?', tipo: 'alerta' },
  // Bloque 4
  { id: 9, bloque: 4, texto: '¿Los proveedores y terceros son verificados en listas de sanciones antes de contratar?', tipo: 'control' },
  { id: 10, bloque: 4, texto: '¿Existen contratos activos con proveedores en jurisdicciones no cooperantes?', tipo: 'alerta', peso: 2 },
  // Bloque 5
  { id: 11, bloque: 5, texto: '¿Se realizan auditorías internas al menos anuales con revisión ALA/CFT?', tipo: 'control', peso: 2 },
  { id: 12, bloque: 5, texto: '¿Existe segregación de funciones en el manejo y aprobación de pagos?', tipo: 'control' },
  { id: 13, bloque: 5, texto: '¿Se han encontrado deficiencias contables sin subsanar en el último período?', tipo: 'alerta' },
  // Bloque 6
  { id: 14, bloque: 6, texto: '¿El uso de efectivo está limitado y documentado según la política interna?', tipo: 'control' },
  { id: 15, bloque: 6, texto: '¿Se operan cuentas en más de 3 jurisdicciones distintas?', tipo: 'alerta', peso: 2 },
  // Bloque 7
  { id: 16, bloque: 7, texto: '¿Se aplica debida diligencia reforzada para operaciones en países de lista GAFI?', tipo: 'control', peso: 2 },
  { id: 17, bloque: 7, texto: '¿La organización tiene presencia o transferencias activas en zonas de lista negra GAFI?', tipo: 'alerta', peso: 3 },
  // Bloque 8
  { id: 18, bloque: 8, texto: '¿Existe una política aprobada para el uso de métodos de pago alternativos (cripto, prepago)?', tipo: 'control' },
  { id: 19, bloque: 8, texto: '¿Se reciben o envían pagos en efectivo por encima del umbral SUGEF (₡1.800.000)?', tipo: 'alerta', peso: 2 },
  // Bloque 9
  { id: 20, bloque: 9, texto: '¿Los servicios ofrecidos tienen trazabilidad y documentación completa?', tipo: 'control' },
  { id: 21, bloque: 9, texto: '¿Algún servicio se ejecuta en el extranjero sin supervisión directa?', tipo: 'alerta' },
  // Bloque 10
  { id: 22, bloque: 10, texto: '¿Existe un canal de denuncia funcional y conocido por el personal?', tipo: 'control' },
  { id: 23, bloque: 10, texto: '¿Se han registrado transacciones inusuales sin explicación satisfactoria en los últimos 12 meses?', tipo: 'alerta', peso: 3 },
  { id: 24, bloque: 10, texto: '¿Se han reportado señales de presión indebida sobre empleados de cumplimiento?', tipo: 'alerta', peso: 3 },
]

// ── Cálculo de riesgo ─────────────────────────────────────────────────────────
// Control (SI → 0 riesgo, NO → peso riesgo)
// Alerta  (SI → peso riesgo, NO → 0)
function calcularRiesgo(respuestas) {
  let riesgoInherente = 0, riesgoResidual = 0, maxPosible = 0

  const porBloque = {}
  BLOQUES.forEach(b => { porBloque[b.id] = { ri: 0, rr: 0, max: 0 } })

  PREGUNTAS_BASE.forEach(p => {
    const peso = p.peso || 1
    maxPosible += peso
    porBloque[p.bloque].max += peso

    const respuesta = respuestas[p.id]
    if (respuesta === undefined || respuesta === null) return

    const siAplicaRiesgo = p.tipo === 'alerta' ? (respuesta === 'si') : (respuesta === 'no')
    const puntoRiesgo = siAplicaRiesgo ? peso : 0

    riesgoInherente += peso // máximo inherente
    porBloque[p.bloque].ri += peso

    riesgoResidual += puntoRiesgo
    porBloque[p.bloque].rr += puntoRiesgo
  })

  const pctResidual = maxPosible > 0 ? (riesgoResidual / maxPosible) * 100 : 0

  let nivelRiesgo
  if (pctResidual <= 30) nivelRiesgo = 'Bajo'
  else if (pctResidual <= 60) nivelRiesgo = 'Medio'
  else nivelRiesgo = 'Alto'

  return { riesgoInherente, riesgoResidual, maxPosible, pctResidual, nivelRiesgo, porBloque }
}

const COLORES_NIVEL = {
  Bajo:  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500'  },
  Medio: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  Alto:  { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500'    },
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function EvaluacionRiesgos() {
  const { tenant, profile, isAdmin, isSuperAdmin } = useAuth()
  const [evaluaciones, setEvaluaciones]   = useState([])
  const [loading, setLoading]             = useState(true)
  const [vista, setVista]                 = useState('listado') // 'listado' | 'nueva' | 'detalle'
  const [evalActiva, setEvalActiva]       = useState(null)
  const [respuestas, setRespuestas]       = useState({})
  const [bloqueActivo, setBloqueActivo]   = useState(1)
  const [guardando, setGuardando]         = useState(false)
  const [error, setError]                 = useState('')

  const cargar = useCallback(async () => {
    if (!tenant?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('evaluaciones')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
    setEvaluaciones(data || [])
    setLoading(false)
  }, [tenant?.id])

  useEffect(() => { cargar() }, [cargar])

  // ── Nueva evaluación ──────────────────────────────────────────────────────
  function iniciarNuevaEval() {
    setRespuestas({})
    setBloqueActivo(1)
    setEvalActiva(null)
    setVista('nueva')
    setError('')
  }

  function setRespuesta(pregId, valor) {
    setRespuestas(r => ({ ...r, [pregId]: valor }))
  }

  function preguntasDeBloque(bloqueId) {
    return PREGUNTAS_BASE.filter(p => p.bloque === bloqueId)
  }

  function bloquesRespondidos() {
    return BLOQUES.filter(b => {
      const pregs = preguntasDeBloque(b.id)
      return pregs.every(p => respuestas[p.id] !== undefined)
    }).length
  }

  async function guardarEvaluacion() {
    const totalPregs = PREGUNTAS_BASE.length
    const respondidas = Object.keys(respuestas).length
    if (respondidas < totalPregs) {
      setError(`Faltan ${totalPregs - respondidas} respuestas antes de guardar.`)
      return
    }
    setGuardando(true); setError('')
    try {
      const calc = calcularRiesgo(respuestas)
      const { data: eva, error: eErr } = await supabase.from('evaluaciones').insert({
        tenant_id:          tenant.id,
        evaluador_id:       profile?.id,
        estado:             'completada',
        riesgo_inherente:   calc.riesgoInherente,
        riesgo_residual:    calc.riesgoResidual,
        nivel_riesgo_final: calc.nivelRiesgo,
        porcentaje_riesgo:  Math.round(calc.pctResidual),
        observaciones_generales: '',
      }).select().single()
      if (eErr) throw eErr

      const filas = PREGUNTAS_BASE.map(p => ({
        evaluacion_id: eva.id,
        pregunta_id:   p.id,
        respuesta:     respuestas[p.id],
        observaciones: '',
      }))
      const { error: rErr } = await supabase.from('respuestas_evaluacion').insert(filas)
      if (rErr) throw rErr

      await cargar()
      setEvalActiva(eva)
      setVista('detalle')
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function abrirDetalle(eva) {
    const { data: resps } = await supabase
      .from('respuestas_evaluacion')
      .select('*')
      .eq('evaluacion_id', eva.id)
    const mapa = {}
    resps?.forEach(r => { mapa[r.pregunta_id] = r.respuesta })
    setRespuestas(mapa)
    setEvalActiva(eva)
    setBloqueActivo(1)
    setVista('detalle')
  }

  // ── Render: Listado ───────────────────────────────────────────────────────
  if (vista === 'listado') {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Evaluación de Riesgos LC/FT/FPADM</h1>
            <p className="text-sm text-gray-500 mt-0.5">{tenant?.nombre} · Metodología RISICAR — SUGEF 13-19</p>
          </div>
          <button onClick={iniciarNuevaEval}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors">
            <span>+</span> Nueva evaluación
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Cargando evaluaciones…</div>
        ) : evaluaciones.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📊</div>
            <div className="font-semibold text-lg">Sin evaluaciones registradas</div>
            <div className="text-sm mt-2">Inicie una nueva evaluación para generar su matriz de riesgo.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {evaluaciones.map(eva => {
              const colores = COLORES_NIVEL[eva.nivel_riesgo_final] || COLORES_NIVEL.Medio
              const fecha = new Date(eva.created_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
              return (
                <div key={eva.id}
                  onClick={() => abrirDetalle(eva)}
                  className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${colores.dot}`} />
                    <div>
                      <div className="font-semibold text-gray-900">Evaluación del {fecha}</div>
                      <div className="text-sm text-gray-500">Riesgo residual: {eva.porcentaje_riesgo}% · {eva.nivel_riesgo_final}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${colores.bg} ${colores.text}`}>
                      {eva.nivel_riesgo_final}
                    </span>
                    <span className="text-gray-300">›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Render: Nueva evaluación (cuestionario) ───────────────────────────────
  if (vista === 'nueva') {
    const pregsBloqueActivo = preguntasDeBloque(bloqueActivo)
    const bloqueObj = BLOQUES.find(b => b.id === bloqueActivo)
    const totalRespondidas = Object.keys(respuestas).length
    const pctProgreso = Math.round((totalRespondidas / PREGUNTAS_BASE.length) * 100)

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setVista('listado')} className="text-brand-600 hover:text-brand-800 text-sm font-medium">← Volver</button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Nueva evaluación de riesgos</h1>
        </div>

        {/* Progreso general */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-gray-700">Progreso del cuestionario</span>
            <span className="font-bold text-brand-600">{pctProgreso}% ({totalRespondidas}/{PREGUNTAS_BASE.length})</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className="h-2.5 rounded-full bg-brand-600 transition-all" style={{ width: `${pctProgreso}%` }} />
          </div>
        </div>

        <div className="flex gap-5">
          {/* Sidebar bloques */}
          <div className="w-52 flex-shrink-0 space-y-1">
            {BLOQUES.map(b => {
              const pregsB = preguntasDeBloque(b.id)
              const respB  = pregsB.filter(p => respuestas[p.id] !== undefined).length
              const completo = respB === pregsB.length
              return (
                <button key={b.id}
                  onClick={() => setBloqueActivo(b.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2
                    ${bloqueActivo === b.id ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                  <span className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold
                    ${completo ? 'bg-green-400 text-white' : bloqueActivo === b.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {completo ? '✓' : b.id}
                  </span>
                  <span className="truncate">{b.nombre}</span>
                </button>
              )
            })}
          </div>

          {/* Preguntas del bloque */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-brand-900 text-white px-5 py-3">
                <div className="text-xs text-brand-300 font-medium uppercase tracking-wide">Bloque {bloqueActivo}</div>
                <div className="font-bold text-sm">{bloqueObj?.nombre}</div>
              </div>
              <div className="divide-y divide-gray-100">
                {pregsBloqueActivo.map((p, i) => {
                  const resp = respuestas[p.id]
                  const esAlerta = p.tipo === 'alerta'
                  return (
                    <div key={p.id} className="px-5 py-4">
                      <div className="flex gap-2 items-start mb-3">
                        <span className={`flex-shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase
                          ${esAlerta ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                          {esAlerta ? 'Alerta' : 'Control'}
                        </span>
                        <p className="text-sm text-gray-800 leading-snug">{p.texto}</p>
                        {(p.peso || 1) > 1 && (
                          <span className="flex-shrink-0 ml-auto text-xs font-bold text-brand-500 bg-brand-50 px-2 py-0.5 rounded">×{p.peso}</span>
                        )}
                      </div>
                      <div className="flex gap-3">
                        {['si', 'no', 'na'].map(op => (
                          <button key={op}
                            onClick={() => setRespuesta(p.id, op)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase border transition-all
                              ${resp === op
                                ? op === 'si'
                                  ? 'bg-green-500 text-white border-green-500'
                                  : op === 'no'
                                  ? 'bg-red-500 text-white border-red-500'
                                  : 'bg-gray-400 text-white border-gray-400'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'}`}>
                            {op === 'na' ? 'N/A' : op === 'si' ? 'Sí' : 'No'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <button
                  disabled={bloqueActivo === 1}
                  onClick={() => setBloqueActivo(b => b - 1)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-brand-600 disabled:opacity-30">
                  ← Anterior
                </button>
                {bloqueActivo < BLOQUES.length ? (
                  <button onClick={() => setBloqueActivo(b => b + 1)}
                    className="px-4 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
                    Siguiente →
                  </button>
                ) : (
                  <button onClick={guardarEvaluacion} disabled={guardando}
                    className="px-5 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
                    {guardando ? 'Guardando...' : '✓ Finalizar evaluación'}
                  </button>
                )}
              </div>
            </div>
            {error && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Detalle / Resultados ──────────────────────────────────────────
  if (vista === 'detalle' && evalActiva) {
    const calc = calcularRiesgo(respuestas)
    const colores = COLORES_NIVEL[calc.nivelRiesgo] || COLORES_NIVEL.Medio
    const fechaEval = new Date(evalActiva.created_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setVista('listado')} className="text-brand-600 hover:text-brand-800 text-sm font-medium">← Volver al listado</button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Resultados de la evaluación</h1>
        </div>

        {/* Resumen ejecutivo */}
        <div className={`rounded-2xl border-2 ${colores.border} ${colores.bg} p-6 mb-6`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">{tenant?.nombre} · {fechaEval}</div>
              <div className={`text-4xl font-black ${colores.text}`}>Riesgo {calc.nivelRiesgo}</div>
              <div className="text-sm text-gray-600 mt-1">Puntaje residual: {calc.riesgoResidual} / {calc.maxPosible} puntos ({Math.round(calc.pctResidual)}%)</div>
            </div>
            <div className="text-right">
              <div className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl ${colores.bg} border ${colores.border}`}>
                <div className={`w-4 h-4 rounded-full ${colores.dot}`} />
                <span className={`text-2xl font-extrabold ${colores.text}`}>{Math.round(calc.pctResidual)}%</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">Índice de riesgo residual</div>
            </div>
          </div>

          {/* Escala de riesgo */}
          <div className="mt-5">
            <div className="relative h-3 rounded-full overflow-hidden flex">
              <div className="flex-1 bg-green-400" />
              <div className="flex-1 bg-yellow-400" />
              <div className="flex-1 bg-red-400" />
            </div>
            <div className="relative -mt-3">
              <div className="absolute h-5 w-1 bg-gray-800 rounded-full transition-all" style={{ left: `${Math.min(Math.round(calc.pctResidual), 99)}%`, transform: 'translateX(-50%)' }} />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-4">
              <span>Bajo (0–30%)</span>
              <span>Medio (31–60%)</span>
              <span>Alto (61–100%)</span>
            </div>
          </div>
        </div>

        {/* Riesgo por bloque */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Riesgo por bloque temático</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {BLOQUES.map(b => {
              const pb = calc.porBloque[b.id]
              const pct = pb.max > 0 ? Math.round((pb.rr / pb.max) * 100) : 0
              let nivel, color
              if (pct <= 30) { nivel = 'Bajo'; color = 'bg-green-500' }
              else if (pct <= 60) { nivel = 'Medio'; color = 'bg-yellow-500' }
              else { nivel = 'Alto'; color = 'bg-red-500' }
              return (
                <div key={b.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{b.id}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700 truncate">{b.nombre}</div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-gray-600">{pct}%</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold
                      ${nivel === 'Bajo' ? 'bg-green-100 text-green-700' : nivel === 'Medio' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {nivel}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Respuestas por bloque */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Detalle de respuestas</h2>
            <div className="flex gap-1">
              {BLOQUES.map(b => (
                <button key={b.id} onClick={() => setBloqueActivo(b.id)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors
                    ${bloqueActivo === b.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {b.id}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {preguntasDeBloque(bloqueActivo).map(p => {
              const resp = respuestas[p.id]
              const esAlerta = p.tipo === 'alerta'
              const esRiesgo = (esAlerta && resp === 'si') || (!esAlerta && resp === 'no')
              return (
                <div key={p.id} className={`px-5 py-3 flex items-start gap-3 ${esRiesgo ? 'bg-red-50' : ''}`}>
                  <div className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${resp === 'si' ? 'bg-green-100 text-green-600' : resp === 'no' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                    {resp === 'si' ? '✓' : resp === 'no' ? '✗' : '—'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{p.texto}</p>
                    <div className="flex gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase
                        ${esAlerta ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                        {esAlerta ? 'Alerta' : 'Control'}
                      </span>
                      {esRiesgo && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-red-100 text-red-600">⚠ Contribuye al riesgo</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return null
}
