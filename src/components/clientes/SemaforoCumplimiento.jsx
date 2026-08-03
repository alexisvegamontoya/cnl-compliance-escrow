/**
 * SemaforoCumplimiento.jsx
 * Gráfica tipo semáforo + calificación de 1 a 100 del estado de cumplimiento.
 * Se usa por cliente (perfil) y de forma global por sujeto obligado (lista).
 */
import { semaforoDe } from '../../lib/checklistDocumental'

// ─── Semáforo de tres luces ───────────────────────────────────────────────────
function Semaforo({ activo, size = 'md' }) {
  const luces = [
    { id: 'rojo',     color: '#c31b26' },
    { id: 'amarillo', color: '#c89116' },
    { id: 'verde',    color: '#1f6d45' },
  ]
  const r  = size === 'sm' ? 9  : 13
  const gap = size === 'sm' ? 24 : 33
  const w  = size === 'sm' ? 30 : 42
  const h  = size === 'sm' ? 82 : 112

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={size === 'sm' ? 'h-20' : 'h-28'} role="img" aria-label={`Semáforo de cumplimiento: ${activo}`}>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx={size === 'sm' ? 8 : 11}
        fill="#2a2a32" stroke="#14141a" strokeWidth="1.5" />
      {luces.map((l, i) => {
        const encendida = l.id === activo
        return (
          <circle
            key={l.id}
            cx={w / 2}
            cy={(size === 'sm' ? 18 : 24) + i * gap}
            r={r}
            fill={encendida ? l.color : '#45454f'}
            stroke={encendida ? l.color : '#55555f'}
            strokeWidth="1"
            opacity={encendida ? 1 : 0.45}
          />
        )
      })}
    </svg>
  )
}

// ─── Arco de calificación 0-100 ───────────────────────────────────────────────
function Arco({ pct, color }) {
  const cx = 90, cy = 82, ri = 44, ro = 66

  const xy = (deg, radio) => {
    const rad = (deg * Math.PI) / 180
    return [cx + radio * Math.cos(rad), cy - radio * Math.sin(rad)]
  }
  const arco = (desde, hasta) => {
    const a1 = 180 - (desde / 100) * 180
    const a2 = 180 - (hasta / 100) * 180
    const [x1o, y1o] = xy(a1, ro)
    const [x2o, y2o] = xy(a2, ro)
    const [x1i, y1i] = xy(a1, ri)
    const [x2i, y2i] = xy(a2, ri)
    return `M ${x1o} ${y1o} A ${ro} ${ro} 0 0 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${ri} ${ri} 0 0 0 ${x1i} ${y1i} Z`
  }

  return (
    <svg viewBox="0 0 180 100" className="w-full max-w-[190px]">
      <path d={arco(0, 100)} fill="#e4e4ea" />
      {pct > 0 && <path d={arco(0, Math.min(100, pct))} fill={color} />}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="26" fontWeight="700" fill={color}>{Math.round(pct)}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9" fill="#6b6b76">de 100</text>
    </svg>
  )
}

// ─── Barra de un componente de la calificación ────────────────────────────────
function BarraComponente({ label, pct, peso, detalle }) {
  const color = pct >= 80 ? '#1f6d45' : pct >= 50 ? '#c89116' : '#c31b26'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">
          <span className="font-bold" style={{ color }}>{Math.round(pct)}%</span> · peso {peso}%
        </p>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      {detalle && <p className="text-xs text-gray-400 mt-0.5">{detalle}</p>}
    </div>
  )
}

/**
 * Tarjeta de calificación de cumplimiento.
 * @param {object} props.calificacion  resultado de calcularCumplimientoCliente()
 */
