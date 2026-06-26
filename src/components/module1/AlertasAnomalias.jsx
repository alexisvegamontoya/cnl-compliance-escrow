import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

// Países de alto riesgo según GAFI (lista negra y gris prioritaria)
const PAISES_ALTO_RIESGO = [
  'KP', // Corea del Norte
  'IR', // Irán
  'MM', // Myanmar
  'SY', // Siria
  'RU', // Rusia
  'BY', // Bielorrusia
  'SD', // Sudán
  'SS', // Sudán del Sur
  'YE', // Yemen
  'SO', // Somalia
  'LY', // Libia
  'HT', // Haití
  'PA', // Panamá (lista gris GAFI)
  'PH', // Filipinas
  'NG', // Nigeria
  'VN', // Vietnam
]

const PAISES_NOMBRES = {
  KP: 'Corea del Norte', IR: 'Irán', MM: 'Myanmar', SY: 'Siria',
  RU: 'Rusia', BY: 'Bielorrusia', SD: 'Sudán', SS: 'Sudán del Sur',
  YE: 'Yemen', SO: 'Somalia', LY: 'Libia', HT: 'Haití',
  PA: 'Panamá', PH: 'Filipinas', NG: 'Nigeria', VN: 'Vietnam',
}

function getNombre(t) {
  return t.nombre_empresa || `${t.nombre_cliente || ''} ${t.primer_apellido || ''}`.trim() || t.numero_identificacion
}

