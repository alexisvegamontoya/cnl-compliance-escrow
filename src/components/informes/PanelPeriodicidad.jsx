/**
 * PanelPeriodicidad.jsx
 * Panel de estado de periodicidad de informes según Acuerdo SUGEF 13-19.
 * Muestra cuándo se generó cada informe por última vez, si está vencido,
 * y aplica penalización a la calificación global si hay retrasos.
 *
 * Periodicidad requerida:
 *   - Análisis Transaccional: mensual (máx. 30 días entre entregas)
 *   - Informe de Labores:     anual  (máx. 365 días, presentar a JD antes del 31 mar)
 *   - Plan de Trabajo:        anual  (máx. 365 días, aprobar antes del 31 ene)
 *   - Plan de Capacitación:   anual  (máx. 365 días, aprobar antes del 31 ene)
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

// Reglas de periodicidad según SUGEF 13-19
const REGLAS = {
  transaccional: {
    label:       'Análisis Transaccional',
    icono:       '📊',
    maxDias:     45,   // tolerancia: mes calendario + 15 días
    descripcion: 'Mensual — Acuerdo SUGEF 13-19, Art. 47',
    penalizacion: 15,  // puntos de penalización en calificación global
    alerta_dias:  10,  // avisar cuando faltan X días para vencer
  },
  labores: {
    label:       'Informe de Labores',
    icono:       '📋',
    maxDias:     365,
    descripcion: 'Anual — presentar a Junta Directiva antes del 31 de marzo',
    penalizacion: 10,
    alerta_dias:  30,
  },
  plan_trabajo: {
    label:       'Plan de Trabajo',
    icono:       '📅',
    maxDias:     365,
    descripcion: 'Anual — aprobar antes del 31 de enero',
    penalizacion: 10,
    alerta_dias:  30,
  },
  capacitacion: {
    label:       'Plan de Capacitación',
    icono:       '🎓',
    maxDias:     365,
    descripcion: 'Anual — aprobar antes del 31 de enero',
    penalizacion: 10,
    alerta_dias:  30,
  },
}

function diasDesde(fechaStr) {
  if (!fechaStr) return null
  const diff = Date.now() - new Date(fechaStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatFecha(fechaStr) {
  if (!fechaStr) return '—'
  return new Date(fechaStr).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Calcula la penalización total por informes vencidos
export function calcularPenalizacion(estados) {
  return Object.entries(estados).reduce((total, [tipo, estado]) => {
    const regla = REGLAS[tipo]
    if (!regla || !estado) return total
    const dias = diasDesde(estado.ultimo_generado)
    if (dias === null || dias > regla.maxDias) {
      return total + regla.penalizacion
    }
    return total
  }, 0)
}

export default function PanelPeriodicidad({ tenantId, onPenalizacion }) {
  const { isSuperAdmin } = useAuth()
  const [estados, setEstados] = useState({})
  const [loading, setLoading]  = useState(true)
  const [expandido, setExpandido] = useState(true)

  const cargar = useCallback(async () => {
    if (!tenantId) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('informes_generados')
        .select('tipo_informe, fecha_generacion')
        .eq('tenant_id', tenantId)
        .order('fecha_generacion', { ascending: false })

      if (error) throw error

      // Tomar el último de cada tipo
      const nuevos = {}
      for (const row of (data || [])) {
        if (!nuevos[row.tipo_informe]) {
          nuevos[row.tipo_informe] = { ultimo_generado: row.fecha_generacion }
        }
      }
      setEstados(nuevos)

      // Reportar penalización al componente padre
      const pen = calcularPenalizacion(nuevos)
      onPenalizacion?.(pen)
    } catch {
      // Tabla puede no existir aún — ignorar silenciosamente
    } finally {
      setLoading(false)
    }
  }, [tenantId, onPenalizacion])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return null

  const tipos = Object.keys(REGLAS)
  const vencidos = tipos.filter(t => {
    const e = estados[t]
    const dias = diasDesde(e?.ultimo_generado)
    return dias === null || dias > REGLAS[t].maxDias
  })
  const proximos = tipos.filter(t => {
    const e = estados[t]
    const dias = diasDesde(e?.ultimo_generado)
    if (dias === null) return false
    return dias <= REGLAS[t].maxDias && dias > REGLAS[t].maxDias - REGLAS[t].alerta_dias
  })

  const penTotal = calcularPenalizacion(estados)

  if (vencidos.length === 0 && proximos.length === 0) {
    return (
      <div className="card border border-green-200 bg-green-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-green-800 text-sm">Todos los informes al día</p>
            <p className="text-xs text-green-600">Los 4 informes requeridos por SUGEF 13-19 están dentro del plazo.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`card border-2 ${vencidos.length > 0 ? 'border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{vencidos.length > 0 ? '⚠️' : '🔔'}</span>
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              Periodicidad de Informes — SUGEF 13-19
            </p>
            <p className="text-xs text-gray-500">
              {vencidos.length > 0
                ? `${vencidos.length} informe(s) vencido(s) — penalización: -${penTotal} pts sobre calificación global`
                : `${proximos.length} informe(s) próximo(s) a vencer`
              }
            </p>
          </div>
        </div>
        <button onClick={() => setExpandido(e => !e)}
          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-2 py-1 rounded">
          {expandido ? 'Ocultar' : 'Ver detalle'}
        </button>
      </div>

      {expandido && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tipos.map(tipo => {
            const regla  = REGLAS[tipo]
            const estado = estados[tipo]
            const dias   = diasDesde(estado?.ultimo_generado)
            const vencido  = dias === null || dias > regla.maxDias
            const proximo  = !vencido && dias > regla.maxDias - regla.alerta_dias
            const diasRestan = dias !== null ? regla.maxDias - dias : null

            return (
              <div key={tipo} className={`rounded-xl p-3 border text-sm ${
                vencido  ? 'bg-red-100 border-red-300' :
                proximo  ? 'bg-orange-100 border-orange-300' :
                           'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-start justify-between gap-1 mb-1">
                  <span className="text-base">{regla.icono}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    vencido  ? 'bg-red-600 text-white' :
                    proximo  ? 'bg-orange-500 text-white' :
                               'bg-green-600 text-white'
                  }`}>
                    {vencido ? 'VENCIDO' : proximo ? 'PRÓXIMO' : 'AL DÍA'}
                  </span>
                </div>
                <p className="font-semibold text-gray-800 text-xs leading-tight mb-1">{regla.label}</p>
                <p className="text-xs text-gray-500 mb-1">{regla.descripcion}</p>
                <div className="text-xs">
                  <p className="text-gray-600">
                    Último: <span className="font-medium">{formatFecha(estado?.ultimo_generado)}</span>
                  </p>
                  {dias !== null && !vencido && (
                    <p className={`${proximo ? 'text-orange-700 font-semibold' : 'text-green-700'}`}>
                      Vence en {diasRestan} días
                    </p>
                  )}
                  {vencido && dias !== null && (
                    <p className="text-red-700 font-semibold">Venció hace {dias - regla.maxDias} días</p>
                  )}
                  {vencido && dias === null && (
                    <p className="text-red-700 font-semibold">Nunca generado</p>
                  )}
                  {vencido && (
                    <p className="text-red-600 text-xs mt-0.5">Penaliza -{regla.penalizacion} pts</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {penTotal > 0 && (
        <div className="mt-3 px-3 py-2 bg-red-100 border border-red-300 rounded-lg text-xs text-red-800">
          <strong>Impacto en calificación global:</strong> Los informes vencidos generan una penalización de <strong>-{penTotal} puntos</strong> sobre la calificación de cumplimiento del sujeto obligado. Genere los informes faltantes para restaurar la puntuación.
        </div>
      )}
    </div>
  )
}
