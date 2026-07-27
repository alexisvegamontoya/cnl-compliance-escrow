import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../lib/apiFetch'

const CATEGORIAS = [
  {
    id: 'debida_diligencia',
    label: 'Debida Diligencia del Cliente',
    icon: '👤',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    colorActive: 'bg-blue-600 text-white border-blue-600',
    preguntas: [
      '¿Qué documentos se requieren para identificar a un cliente persona física?',
      '¿Qué información mínima debe contener el expediente de un cliente persona jurídica?',
      '¿Cuándo se debe actualizar el expediente de un cliente según su nivel de riesgo?',
      '¿Qué es la debida diligencia ampliada y en qué casos es obligatoria?',
      '¿Cómo se identifica al beneficiario final de una persona jurídica?',
    ],
  },
  {
    id: 'pep',
    label: 'Personas Expuestas Políticamente (PEPs)',
    icon: '🏛️',
    color: 'bg-purple-50 border-purple-200 text-purple-800',
    colorActive: 'bg-purple-600 text-white border-purple-600',
    preguntas: [
      '¿Cómo se define un PEP según el Acuerdo SUGEF 13-19?',
      '¿Qué medidas adicionales se deben aplicar a un cliente PEP?',
      '¿Por cuánto tiempo se considera PEP a una persona después de dejar el cargo?',
      '¿Quién debe aprobar la vinculación de un cliente identificado como PEP?',
      '¿Los familiares de un PEP también son considerados PEP?',
    ],
  },
  {
    id: 'ros',
    label: 'Reporte de Operación Sospechosa (ROS)',
    icon: '🚨',
    color: 'bg-red-50 border-red-200 text-red-800',
    colorActive: 'bg-red-600 text-white border-red-600',
    preguntas: [
      '¿En qué plazo debe enviarse el ROS al ICD tras detectar la operación?',
      '¿Qué información obligatoria debe contener el ROS?',
      '¿Se puede informar al cliente que fue sujeto de un ROS?',
      '¿Se debe enviar el ROS aunque la transacción no se haya completado?',
      '¿Cuáles son las señales de alerta más comunes para presentar un ROS?',
    ],
  },
  {
    id: 'transacciones',
    label: 'Monitoreo de Transacciones',
    icon: '💰',
    color: 'bg-green-50 border-green-200 text-green-800',
    colorActive: 'bg-green-600 text-white border-green-600',
    preguntas: [
      '¿Cuál es el umbral de transacciones en efectivo que debe registrarse?',
      '¿Qué es el perfil transaccional de un cliente y cómo se construye?',
      '¿Por cuánto tiempo deben conservarse los registros de transacciones?',
      '¿Cómo se detecta una transacción fraccionada o inusual?',
    ],
  },
  {
    id: 'oficial',
    label: 'Oficial de Cumplimiento',
    icon: '⚖️',
    color: 'bg-orange-50 border-orange-200 text-orange-800',
    colorActive: 'bg-orange-600 text-white border-orange-600',
    preguntas: [
      '¿Cuáles son las funciones del Oficial de Cumplimiento según el Acuerdo SUGEF 13-19?',
      '¿Qué requisitos debe cumplir la persona designada como Oficial de Cumplimiento?',
      '¿Con qué frecuencia debe el Oficial presentar informes a la Junta Directiva?',
      '¿Qué debe incluir el informe del Oficial de Cumplimiento a SUGEF?',
      '¿Qué ocurre si cambia el Oficial de Cumplimiento? ¿Hay que notificar a SUGEF?',
    ],
  },
  {
    id: 'evaluacion_riesgos',
    label: 'Evaluación de Riesgos Institucional',
    icon: '📊',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    colorActive: 'bg-yellow-600 text-white border-yellow-600',
    preguntas: [
      '¿Con qué frecuencia debe actualizarse la evaluación de riesgos institucional?',
      '¿Qué factores deben considerarse en la evaluación de riesgos LC/FT?',
      '¿Qué es el riesgo inherente y el riesgo residual en ALA/CFT?',
      '¿Quién debe aprobar la evaluación de riesgos institucional?',
    ],
  },
  {
    id: 'capacitacion',
    label: 'Capacitación ALA/CFT',
    icon: '📚',
    color: 'bg-teal-50 border-teal-200 text-teal-800',
    colorActive: 'bg-teal-600 text-white border-teal-600',
    preguntas: [
      '¿Con qué frecuencia debe capacitarse al personal en materia ALA/CFT?',
      '¿Qué temas mínimos debe cubrir la capacitación ALA/CFT?',
      '¿Qué registros deben mantenerse sobre las capacitaciones realizadas?',
      '¿Todo el personal debe recibir la misma capacitación en ALA/CFT?',
    ],
  },
  {
    id: 'formularios',
    label: 'Formularios y Herramientas',
    icon: '📋',
    color: 'bg-gray-50 border-gray-200 text-gray-700',
    colorActive: 'bg-gray-700 text-white border-gray-700',
    preguntas: [
      '¿Qué formulario se usa para el KYC de personas físicas en la plataforma?',
      '¿Cómo se completa el expediente de una persona jurídica en el sistema?',
      '¿Cómo se registra un ROS en la plataforma CNL?',
      '¿Cómo funciona la calificación de riesgo del cliente en el sistema?',
    ],
  },
]