export default function AlertasAnomalias({ periodo, onCount }) {
  const { tenant } = useAuth()
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading]   = useState(true)
  const [expandida, setExpandida] = useState(true)

  const cargar = useCallback(async () => {
    if (!tenant || !periodo) return
    setLoading(true)

    const desde = periodo + '-01'
    const hasta = periodo + '-31'

    const { data: txns } = await supabase
      .from('transacciones')
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('periodo', desde)
      .lte('periodo', hasta)

    if (!txns || txns.length === 0) {
      setAlertas([])
      onCount?.(0)
      setLoading(false)
      return
    }

    const umbral = Number(tenant.monto_minimo_usd) || 10000
    const lista = []

    // ─── 1. Montos sobre umbral ───────────────────────────────────────────
    txns
      .filter(t => Number(t.monto_movimiento) >= umbral)
      .forEach(t => {
        lista.push({
          nivel: 'rojo',
          tipo: 'Monto sobre umbral SUGEF',
          icono: '🔴',
          mensaje: `${getNombre(t)} — USD ${Number(t.monto_movimiento).toLocaleString('es-CR')} ≥ umbral USD ${umbral.toLocaleString('es-CR')}`,
          detalle: 'Esta transacción supera el monto mínimo de reporte obligatorio según Ley 7786.',
          ref: t.id,
        })
      })

    // ─── 2. Países de alto riesgo GAFI ───────────────────────────────────
    txns.forEach(t => {
      const origen  = (t.pais_origen_recursos  || '').toUpperCase()
      const destino = (t.pais_destino_recursos || '').toUpperCase()
      if (PAISES_ALTO_RIESGO.includes(origen)) {
        lista.push({
          nivel: 'rojo',
          tipo: 'País de alto riesgo GAFI',
          icono: '🔴',
          mensaje: `${getNombre(t)} — origen: ${PAISES_NOMBRES[origen] || origen}`,
          detalle: 'Transacción proveniente de jurisdicción con deficiencias ALA/CFT según GAFI.',
          ref: t.id,
        })
      }
      if (PAISES_ALTO_RIESGO.includes(destino)) {
        lista.push({
          nivel: 'rojo',
          tipo: 'País de alto riesgo GAFI',
          icono: '🔴',
          mensaje: `${getNombre(t)} — destino: ${PAISES_NOMBRES[destino] || destino}`,
          detalle: 'Transacción hacia jurisdicción con deficiencias ALA/CFT según GAFI.',
          ref: t.id,
        })
      }
    })

    // ─── 3. Posible estructuración — monto redondo cercano al umbral ──────
    txns
      .filter(t => {
        const m = Number(t.monto_movimiento)
        return m > 0 && m % 500 === 0 && m >= umbral * 0.75 && m < umbral
      })
      .forEach(t => {
        lista.push({
          nivel: 'naranja',
          tipo: 'Posible estructuración',
          icono: '🟠',
          mensaje: `${getNombre(t)} — USD ${Number(t.monto_movimiento).toLocaleString('es-CR')} (${Math.round(Number(t.monto_movimiento) / umbral * 100)}% del umbral)`,
          detalle: 'Monto redondo ligeramente inferior al umbral. Evalúe si hay intención de evadir el reporte obligatorio.',
          ref: t.id,
        })
      })

    // ─── 4. Cliente frecuente (>2 transacciones en el período) ───────────
    const porCliente = {}
    txns.forEach(t => {
      const k = t.numero_identificacion
      if (!porCliente[k]) porCliente[k] = []
      porCliente[k].push(t)
    })
    Object.entries(porCliente)
      .filter(([, ts]) => ts.length > 2)
      .forEach(([idNum, ts]) => {
        const montoTotal = ts.reduce((s, t) => s + Number(t.monto_movimiento), 0)
        lista.push({
          nivel: 'naranja',
          tipo: 'Cliente frecuente',
          icono: '🟠',
          mensaje: `${getNombre(ts[0])} — ${ts.length} transacciones, total USD ${montoTotal.toLocaleString('es-CR')}`,
          detalle: 'Múltiples transacciones del mismo cliente en el período. Verifique si corresponde a operación múltiple o actividad inusual.',
          ref: idNum,
        })
      })

    // ─── 5. Transacción sin fecha ─────────────────────────────────────────
    txns
      .filter(t => !t.fecha_transaccion)
      .forEach(t => {
        lista.push({
          nivel: 'amarillo',
          tipo: 'Sin fecha de transacción',
          icono: '🟡',
          mensaje: `${getNombre(t)} — identificación: ${t.numero_identificacion}`,
          detalle: 'La fecha de transacción es requerida para el reporte SICVECA.',
          ref: t.id,
        })
      })

    // ─── 6. Sin origen de recursos ────────────────────────────────────────
    txns
      .filter(t => !t.origen_recursos || t.origen_recursos === 0)
      .filter(t => !t.pais_origen_recursos)
      .forEach(t => {
        lista.push({
          nivel: 'amarillo',
          tipo: 'Sin origen de recursos',
          icono: '🟡',
          mensaje: `${getNombre(t)} — monto: USD ${Number(t.monto_movimiento).toLocaleString('es-CR')}`,
          detalle: 'No se especificó el país de origen de los recursos. Requerido por debida diligencia ALA/CFT.',
          ref: t.id,
        })
      })

    setAlertas(lista)
    onCount?.(lista.length)
    setLoading(false)
  }, [tenant, periodo, onCount])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return (
    <div className="card animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-48 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-32" />
    </div>
  )

  const rojas    = alertas.filter(a => a.nivel === 'rojo')
  const naranjas = alertas.filter(a => a.nivel === 'naranja')
  const amarillas = alertas.filter(a => a.nivel === 'amarillo')

  if (alertas.length === 0) {
    return (
      <div className="card border border-green-200 bg-green-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-green-800">Sin alertas detectadas</p>
            <p className="text-sm text-green-600">
              No se identificaron anomalías en las transacciones del período {periodo}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`card border ${rojas.length > 0 ? 'border-red-200' : naranjas.length > 0 ? 'border-orange-200' : 'border-yellow-200'}`}>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{rojas.length > 0 ? '🚨' : '⚠️'}</span>
          <div>
            <h3 className="font-semibold text-gray-900">
              Alertas de cumplimiento ALA/CFT
            </h3>
            <p className="text-sm text-gray-500">
              {alertas.length} alerta{alertas.length !== 1 ? 's' : ''} en el período {periodo}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rojas.length > 0 && (
            <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
              {rojas.length} alta{rojas.length !== 1 ? 's' : ''}
            </span>
          )}
          {naranjas.length > 0 && (
            <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
              {naranjas.length} media{naranjas.length !== 1 ? 's' : ''}
            </span>
          )}
          {amarillas.length > 0 && (
            <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">
              {amarillas.length} baja{amarillas.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setExpandida(e => !e)}
            className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors"
          >
            {expandida ? 'Contraer' : 'Expandir'}
          </button>
        </div>
      </div>

      {/* Lista de alertas */}
      {expandida && (
        <div className="space-y-2 mt-4">
          {alertas.map((a, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 text-sm ${
                a.nivel === 'rojo'
                  ? 'bg-red-50 border-red-200'
                  : a.nivel === 'naranja'
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 text-base leading-5">{a.icono}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${
                    a.nivel === 'rojo' ? 'text-red-800'
                    : a.nivel === 'naranja' ? 'text-orange-800'
                    : 'text-yellow-800'
                  }`}>
                    {a.tipo}
                  </p>
                  <p className={`mt-0.5 ${
                    a.nivel === 'rojo' ? 'text-red-700'
                    : a.nivel === 'naranja' ? 'text-orange-700'
                    : 'text-yellow-700'
                  }`}>
                    {a.mensaje}
                  </p>
                  <p className={`mt-1 text-xs ${
                    a.nivel === 'rojo' ? 'text-red-500'
                    : a.nivel === 'naranja' ? 'text-orange-500'
                    : 'text-yellow-600'
                  }`}>
                    {a.detalle}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Las alertas se generan automáticamente según los criterios de la Ley 7786 y las guías GAFI.
        Documente en su expediente las acciones tomadas ante cada alerta.
      </p>
    </div>
  )
}