export default function SemaforoCumplimiento({ calificacion, titulo = 'Calificación de cumplimiento', subtitulo }) {
  if (!calificacion) return null
  const { score, semaforo, documentacion, informacion, gestiones, faltantes = [] } = calificacion

  return (
    <div className={`card border-2 ${semaforo.fondo} space-y-4`}>
      <div>
        <p className="text-sm font-bold text-gray-800">🚦 {titulo}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {subtitulo || 'Estado del seguimiento de cumplimiento ALA/CFT de este cliente'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
        {/* Semáforo + arco */}
        <div className="flex items-center justify-center gap-4">
          <Semaforo activo={semaforo.id} />
          <div className="flex flex-col items-center">
            <Arco pct={score} color={semaforo.color} />
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: semaforo.color + '22', color: semaforo.color }}>
              {semaforo.label}
            </span>
          </div>
        </div>

        {/* Desglose */}
        <div className="md:col-span-2 space-y-3">
          <BarraComponente
            label="📄 Documentación presentada (checklist)"
            pct={documentacion.pct}
            peso={documentacion.peso}
            detalle={`${documentacion.ok} de ${documentacion.evaluables} documentos recibidos${documentacion.noAplica ? ` · ${documentacion.noAplica} no aplica` : ''}`}
          />
          <BarraComponente
            label="🗂 Información del expediente"
            pct={informacion.pct}
            peso={informacion.peso}
            detalle={`${informacion.ok} de ${informacion.total} campos completos`}
          />
          <BarraComponente
            label="✅ Gestiones de cumplimiento"
            pct={gestiones.pct}
            peso={gestiones.peso}
            detalle={gestiones.campos.map(c => `${c.ok ? '✓' : '✗'} ${c.label}`).join(' · ')}
          />
        </div>
      </div>

      {faltantes.length > 0 && (
        <details className="bg-white/70 rounded-lg border border-gray-200 px-3 py-2">
          <summary className="text-xs font-semibold text-gray-600 cursor-pointer">
            ⚠ {faltantes.length} punto{faltantes.length !== 1 ? 's' : ''} pendiente{faltantes.length !== 1 ? 's' : ''} para llegar a 100
          </summary>
          <ul className="mt-2 space-y-1">
            {faltantes.map((f, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>{f}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/**
 * Versión global: calificación de la cartera completa de clientes del sujeto obligado.
 * @param {object} props.global resultado de calcularCumplimientoGlobal()
 */
export function SemaforoGlobalClientes({ global, nombreSujeto, onVerCliente }) {
  if (!global) return null
  const { score, semaforo, total, distribucion, detalle } = global
  const criticos = detalle.filter(d => d.semaforo.id !== 'verde').slice(0, 5)

  return (
    <div className={`card border-2 ${semaforo.fondo} space-y-4`}>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-bold text-gray-800">🚦 Cumplimiento global de clientes</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {nombreSujeto ? `${nombreSujeto} · ` : ''}{total} cliente{total !== 1 ? 's' : ''} activo{total !== 1 ? 's' : ''} ·
            {' '}Alimenta el ítem 1 del Dashboard de Cumplimiento
          </p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ background: semaforo.color + '22', color: semaforo.color }}>
          {semaforo.label}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
        <div className="flex items-center justify-center gap-4">
          <Semaforo activo={semaforo.id} size="sm" />
          <Arco pct={score} color={semaforo.color} />
        </div>

        {/* Distribución de la cartera */}
        <div className="md:col-span-2 space-y-2">
          {[
            { id: 'verde',    label: 'Cumplimiento adecuado (≥80)', color: '#1f6d45', n: distribucion.verde },
            { id: 'amarillo', label: 'Cumplimiento parcial (50-79)', color: '#c89116', n: distribucion.amarillo },
            { id: 'rojo',     label: 'Cumplimiento crítico (<50)',   color: '#c31b26', n: distribucion.rojo },
          ].map(f => (
            <div key={f.id}>
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-gray-700">{f.label}</p>
                <p className="text-xs font-bold" style={{ color: f.color }}>{f.n}</p>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-0.5">
                <div className="h-1.5 rounded-full" style={{ width: `${total ? (f.n / total) * 100 : 0}%`, background: f.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {criticos.length > 0 && (
        <div className="bg-white/70 rounded-lg border border-gray-200 px-3 py-2">
          <p className="text-xs font-semibold text-gray-600 mb-1.5">Clientes con menor calificación:</p>
          <div className="space-y-1">
            {criticos.map(d => {
              const nombre = d.cliente.nombre_empresa
                || [d.cliente.nombre_cliente, d.cliente.primer_apellido].filter(Boolean).join(' ')
                || d.cliente.numero_identificacion
              return (
                <button
                  key={d.cliente.id}
                  onClick={() => onVerCliente?.(d.cliente)}
                  disabled={!onVerCliente}
                  className="w-full flex items-center justify-between gap-2 text-xs px-2 py-1 rounded hover:bg-white disabled:cursor-default text-left">
                  <span className="text-gray-700 truncate">{nombre}</span>
                  <span className="font-bold flex-shrink-0" style={{ color: d.semaforo.color }}>{d.score}/100</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export { Semaforo, Arco, semaforoDe }