function CitaHighlight({ texto }) {
  // Resalta referencias a artículos, leyes y acuerdos
  const partes = texto.split(/(Art(?:ículo)?\.?\s*\d+[\w\s\-bis]*|Ley\s+\d+|Acuerdo\s+SUGEF\s+[\d\-]+|Capítulo\s+[IVXivx]+)/g)
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-brand-100 text-brand-900 px-0.5 rounded font-semibold not-italic">
            {parte}
          </mark>
        ) : parte
      )}
    </>
  )
}

export default function ModuloIA() {
  const [categoriaId, setCategoriaId]   = useState(null)
  const [consulta, setConsulta]         = useState('')
  const [historial, setHistorial]       = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const bottomRef = useRef(null)

  const categoria = CATEGORIAS.find(c => c.id === categoriaId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historial, loading])

  async function enviarConsulta(texto) {
    const q = (texto || consulta).trim()
    if (!q) return
    if (!categoriaId) { setError('Seleccione una categoría antes de consultar.'); return }

    setError('')
    setConsulta('')
    setHistorial(h => [...h, { tipo: 'usuario', texto: q }])
    setLoading(true)

    try {
      const res = await apiFetch('/api/ai-compliance', {
        method: 'POST',
        body: JSON.stringify({ consulta: q, categoria: categoria?.label }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al consultar.')
      setHistorial(h => [...h, { tipo: 'ia', texto: data.respuesta }])
    } catch (err) {
      setHistorial(h => [...h, { tipo: 'ia', texto: `⚠️ ${err.message}`, esError: true }])
    } finally {
      setLoading(false)
    }
  }

  function handlePreguntaRapida(p) {
    setConsulta(p)
    enviarConsulta(p)
  }

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">

      {/* ── Panel izquierdo: categorías ── */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <div>
              <p className="font-bold text-gray-900 text-sm">Asistente Compliance</p>
              <p className="text-xs text-gray-400">Ley 7786 · SUGEF 13-19</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-2">
            Seleccione un tema
          </p>
          {CATEGORIAS.map(cat => (
            <button
              key={cat.id}
              onClick={() => { setCategoriaId(cat.id); setError('') }}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors text-sm ${
                categoriaId === cat.id
                  ? 'bg-brand-50 text-brand-900 font-semibold border-r-2 border-brand-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-base flex-shrink-0">{cat.icon}</span>
              <span className="leading-tight">{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400 leading-relaxed">
            Las respuestas se basan en documentos normativos oficiales. No reemplaza asesoría legal.
          </p>
        </div>
      </aside>

      {/* ── Panel derecho: chat ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Cabecera del tema */}
        <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
          {categoria ? (
            <>
              <span className="text-xl">{categoria.icon}</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{categoria.label}</p>
                <p className="text-xs text-gray-400">Ley 7786 · Acuerdo SUGEF 13-19 · Normativa interna</p>
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-sm">← Seleccione un tema para comenzar</p>
          )}
        </div>

        {/* Área del chat */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Estado inicial */}
          {historial.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
              {!categoriaId ? (
                <>
                  <p className="text-4xl">⚖️</p>
                  <p className="font-semibold text-gray-700">Asistente de Compliance ALA/CFT</p>
                  <p className="text-gray-400 text-sm max-w-xs">
                    Seleccione un tema en el panel izquierdo para consultar sobre la normativa específica.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {CATEGORIAS.slice(0, 4).map(cat => (
                      <button key={cat.id} onClick={() => setCategoriaId(cat.id)}
                        className={`text-xs border rounded-lg px-3 py-2 text-left transition-colors hover:shadow-sm ${cat.color}`}>
                        {cat.icon} {cat.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-3xl">{categoria.icon}</p>
                  <p className="font-semibold text-gray-700">Preguntas frecuentes — {categoria.label}</p>
                  <p className="text-gray-400 text-sm">Seleccione una pregunta o escriba su consulta abajo.</p>
                  <div className="w-full max-w-lg space-y-2 mt-2">
                    {categoria.preguntas.map((p, i) => (
                      <button key={i} onClick={() => handlePreguntaRapida(p)}
                        className="w-full text-left text-sm border border-gray-200 rounded-xl px-4 py-2.5 hover:bg-brand-50 hover:border-brand-300 transition-colors text-gray-700">
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Historial de mensajes */}
          {historial.map((msg, i) => (
            <div key={i} className={`flex ${msg.tipo === 'usuario' ? 'justify-end' : 'justify-start'}`}>
              {msg.tipo === 'ia' && (
                <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 mr-2">
                  IA
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.tipo === 'usuario'
                  ? 'bg-brand-700 text-white rounded-tr-sm'
                  : msg.esError
                    ? 'bg-red-50 border border-red-200 text-red-800 rounded-tl-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
              }`}>
                {msg.tipo === 'ia' && !msg.esError ? (
                  <div className="whitespace-pre-wrap">
                    <CitaHighlight texto={msg.texto} />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.texto}</p>
                )}
              </div>
            </div>
          ))}

          {/* Indicador de carga */}
          {loading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 mr-2">
                IA
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Preguntas rápidas inline (si ya hay historial) */}
        {historial.length > 0 && categoria && (
          <div className="px-6 py-2 border-t border-gray-100 bg-gray-50 overflow-x-auto">
            <div className="flex gap-2 whitespace-nowrap">
              <span className="text-xs text-gray-400 flex-shrink-0 self-center">Preguntas rápidas:</span>
              {categoria.preguntas.slice(0, 3).map((p, i) => (
                <button key={i} onClick={() => handlePreguntaRapida(p)} disabled={loading}
                  className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:bg-white hover:border-brand-300 hover:text-brand-700 transition-colors flex-shrink-0 disabled:opacity-40">
                  {p.length > 55 ? p.slice(0, 55) + '…' : p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input de consulta */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white">
          {error && (
            <p className="text-xs text-red-600 mb-2">⚠ {error}</p>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400 max-h-32"
                placeholder={categoriaId ? `Consulte sobre ${categoria?.label}…` : 'Primero seleccione un tema en el panel izquierdo…'}
                value={consulta}
                rows={2}
                disabled={!categoriaId || loading}
                onChange={e => setConsulta(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarConsulta() }
                }}
                maxLength={500}
              />
              <span className="absolute right-3 bottom-2 text-xs text-gray-300">{consulta.length}/500</span>
            </div>
            <button
              onClick={() => enviarConsulta()}
              disabled={!consulta.trim() || !categoriaId || loading}
              className="bg-brand-700 hover:bg-brand-800 text-white rounded-xl px-4 py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Presione Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </div>
    </div>
  )
}
